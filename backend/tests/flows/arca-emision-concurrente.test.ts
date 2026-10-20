import { api, auth, expectStatus } from '../helpers';
import { container } from 'tsyringe';
import { ADMIN_A } from '../fixtures';
import { IAfipConfigRepository } from '../../src/domain/repositories/IAfipConfigRepository';
import { afipService, EmitResult } from '../../src/infrastructure/services/AfipService';
import { pdvService } from '../../src/infrastructure/services/PdvService';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Emisión a ARCA bajo concurrencia. ARCA se simula: lo que se verifica es que
 * el lock + la relectura dentro del lock + la recuperación por FECompConsultar
 * nunca dejen un número autorizado en ARCA sin registrar en la factura.
 */
describe('Flujo crítico: emisión a ARCA concurrente', () => {
  const A = ADMIN_A;
  let pdvId: string;
  let customerId: string;
  let productId: string;
  let lastAuthorized = 0;

  const caeFor = (n: number): EmitResult => ({
    cae: `7000000000${String(n).padStart(4, '0')}`,
    caeExpiry: new Date('2026-12-31'),
    afipCbtNum: n,
    afipPtVenta: 9201,
    observaciones: null,
  });

  async function createDraft(daysAgo = 0): Promise<string> {
    const res = await api
      .post('/api/invoices')
      .set(auth(A))
      .send({
        type: 'FACTURA_B',
        customerId,
        saleCondition: 'CONTADO',
        items: [{ productId, quantity: 1, unitPrice: 100, taxRate: 21 }],
      });
    expectStatus(res, 201);
    // createInvoiceSchema no acepta `date` (la descarta): se fecha directo en la base.
    if (daysAgo) {
      await prisma.invoice.update({
        where: { id: res.body.data.id },
        data: { date: new Date(Date.now() - daysAgo * 86_400_000) },
      });
    }
    return res.body.data.id;
  }

  beforeAll(async () => {
    const pdv = await api.post('/api/pdv').set(auth(A)).send({ number: 9201, name: 'PDV ARCA (test)' });
    expectStatus(pdv, 201);
    pdvId = pdv.body.data.id;

    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente ARCA (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({ sku: `ARCA-${Date.now()}`, name: 'Servicio ARCA (test)', cost: 0, price: 100, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const afipRepo = container.resolve<IAfipConfigRepository>('AfipConfigRepository');
    jest.spyOn(afipRepo, 'getActive').mockResolvedValue({ cuit: '20111111112', isProduction: false } as any);
    jest.spyOn(pdvService, 'getPdvForUser').mockResolvedValue({ id: pdvId, number: 9201, name: 'PDV ARCA (test)' });
    jest.spyOn(afipService, 'getTokenAuth').mockResolvedValue({ token: 't', sign: 's' });
    // "ARCA": último autorizado en memoria; el siguiente es siempre last + 1.
    jest.spyOn(pdvService, 'getNextNumber').mockImplementation(async () => lastAuthorized + 1);
  });

  afterAll(() => jest.restoreAllMocks());

  it('dos pedidos simultáneos de la misma factura obtienen UN solo CAE', async () => {
    const emit = jest.spyOn(afipService, 'emitInvoice').mockImplementation(async (_inv, _cfg, _pdv, n) => {
      await new Promise((r) => setTimeout(r, 300)); // latencia de ARCA
      lastAuthorized = n;
      return caeFor(n);
    });
    const invoiceId = await createDraft();
    const before = lastAuthorized;

    const [r1, r2] = await Promise.all([
      api.post(`/api/afip/invoices/${invoiceId}/emit`).set(auth(A)),
      api.post(`/api/afip/invoices/${invoiceId}/emit`).set(auth(A)),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // El segundo puede cortar antes del lock (ya no está en DRAFT → 400) o
    // dentro del lock al releer (ya tiene CAE → 409); nunca emite.
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(lastAuthorized).toBe(before + 1);

    const check = await api.get(`/api/invoices/${invoiceId}`).set(auth(A));
    expect(check.body.data.cae).toBe(caeFor(before + 1).cae);
    emit.mockRestore();
  });

  it('facturas distintas en el mismo PdV y tipo se numeran en orden, sin repetir', async () => {
    jest.spyOn(afipService, 'emitInvoice').mockImplementation(async (_inv, _cfg, _pdv, n) => {
      if (n !== lastAuthorized + 1) throw new Error('ARCA - Error: [10016] numero fuera de orden');
      await new Promise((r) => setTimeout(r, 100));
      lastAuthorized = n;
      return caeFor(n);
    });
    const ids = await Promise.all([createDraft(), createDraft(), createDraft()]);

    const results = await Promise.all(ids.map((id) => api.post(`/api/afip/invoices/${id}/emit`).set(auth(A))));
    results.forEach((r) => expectStatus(r, 200));

    const nums = results.map((r) => r.body.data.afipCbtNum).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(3);
    expect(nums[2] - nums[0]).toBe(2);
  });

  it('si FECAESolicitar falla pero ARCA lo autorizó, recupera y guarda el CAE', async () => {
    jest.spyOn(afipService, 'emitInvoice').mockImplementation(async (_inv, _cfg, _pdv, n) => {
      lastAuthorized = n; // ARCA lo autorizó...
      throw new Error('timeout of 30000ms exceeded'); // ...pero la respuesta no llegó
    });
    const recover = jest
      .spyOn(afipService, 'findAuthorizedVoucher')
      .mockImplementation(async (_inv, _cfg, _pdv, n) => (n === lastAuthorized ? caeFor(n) : null));
    const invoiceId = await createDraft();

    const res = await api.post(`/api/afip/invoices/${invoiceId}/emit`).set(auth(A));
    expectStatus(res, 200);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(res.body.data.cae).toBe(caeFor(lastAuthorized).cae);
    expect(res.body.data.status).toBe('AUTHORIZED');
  });

  it('si ARCA no lo autorizó, la factura queda sin CAE y el error se propaga', async () => {
    jest.spyOn(afipService, 'emitInvoice').mockRejectedValue(new Error('CAE rechazado por ARCA. Resultado: R.'));
    jest.spyOn(afipService, 'findAuthorizedVoucher').mockResolvedValue(null);
    const invoiceId = await createDraft();

    const res = await api.post(`/api/afip/invoices/${invoiceId}/emit`).set(auth(A));
    expect(res.status).toBeGreaterThanOrEqual(400);

    const check = await api.get(`/api/invoices/${invoiceId}`).set(auth(A));
    expect(check.body.data.cae).toBeFalsy();
    expect(check.body.data.status).toBe('DRAFT');
  });

  describe('lote (POST /api/invoices/emit-batch)', () => {
    // spyOn sobre un método ya espiado devuelve el mismo mock: se limpian las llamadas.
    const okEmit = () => {
      const spy = jest.spyOn(afipService, 'emitInvoice').mockImplementation(async (_inv, _cfg, _pdv, n) => {
        lastAuthorized = n;
        return caeFor(n);
      });
      spy.mockClear();
      return spy;
    };

    it('emite en orden de fecha y saltea las de más de 5 días', async () => {
      const emit = okEmit();
      const today = await createDraft();
      const twoDaysAgo = await createDraft(2);
      const tooOld = await createDraft(8);

      const res = await api
        .post('/api/invoices/emit-batch')
        .set(auth(A))
        .send({ ids: [today, twoDaysAgo, tooOld] });
      expectStatus(res, 200);

      const byId = Object.fromEntries(res.body.data.map((r: any) => [r.id, r]));
      expect(byId[today].outcome).toBe('AUTHORIZED');
      expect(byId[twoDaysAgo].outcome).toBe('AUTHORIZED');
      expect(byId[tooOld].outcome).toBe('SKIPPED');
      expect(byId[tooOld].message).toMatch(/5 días/);
      // La de hace 2 días salió primero: número menor.
      expect(byId[twoDaysAgo].afipCbtNum).toBeLessThan(byId[today].afipCbtNum);
      expect(emit.mock.calls.map((c) => (c[0] as any).id)).toEqual([twoDaysAgo, today]);
    });

    it('con redateToToday pasa a hoy la fecha de las viejas y las emite', async () => {
      okEmit();
      const tooOld = await createDraft(8);

      const res = await api
        .post('/api/invoices/emit-batch')
        .set(auth(A))
        .send({ ids: [tooOld], redateToToday: true });
      expectStatus(res, 200);
      expect(res.body.data[0]).toMatchObject({ outcome: 'AUTHORIZED', redated: true });

      const check = await api.get(`/api/invoices/${tooOld}`).set(auth(A));
      expect(Math.abs(new Date(check.body.data.date).getTime() - Date.now())).toBeLessThan(60_000);
    });

    it('si ARCA deja de responder corta el lote y deja el resto sin procesar', async () => {
      let calls = 0;
      jest.spyOn(afipService, 'emitInvoice').mockImplementation(async (_inv, _cfg, _pdv, n) => {
        calls += 1;
        if (calls >= 2) throw new Error('timeout of 30000ms exceeded');
        lastAuthorized = n;
        return caeFor(n);
      });
      jest.spyOn(afipService, 'findAuthorizedVoucher').mockResolvedValue(null);
      const ids = [await createDraft(3), await createDraft(2), await createDraft(1)];

      const res = await api.post('/api/invoices/emit-batch').set(auth(A)).send({ ids, redateToToday: true });
      expectStatus(res, 200);
      expect(res.body.data.map((r: any) => r.outcome)).toEqual(['AUTHORIZED', 'ERROR', 'NOT_PROCESSED']);
      expect(res.body.data[1].message).toMatch(/ARCA no está disponible/);
      expect(calls).toBe(2);

      // La que falló vuelve a su fecha original (no quedó "pasada a hoy").
      const failed = await api.get(`/api/invoices/${ids[1]}`).set(auth(A));
      expect(failed.body.data.cae).toBeFalsy();
      expect(Date.now() - new Date(failed.body.data.date).getTime()).toBeGreaterThan(86_400_000);

      // Y las dos quedan en el filtro de pendientes de ARCA.
      const pending = await api.get('/api/invoices').query({ pendingArca: 'true', limit: 100 }).set(auth(A));
      expectStatus(pending, 200);
      const pendingIds = pending.body.data.map((i: any) => i.id);
      expect(pendingIds).toEqual(expect.arrayContaining([ids[1], ids[2]]));
      expect(pendingIds).not.toContain(ids[0]);
    });

    it('un emit suelto con ARCA caído responde 503 (no 500)', async () => {
      jest.spyOn(afipService, 'emitInvoice').mockRejectedValue(new Error('connect ECONNREFUSED 200.1.1.1:443'));
      jest.spyOn(afipService, 'findAuthorizedVoucher').mockResolvedValue(null);
      const id = await createDraft();
      const res = await api.post(`/api/invoices/${id}/emit`).set(auth(A));
      expect(res.status).toBe(503);
    });
  });
});
