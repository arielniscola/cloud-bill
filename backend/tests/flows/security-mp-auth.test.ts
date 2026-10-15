import crypto from 'crypto';
import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A, ADMIN_B, COMPANY_A, COMPANY_B, SELLER_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';
import { invalidatePlanCache } from '../../src/infrastructure/http/middlewares/featureMiddleware';
import { invalidateUserState } from '../../src/infrastructure/http/middlewares/authMiddleware';
import { MercadoPagoService } from '../../src/infrastructure/services/MercadoPagoService';

const setPlan = async (companyId: string, plan: string) => {
  await prisma.$executeRaw`UPDATE "companies" SET "plan" = ${plan} WHERE id = ${companyId}`;
  invalidatePlanCache(companyId);
};

const planOf = async (companyId: string) =>
  (await prisma.$queryRaw<{ plan: string }[]>`SELECT "plan" FROM "companies" WHERE id = ${companyId}`)[0].plan;

/** Firma como la arma MercadoPago: `id:[data.id];request-id:[x-request-id];ts:[ts];`. */
function mpSignature(dataId: string, requestId: string, secret: string, ts = '1704908010'): string {
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('MercadoPago — firma del webhook', () => {
  it('acepta la firma armada con la plantilla de MP', () => {
    expect(MercadoPagoService.verifySignature(mpSignature('123456', 'req-1', 's3cr3t'), 'req-1', '123456', 's3cr3t')).toBe(true);
  });

  it('pasa el data.id alfanumérico a minúsculas antes de firmar', () => {
    expect(MercadoPagoService.verifySignature(mpSignature('abc123', 'req-1', 's3cr3t'), 'req-1', 'ABC123', 's3cr3t')).toBe(true);
  });

  it('rechaza otro secret, otro id o una firma mal formada', () => {
    const sig = mpSignature('123456', 'req-1', 's3cr3t');
    expect(MercadoPagoService.verifySignature(sig, 'req-1', '123456', 'otro')).toBe(false);
    expect(MercadoPagoService.verifySignature(sig, 'req-1', '999', 's3cr3t')).toBe(false);
    expect(MercadoPagoService.verifySignature('v1=zz', 'req-1', '123456', 's3cr3t')).toBe(false);
  });
});

describe('MercadoPago — webhook y aislamiento entre empresas', () => {
  const SECRET = 'secret-de-prueba';
  let planA: string;
  let planB: string;
  let invoiceB: string;
  let customerB: string;
  let getPayment: jest.SpyInstance;

  const recibosOf = (paymentId: string) =>
    prisma.$queryRaw<{ id: string; companyId: string }[]>`
      SELECT id, "companyId" FROM "recibos" WHERE "mpPaymentId" = ${paymentId}
    `;

  const addPreference = async (externalReference: string) => {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "mp_preferences" ("id","preferenceId","externalReference","type","amount","customerId","userId","status","companyId","createdAt","updatedAt")
      VALUES (${id}, ${`PREF-${id}`}, ${externalReference}, 'INVOICE', ${1210}, ${customerB}, ${ADMIN_B.id}, 'PENDING', ${COMPANY_B}, NOW(), NOW())
    `;
    return id;
  };

  const prefStatus = async (id: string) =>
    (await prisma.$queryRaw<{ status: string }[]>`SELECT status FROM "mp_preferences" WHERE id = ${id}`)[0].status;

  /** El webhook responde 200 y procesa después: se espera a que termine. */
  const waitFor = async (check: () => Promise<boolean>, ms = 8000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  const notify = (paymentId: string, headers: Record<string, string> = {}, company: string | null = COMPANY_B) =>
    api
      .post('/api/mercadopago/webhook')
      .query({ ...(company ? { companyId: company } : {}), 'data.id': paymentId, type: 'payment' })
      .set(headers)
      .send({ type: 'payment', action: 'payment.created', data: { id: paymentId } });

  beforeAll(async () => {
    planA = await planOf(COMPANY_A);
    planB = await planOf(COMPANY_B);
    await setPlan(COMPANY_A, 'ENTERPRISE');
    await setPlan(COMPANY_B, 'ENTERPRISE');
    expectStatus(await api.put('/api/app-settings').set(auth(ADMIN_A)).send({ mpAccessToken: 'TEST-a' }), 200);
    expectStatus(await api.put('/api/app-settings').set(auth(ADMIN_B)).send({ mpAccessToken: 'TEST-b', mpWebhookSecret: null }), 200);

    await ensureDefaultWarehouse(ADMIN_B);
    const customer = await api.post('/api/customers').set(auth(ADMIN_B))
      .send({ name: `Cliente MP ${Date.now()}`, taxCondition: 'CONSUMIDOR_FINAL' });
    expectStatus(customer, 201);
    customerB = customer.body.data.id;
    const product = await api.post('/api/products').set(auth(ADMIN_B))
      .send({ sku: `MP-${Date.now()}`, name: 'Producto MP (test)', cost: 500, price: 1000, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    const invoice = await api.post('/api/invoices').set(auth(ADMIN_B)).send({
      type: 'FACTURA_B', customerId: customerB, saleCondition: 'CONTADO',
      items: [{ productId: product.body.data.id, quantity: 1, unitPrice: 1000, taxRate: 21 }],
    });
    expectStatus(invoice, 201);
    invoiceB = invoice.body.data.id;

    getPayment = jest.spyOn(MercadoPagoService.prototype, 'getPayment').mockImplementation(async (id) => ({
      id: Number(id), status: 'approved', statusDetail: 'accredited',
      externalReference: invoiceB, preferenceId: null, amount: 1210, netAmount: 1210, feesAmount: 0,
      payerEmail: null, paymentMethodId: 'account_money', paymentTypeId: 'account_money',
      dateApproved: new Date().toISOString(), dateCreated: new Date().toISOString(),
    } as any));
  });

  afterAll(async () => {
    getPayment.mockRestore();
    await api.put('/api/app-settings').set(auth(ADMIN_B)).send({ mpAccessToken: null, mpWebhookSecret: null });
    await setPlan(COMPANY_A, planA);
    await setPlan(COMPANY_B, planB);
  });

  it('no deja generar un cobro sobre una factura de otra empresa', async () => {
    for (const path of ['/api/mercadopago/preference', '/api/mercadopago/qr']) {
      const res = await api.post(path).set(auth(ADMIN_A)).send({ invoiceId: invoiceB });
      // /qr corta antes (400) si la empresa no cargó el POS; nunca debe pasar de ahí.
      expect([400, 404]).toContain(res.status);
    }
    const pref = await api.post('/api/mercadopago/preference').set(auth(ADMIN_A)).send({ invoiceId: invoiceB });
    expect(pref.status).toBe(404);

    const link = await api.post('/api/mercadopago/link-payment').set(auth(ADMIN_A))
      .send({ mpPaymentId: '555000111', invoiceId: invoiceB });
    expect(link.status).toBe(404);
    expect(await recibosOf('555000111')).toHaveLength(0);
  });

  it('registra el pago en la empresa que viaja en la URL, una sola vez aunque el aviso llegue repetido', async () => {
    const pref = await addPreference(invoiceB);
    const paymentId = `${Date.now()}1`;

    const responses = await Promise.all([notify(paymentId), notify(paymentId), notify(paymentId)]);
    responses.forEach((r) => expectStatus(r, 200));

    expect(await waitFor(async () => (await prefStatus(pref)) === 'COMPLETED')).toBe(true);
    // Margen para que terminen las entregas que quedaron esperando el lock.
    await new Promise((r) => setTimeout(r, 500));

    const recibos = await recibosOf(paymentId);
    expect(recibos).toHaveLength(1);
    expect(recibos[0].companyId).toBe(COMPANY_B);
    // Ni siquiera un recibo huérfano (sin mpPaymentId) de una entrega paralela.
    expect(await prisma.recibo.count({ where: { invoiceId: invoiceB } })).toBe(1);
  });

  it('sin la empresa en la URL no toca las preferencias de otra empresa', async () => {
    const pref = await addPreference(invoiceB);
    const paymentId = `${Date.now()}2`;
    expectStatus(await notify(paymentId, {}, null), 200);
    await new Promise((r) => setTimeout(r, 600));
    expect(await recibosOf(paymentId)).toHaveLength(0);
    expect(await prefStatus(pref)).toBe('PENDING');
    await prisma.$executeRaw`DELETE FROM "mp_preferences" WHERE id = ${pref}`;
  });

  it('con el secret configurado descarta los avisos sin firma o con firma inválida', async () => {
    expectStatus(await api.put('/api/app-settings').set(auth(ADMIN_B)).send({ mpWebhookSecret: SECRET }), 200);
    const pref = await addPreference(invoiceB);
    const paymentId = `${Date.now()}3`;

    expectStatus(await notify(paymentId), 200);
    expectStatus(await notify(paymentId, { 'x-request-id': 'req-9', 'x-signature': mpSignature(paymentId, 'req-9', 'otro-secret') }), 200);
    await new Promise((r) => setTimeout(r, 600));
    expect(await recibosOf(paymentId)).toHaveLength(0);
    expect(await prefStatus(pref)).toBe('PENDING');

    expectStatus(await notify(paymentId, { 'x-request-id': 'req-9', 'x-signature': mpSignature(paymentId, 'req-9', SECRET) }), 200);
    expect(await waitFor(async () => (await prefStatus(pref)) === 'COMPLETED')).toBe(true);
    expect(await recibosOf(paymentId)).toHaveLength(1);
  });
});

describe('Contabilidad — solo administración y finanzas', () => {
  let plan: string;

  beforeAll(async () => {
    plan = await planOf(COMPANY_A);
    await setPlan(COMPANY_A, 'ENTERPRISE');
  });
  afterAll(() => setPlan(COMPANY_A, plan));

  it('un vendedor lee el plan de cuentas pero no carga asientos ni lo vuelve a sembrar', async () => {
    expectStatus(await api.get('/api/accounting/accounts').set(auth(SELLER_A)), 200);

    expect((await api.get('/api/accounting/journal-entries').set(auth(SELLER_A))).status).toBe(403);
    expect((await api.post('/api/accounting/accounts/seed').set(auth(SELLER_A))).status).toBe(403);
    const entry = await api.post('/api/accounting/journal-entries').set(auth(SELLER_A)).send({
      description: 'No debería entrar',
      lines: [{ accountCode: '1', debit: 1, credit: 0 }, { accountCode: '2', debit: 0, credit: 1 }],
    });
    expect(entry.status).toBe(403);

    expectStatus(await api.get('/api/accounting/journal-entries').set(auth(ADMIN_A)), 200);
  });
});

describe('Sesión — el token no sobrevive al usuario', () => {
  const setUser = async (fields: { isActive?: boolean; role?: string }) => {
    if (fields.isActive !== undefined) {
      await prisma.$executeRaw`UPDATE "users" SET "isActive" = ${fields.isActive} WHERE id = ${SELLER_A.id}`;
    }
    if (fields.role) {
      await prisma.$executeRawUnsafe(`UPDATE "users" SET role = $1::"UserRole" WHERE id = $2`, fields.role, SELLER_A.id);
    }
    invalidateUserState(SELLER_A.id);
  };

  afterAll(() => setUser({ isActive: true, role: 'SELLER' }));

  it('un usuario desactivado deja de entrar con su token vigente', async () => {
    expectStatus(await api.get('/api/customers').set(auth(SELLER_A)), 200);
    await setUser({ isActive: false });
    expect((await api.get('/api/customers').set(auth(SELLER_A))).status).toBe(401);
    await setUser({ isActive: true });
    expectStatus(await api.get('/api/customers').set(auth(SELLER_A)), 200);
  });

  it('el rol que vale es el de la base, no el del token', async () => {
    // El token dice SELLER; en la base pasa a depósito, que no puede cobrar.
    await setUser({ role: 'WAREHOUSE_CLERK' });
    const res = await api.put('/api/app-settings').set(auth({ ...SELLER_A, role: 'ADMIN' as const })).send({});
    expect(res.status).toBe(403);
  });

  it('un token de un usuario que no existe se rechaza', async () => {
    const ghost = { ...SELLER_A, id: '99999999-9999-4999-8999-999999999999' };
    expect((await api.get('/api/customers').set(auth(ghost))).status).toBe(401);
  });
});
