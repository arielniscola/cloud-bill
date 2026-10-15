import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, COMPANY_A, SELLER_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';
import { invalidatePlanCache } from '../../src/infrastructure/http/middlewares/featureMiddleware';

/**
 * La configuración la lee cualquier usuario autenticado, así que las
 * credenciales (SMTP, MercadoPago) no pueden viajar en la respuesta.
 */
describe('Configuración — los secretos no salen del backend', () => {
  const SECRETS = { smtpPass: 'clave-smtp-123', mpAccessToken: 'TEST-token-123', mpWebhookSecret: 'secret-hook-123' };

  it('guarda los secretos pero solo informa si están cargados', async () => {
    const put = await api.put('/api/app-settings').set(auth(ADMIN_A)).send(SECRETS);
    expectStatus(put, 200);

    for (const res of [put, await api.get('/api/app-settings').set(auth(SELLER_A))]) {
      expectStatus(res, 200);
      expect(JSON.stringify(res.body)).not.toMatch(/clave-smtp-123|TEST-token-123|secret-hook-123/);
      expect(res.body.data).not.toHaveProperty('smtpPass');
      expect(res.body.data).not.toHaveProperty('mpAccessToken');
      expect(res.body.data).not.toHaveProperty('mpWebhookSecret');
      expect(res.body.data).toMatchObject({ smtpPassSet: true, mpAccessTokenSet: true, mpWebhookSecretSet: true });
    }
  });

  it('un secreto vacío u omitido conserva el guardado; null lo borra', async () => {
    const keep = await api.put('/api/app-settings').set(auth(ADMIN_A)).send({ smtpPass: '', smtpHost: 'smtp.test' });
    expectStatus(keep, 200);
    expect(keep.body.data).toMatchObject({ smtpPassSet: true, mpAccessTokenSet: true, smtpHost: 'smtp.test' });

    const clear = await api.put('/api/app-settings').set(auth(ADMIN_A)).send({ smtpPass: null });
    expectStatus(clear, 200);
    expect(clear.body.data).toMatchObject({ smtpPassSet: false, mpAccessTokenSet: true });
  });
});

/** Los filtros del listado de asientos llegan del query string. */
describe('Asientos contables — filtros parametrizados', () => {
  const list = (qs: string) => api.get(`/api/accounting/journal-entries?${qs}`).set(auth(ADMIN_A));
  let previousPlan: string;

  const setPlan = async (plan: string) => {
    await prisma.$executeRaw`UPDATE "companies" SET "plan" = ${plan} WHERE id = ${COMPANY_A}`;
    invalidatePlanCache(COMPANY_A);
  };

  beforeAll(async () => {
    const rows = await prisma.$queryRaw<{ plan: string }[]>`SELECT "plan" FROM "companies" WHERE id = ${COMPANY_A}`;
    previousPlan = rows[0].plan;
    await setPlan('ENTERPRISE'); // la contabilidad es del plan ENTERPRISE

    // Con al menos un asiento cargado, un `OR '1'='1'` que colara devolvería filas.
    expectStatus(await api.post('/api/accounting/accounts/seed').set(auth(ADMIN_A)), 200);
    const accounts = await api.get('/api/accounting/accounts').set(auth(ADMIN_A));
    const [a, b] = accounts.body.data.filter((acc: any) => acc.isActive !== false).slice(-2);
    const entry = await api.post('/api/accounting/journal-entries').set(auth(ADMIN_A)).send({
      description: 'Asiento de prueba',
      lines: [
        { accountCode: a.code, debit: 100, credit: 0 },
        { accountCode: b.code, debit: 0, credit: 100 },
      ],
    });
    expectStatus(entry, 201);
  });

  afterAll(async () => {
    await setPlan(previousPlan);
  });

  it('trata una comilla o un OR inyectado como texto, no como SQL', async () => {
    const all = await list('limit=200');
    expectStatus(all, 200);
    expect(all.body.total).toBeGreaterThan(0);

    for (const payload of ["x' OR '1'='1", "x'; DROP TABLE journal_entries; --", "'"]) {
      const res = await list(`referenceType=${encodeURIComponent(payload)}`);
      expectStatus(res, 200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
    }

    const after = await list('limit=200');
    expectStatus(after, 200);
    expect(after.body.total).toBe(all.body.total);
  });

  it('ignora fechas inválidas y acota el tamaño de página', async () => {
    const res = await list('dateFrom=no-es-fecha&limit=999999&page=-3');
    expectStatus(res, 200);
    expect(res.body.limit).toBe(200);
    expect(res.body.page).toBe(1);
  });
});

/** El body se parsea antes de autenticar: el tope general tiene que ser chico. */
describe('Tamaño del body', () => {
  const relleno = 'x'.repeat(2 * 1024 * 1024);

  it('rechaza con 413 un JSON grande en una ruta común, aun sin sesión', async () => {
    const res = await api.post('/api/auth/login').send({ username: 'a', password: relleno });
    expect(res.status).toBe(413);
  });

  it('lo acepta en las rutas de importación', async () => {
    const res = await api.post('/api/customers/import').set(auth(ADMIN_A)).send({ relleno });
    expect(res.status).not.toBe(413);
  });

  it('responde 400 a un JSON mal formado', async () => {
    const res = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":');
    expect(res.status).toBe(400);
  });
});
