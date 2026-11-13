import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A, ADMIN_B, COMPANY_A, TEST_PASSWORD } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';
import { invalidateAllUserStates } from '../../src/infrastructure/http/middlewares/authMiddleware';

/**
 * Regresiones de la auditoría (puntos 7, 8 y 9):
 *  - sesiones: empresa desactivada, tokens viejos tras cambiar la contraseña,
 *    cambio de la propia contraseña y login que no delata qué usuarios existen;
 *  - el listado/detalle de facturas no escribe;
 *  - conversión de orden de pedido y alta de factura no dejan datos a medias.
 */
describe('Seguridad: sesiones', () => {
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const hash = bcrypt.hashSync(TEST_PASSWORD, 4);

  async function createUser(opts: { companyId: string | null; role?: string; isActive?: boolean }) {
    const id = randomUUID();
    const username = `sess.${id.slice(0, 8)}`;
    await prisma.$executeRaw`
      INSERT INTO "users" (id, username, password, name, role, "isActive", "companyId", "createdAt", "updatedAt")
      VALUES (${id}, ${username}, ${hash}, 'Usuario sesiones (test)', ${opts.role ?? 'SELLER'}::"UserRole",
              ${opts.isActive ?? true}, ${opts.companyId}, NOW(), NOW())
    `;
    return { id, username, role: opts.role ?? 'SELLER', companyId: opts.companyId ?? undefined };
  }

  const login = (username: string, password: string) =>
    api.post('/api/auth/login').send({ username, password });

  it('el login no distingue usuario inexistente de contraseña incorrecta ni delata cuentas desactivadas', async () => {
    const inactive = await createUser({ companyId: COMPANY_A, isActive: false });

    const noUser = await login('no.existe.nadie', 'cualquiera-123');
    const badPass = await login(ADMIN_A.username, 'incorrecta-123');
    const inactiveBadPass = await login(inactive.username, 'incorrecta-123');
    for (const res of [noUser, badPass, inactiveBadPass]) {
      expectStatus(res, 401);
      expect(res.body.message).toBe('Credenciales inválidas');
    }

    // Solo quien conoce la contraseña se entera de que la cuenta está desactivada.
    const inactiveOk = await login(inactive.username, TEST_PASSWORD);
    expectStatus(inactiveOk, 401);
    expect(inactiveOk.body.message).toBe('La cuenta está desactivada');
  });

  it('desactivar la empresa corta el login y las sesiones abiertas', async () => {
    const companyId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "companies" (id, name, "taxCondition", "isActive", "enabledModules", "createdAt", "updatedAt")
      VALUES (${companyId}, 'Empresa a desactivar (test)', 'RESPONSABLE_INSCRIPTO', true, 'ALL', NOW(), NOW())
    `;
    const user = await createUser({ companyId, role: 'ADMIN' });

    const ok = await login(user.username, TEST_PASSWORD);
    expectStatus(ok, 200);
    const token = ok.body.data.token as string;
    expectStatus(await api.get('/api/customers').set(bearer(token)), 200);

    await prisma.$executeRaw`UPDATE "companies" SET "isActive" = false WHERE id = ${companyId}`;
    invalidateAllUserStates(); // lo que hace PUT /api/companies/:id

    expectStatus(await api.get('/api/customers').set(bearer(token)), 401);
    const blocked = await login(user.username, TEST_PASSWORD);
    expectStatus(blocked, 401);
    expect(blocked.body.message).toBe('La empresa está desactivada');
  });

  it('el usuario cambia su contraseña: la sesión actual sigue y las anteriores se cierran', async () => {
    const user = await createUser({ companyId: COMPANY_A });
    const first = await login(user.username, TEST_PASSWORD);
    expectStatus(first, 200);
    const oldToken = first.body.data.token as string;

    // La contraseña actual es obligatoria y tiene que ser la correcta.
    const wrong = await api.patch('/api/users/me/password').set(bearer(oldToken))
      .send({ currentPassword: 'no-es-esta', newPassword: 'NuevaClave123!' });
    expectStatus(wrong, 400);
    expectStatus(await api.patch('/api/users/me/password').set(bearer(oldToken))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'corta' }), 400);

    const changed = await api.patch('/api/users/me/password').set(bearer(oldToken))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NuevaClave123!' });
    expectStatus(changed, 200);
    const newToken = changed.body.data.token as string;

    expectStatus(await api.get('/api/customers').set(bearer(oldToken)), 401);
    expectStatus(await api.get('/api/customers').set(bearer(newToken)), 200);

    expectStatus(await login(user.username, TEST_PASSWORD), 401);
    expectStatus(await login(user.username, 'NuevaClave123!'), 200);
  });

  it('cuando el SUPER_ADMIN cambia la contraseña de un usuario, sus tokens dejan de servir', async () => {
    const superAdmin = await createUser({ companyId: null, role: 'SUPER_ADMIN' });
    const user = await createUser({ companyId: COMPANY_A });
    const session = await login(user.username, TEST_PASSWORD);
    expectStatus(session, 200);
    const token = session.body.data.token as string;

    // Un ADMIN no puede usar la ruta de administración, ni siquiera sobre sí mismo.
    expectStatus(await api.patch(`/api/users/${user.id}/password`).set(auth(ADMIN_A)).send({ password: 'OtraClave123!' }), 403);

    expectStatus(await api.patch(`/api/users/${user.id}/password`).set(auth(superAdmin)).send({ password: 'OtraClave123!' }), 200);
    expectStatus(await api.get('/api/customers').set(bearer(token)), 401);
  });
});

describe('Integridad: facturas sin datos a medias', () => {
  const A = ADMIN_A;
  let customerId: string;
  let productId: string;

  const item = () => ({
    productId, description: 'Servicio integridad (test)', quantity: 1, unitPrice: 1000, taxRate: 21,
    subtotal: 1000, taxAmount: 210, total: 1210,
  });

  beforeAll(async () => {
    await ensureDefaultWarehouse(A);
    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente integridad (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;
    const product = await api.post('/api/products').set(auth(A)).send({
      sku: `INTEG-${Date.now()}`, name: 'Servicio integridad (test)', cost: 100, price: 1000, taxRate: 21, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;
  });

  it('la factura de una orden de pedido nace emitida y dos conversiones simultáneas generan una sola', async () => {
    const created = await api.post('/api/orden-pedidos').set(auth(A)).send({
      customerId, saleCondition: 'CONTADO', items: [item()],
    });
    expectStatus(created, 201);
    const opId = created.body.data.id as string;

    const results = await Promise.all([
      api.post(`/api/orden-pedidos/${opId}/convert`).set(auth(A)).send({ invoiceType: 'FACTURA_B' }),
      api.post(`/api/orden-pedidos/${opId}/convert`).set(auth(A)).send({ invoiceType: 'FACTURA_B' }),
    ]);
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(1);
    expect(ok[0].body.data.status).not.toBe('DRAFT');

    const invoices = await prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status::text AS status FROM "invoices" WHERE "ordenPedidoId" = ${opId}
    `;
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).not.toBe('DRAFT');

    const op = await prisma.$queryRaw<{ status: string; invoiceId: string | null }[]>`
      SELECT status, "invoiceId" FROM "orden_pedidos" WHERE id = ${opId}
    `;
    expect(op[0]).toEqual({ status: 'CONVERTED', invoiceId: invoices[0].id });
  });

  it('leer facturas no las modifica', async () => {
    const created = await api.post('/api/invoices').set(auth(A)).send({
      type: 'FACTURA_B', customerId, saleCondition: 'CONTADO', items: [item()],
    });
    expectStatus(created, 201);
    const id = created.body.data.id as string;
    const snapshot = () => prisma.$queryRaw<{ status: string; updatedAt: Date }[]>`
      SELECT status::text AS status, "updatedAt" FROM "invoices" WHERE id = ${id}
    `;
    const before = await snapshot();

    expectStatus(await api.get('/api/invoices?limit=50').set(auth(A)), 200);
    expectStatus(await api.get(`/api/invoices/${id}`).set(auth(A)), 200);

    expect(await snapshot()).toEqual(before);
  });

  it('el alta de factura rechaza un depósito de otra empresa y no deja el borrador creado', async () => {
    const warehouseB = await ensureDefaultWarehouse(ADMIN_B);
    const count = async () => {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "invoices" WHERE "customerId" = ${customerId}
      `;
      return rows[0].n;
    };
    const before = await count();

    const res = await api.post('/api/invoices').set(auth(A)).send({
      type: 'FACTURA_B', customerId, saleCondition: 'CONTADO', warehouseId: warehouseB, items: [item()],
    });
    expectStatus(res, 404);
    expect(await count()).toBe(before);
  });
});
