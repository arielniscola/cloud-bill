import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Cuenta corriente de proveedor expresada en PESOS.
 *
 * La imputación manual se carga en ARS y el backend la convierte a la moneda de
 * cada comprobante con la cotización del día:
 *  - Una factura en USD imputada por su equivalente completo en pesos queda PAID
 *    (sin residuos de centavos por el redondeo de la cotización).
 *  - Un pago parcial en pesos deja la factura en PARTIALLY_PAID y el saldo
 *    pendiente sigue viviendo en USD (la base no cambia).
 *  - Cruzar monedas registra el residuo como "Diferencia de cambio".
 */
describe('Cuenta corriente de proveedor en pesos', () => {
  const A = ADMIN_A;
  const RATE = 1480;
  let supplierId: string;

  async function movements(): Promise<Array<{ type: string; amount: number; currency: string; description: string | null }>> {
    const rows = await prisma.$queryRawUnsafe<Array<{ type: string; amount: unknown; currency: string; description: string | null }>>(
      `SELECT type, amount, currency, description FROM "supplier_account_movements"
       WHERE "supplierId" = '${supplierId}' ORDER BY "createdAt" ASC, type ASC`
    );
    return rows.map((r) => ({ type: r.type, amount: Number(r.amount), currency: r.currency, description: r.description }));
  }

  function usdInvoice(number: string, amount: number) {
    const subtotal = Math.round((amount / 1.21) * 100) / 100;
    return {
      supplierId,
      number,
      type: 'FACTURA_A',
      subtotal,
      taxRate: 21,
      taxAmount: Math.round((amount - subtotal) * 100) / 100,
      amount,
      currency: 'USD',
      exchangeRate: 1400,
      saleCondition: 'CUENTA_CORRIENTE',
    };
  }

  beforeAll(async () => {
    const supplier = await api
      .post('/api/suppliers')
      .set(auth(A))
      .send({ name: 'Proveedor USD (test pesos)', cuit: '30-44444444-4' });
    expectStatus(supplier, 201);
    supplierId = supplier.body.data.id;
  });

  it('expone la cotización del día para convertir la deuda', async () => {
    const res = await api.get('/api/exchange-rate').set(auth(A));
    expectStatus(res, 200);
    // Sin salida a internet la fuente puede no responder: el contrato es que
    // devuelve null (la UI cae a mostrar la moneda original), nunca un error.
    if (res.body.data !== null) {
      expect(res.body.data.rate).toBeGreaterThan(0);
      expect(typeof res.body.data.stale).toBe('boolean');
    }
  });

  it('imputa en pesos contra una factura en USD y la cancela sin residuos', async () => {
    const created = await api.post('/api/purchase-invoices').set(auth(A)).send(usdInvoice('0001-00009001', 1000));
    expectStatus(created, 201);
    const invoiceId = created.body.data.id;

    // El movimiento de CC se guarda en la moneda del comprobante.
    expect(await movements()).toEqual([
      expect.objectContaining({ type: 'DEBIT', amount: 1000, currency: 'USD' }),
    ]);

    // Crédito a cuenta en pesos para imputar contra la factura en dólares.
    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId, paymentMethod: 'BANK_TRANSFER', amount: 1_480_000, currency: 'ARS',
    });
    expectStatus(op, 201);
    expectStatus(await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A)), 200);

    const open = await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A));
    expectStatus(open, 200);
    const credit = open.body.data.credits.find((c: { currency: string }) => c.currency === 'ARS');
    expect(credit).toBeTruthy();

    // Imputación EN PESOS: 1000 USD x 1480 = 1.480.000 ARS.
    const adj = await api.post(`/api/orden-pagos/supplier/${supplierId}/adjustments`).set(auth(A)).send({
      currency: 'ARS',
      amountCurrency: 'ARS',
      exchangeRate: RATE,
      debits: [{ purchaseInvoiceId: invoiceId, amount: 1000 * RATE }],
      credits: [{ movementId: credit.movementId, amount: 1000 * RATE }],
    });
    expectStatus(adj, 201);

    // El ítem se guardó en la moneda del comprobante (1000 USD), no en pesos.
    const items = await prisma.$queryRawUnsafe<Array<{ side: string; amount: unknown }>>(
      `SELECT side, amount FROM "supplier_cc_adjustment_items" WHERE "adjustmentId" = '${adj.body.data.id}' ORDER BY side ASC`
    );
    const debitItem = items.find((i) => i.side === 'DEBIT');
    expect(Number(debitItem!.amount)).toBe(1000);

    const detail = await api.get(`/api/purchase-invoices/${invoiceId}`).set(auth(A));
    expectStatus(detail, 200);
    expect(detail.body.data.status).toBe('PAID');
  });

  it('un pago parcial en pesos deja la factura en PARTIALLY_PAID con el saldo en su moneda', async () => {
    const created = await api.post('/api/purchase-invoices').set(auth(A)).send(usdInvoice('0001-00009002', 500));
    expectStatus(created, 201);
    const invoiceId = created.body.data.id;

    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId, paymentMethod: 'BANK_TRANSFER', amount: 296_000, currency: 'ARS',
    });
    expectStatus(op, 201);
    expectStatus(await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A)), 200);

    const open = await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A));
    const credit = open.body.data.credits.find(
      (c: { currency: string; balance: number }) => c.currency === 'ARS' && c.balance >= 296_000
    );
    expect(credit).toBeTruthy();

    // 296.000 ARS / 1480 = 200 USD de los 500 adeudados.
    const adj = await api.post(`/api/orden-pagos/supplier/${supplierId}/adjustments`).set(auth(A)).send({
      currency: 'ARS',
      amountCurrency: 'ARS',
      exchangeRate: RATE,
      debits: [{ purchaseInvoiceId: invoiceId, amount: 296_000 }],
      credits: [{ movementId: credit.movementId, amount: 296_000 }],
    });
    expectStatus(adj, 201);

    const detail = await api.get(`/api/purchase-invoices/${invoiceId}`).set(auth(A));
    expect(detail.body.data.status).toBe('PARTIALLY_PAID');

    const after = await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A));
    const stillOpen = after.body.data.debits.find(
      (d: { purchaseInvoiceId: string }) => d.purchaseInvoiceId === invoiceId
    );
    // El pendiente sigue en USD: 500 - 200 = 300.
    expect(stillOpen.currency).toBe('USD');
    expect(stillOpen.balance).toBeCloseTo(300, 2);
  });

  it('cruzar monedas registra el residuo como diferencia de cambio', async () => {
    const created = await api.post('/api/purchase-invoices').set(auth(A)).send(usdInvoice('0001-00009003', 100));
    expectStatus(created, 201);
    const invoiceId = created.body.data.id;

    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId, paymentMethod: 'BANK_TRANSFER', amount: 100_000, currency: 'ARS',
    });
    expectStatus(op, 201);
    expectStatus(await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A)), 200);

    const open = await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A));
    const credit = open.body.data.credits.find(
      (c: { currency: string; balance: number }) => c.currency === 'ARS' && c.balance >= 100_000
    );

    // Debito 148.000 ARS (100 USD) contra un credito en pesos de 100.000:
    // los 48.000 restantes se cierran como diferencia de cambio.
    const adj = await api.post(`/api/orden-pagos/supplier/${supplierId}/adjustments`).set(auth(A)).send({
      currency: 'ARS',
      amountCurrency: 'ARS',
      exchangeRate: RATE,
      debits: [{ purchaseInvoiceId: invoiceId, amount: 100 * RATE }],
      credits: [{ movementId: credit.movementId, amount: 100_000 }],
      manualAmount: 48_000,
      description: 'cierre',
    });
    expectStatus(adj, 201);

    const all = await movements();
    const diff = all.find((m) => (m.description ?? '').startsWith('Diferencia de cambio'));
    expect(diff).toBeTruthy();
    expect(diff!.amount).toBe(48_000);
    expect(diff!.currency).toBe('ARS');

    const detail = await api.get(`/api/purchase-invoices/${invoiceId}`).set(auth(A));
    expect(detail.body.data.status).toBe('PAID');
  });

  it('rechaza imputar en pesos sin cotizacion', async () => {
    const res = await api.post(`/api/orden-pagos/supplier/${supplierId}/adjustments`).set(auth(A)).send({
      currency: 'ARS',
      amountCurrency: 'ARS',
      debits: [],
      credits: [],
      manualAmount: 100,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
