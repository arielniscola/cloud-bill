import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * Antigüedad y resumen de la cuenta corriente de un cliente:
 *  - /current-accounts/stats agrupa la deuda por balde de antigüedad y suma
 *    la cobranza del mes.
 *  - /current-accounts/customer/:id/summary trae esa antigüedad para un solo
 *    cliente, más su comportamiento de pago.
 *  - El extracto acepta filtros (tipo, origen, texto, fechas).
 */
describe('Cuenta corriente: antigüedad y resumen', () => {
  const A = ADMIN_A;
  let customerId: string;
  let productId: string;
  let invoiceTotal: number;

  beforeAll(async () => {
    const warehouseId = await ensureDefaultWarehouse(A);

    const customer = await api
      .post('/api/customers')
      .set(auth(A))
      .send({ name: 'Cliente Antigüedad (test)', saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({ name: 'Producto antigüedad (test)', sku: `AGING-${Date.now()}`, price: 1000, cost: 500 });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const stockIn = await api
      .post('/api/stock/movement')
      .set(auth(A))
      .send({ productId, warehouseId, type: 'PURCHASE', quantity: 50, reason: 'Carga inicial tests' });
    expectStatus(stockIn, 201);

    // Factura de cuenta corriente vencida hace 45 días → balde 31-60.
    const dueDate = new Date(Date.now() - 45 * 86400000).toISOString();
    const invoice = await api
      .post('/api/invoices')
      .set(auth(A))
      .send({
        customerId,
        type: 'FACTURA_B',
        saleCondition: 'CUENTA_CORRIENTE',
        dueDate,
        items: [{ productId, quantity: 2, unitPrice: 1000, taxRate: 21 }],
      });
    expectStatus(invoice, 201);
    invoiceTotal = Number(invoice.body.data.total);

    const issued = await api
      .patch(`/api/invoices/${invoice.body.data.id}/status`)
      .set(auth(A))
      .send({ status: 'ISSUED' });
    expectStatus(issued, 200);
  });

  it('stats agrupa la deuda del cliente en el balde 31-60 días', async () => {
    const res = await api.get('/api/current-accounts/stats').set(auth(A));
    expectStatus(res, 200);

    const row = res.body.data.aging.find((a: any) => a.entityId === customerId);
    expect(row).toBeDefined();
    expect(row.d31_60).toBeCloseTo(invoiceTotal, 2);
    expect(row.total).toBeCloseTo(invoiceTotal, 2);
    expect(row.docCount).toBe(1);
    expect(row.oldestDays).toBeGreaterThanOrEqual(44);
    expect(Array.isArray(res.body.data.collectedThisMonth)).toBe(true);
  });

  it('la antigüedad no mezcla monedas: en USD la deuda en pesos no aparece', async () => {
    const res = await api.get('/api/current-accounts/stats?currency=USD').set(auth(A));
    expectStatus(res, 200);
    expect(res.body.data.aging.find((a: any) => a.entityId === customerId)).toBeUndefined();
  });

  it('summary trae la antigüedad y el comportamiento de pago del cliente', async () => {
    const res = await api.get(`/api/current-accounts/customer/${customerId}/summary`).set(auth(A));
    expectStatus(res, 200);

    expect(res.body.data.aging.entityId).toBe(customerId);
    expect(res.body.data.aging.d31_60).toBeCloseTo(invoiceTotal, 2);
    const invoiced = res.body.data.invoiced90.find((c: any) => c.currency === 'ARS');
    expect(Number(invoiced.total)).toBeCloseTo(invoiceTotal, 2);
    expect(res.body.data).toHaveProperty('avgPaymentDelayDays');
    expect(res.body.data).toHaveProperty('lastInternalNote');
  });

  it('los filtros del extracto acotan los movimientos', async () => {
    const base = `/api/current-accounts/customer/${customerId}/movements?currency=ARS`;

    const debits = await api.get(`${base}&type=DEBIT`).set(auth(A));
    expectStatus(debits, 200);
    expect(debits.body.data.length).toBeGreaterThan(0);
    expect(debits.body.data.every((m: any) => m.type === 'DEBIT')).toBe(true);

    const credits = await api.get(`${base}&type=CREDIT`).set(auth(A));
    expectStatus(credits, 200);
    expect(credits.body.data).toHaveLength(0);
    expect(credits.body.total).toBe(0);

    const byOrigin = await api.get(`${base}&origin=INVOICE`).set(auth(A));
    expectStatus(byOrigin, 200);
    expect(byOrigin.body.data.every((m: any) => m.invoiceId)).toBe(true);

    const noMatch = await api.get(`${base}&search=zzz-no-existe`).set(auth(A));
    expectStatus(noMatch, 200);
    expect(noMatch.body.data).toHaveLength(0);

    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const afterToday = await api.get(`${base}&startDate=${future}`).set(auth(A));
    expectStatus(afterToday, 200);
    expect(afterToday.body.data).toHaveLength(0);
  });

  it('el listado puede incluir los saldos a favor', async () => {
    const res = await api.get('/api/current-accounts?hasDebt=true&includeCredit=true').set(auth(A));
    expectStatus(res, 200);
    expect(res.body.data.some((a: any) => a.customerId === customerId)).toBe(true);
  });
});
