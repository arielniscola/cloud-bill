import { api, auth, expectStatus, ensureDefaultWarehouse, getStockQty } from '../helpers';
import { ADMIN_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Flujo crítico de ventas:
 *  - La factura nace en DRAFT sin mover stock ni cuenta corriente.
 *  - Al emitirse (ISSUED) descuenta stock del almacén default; solo la venta
 *    en CUENTA_CORRIENTE genera el DEBIT en la cuenta del cliente.
 *  - El cobro genera recibo; el pago parcial deja PARTIALLY_PAID.
 */
describe('Flujo crítico: ventas (factura → emisión → stock/CC → cobro)', () => {
  const A = ADMIN_A;
  let warehouseId: string;
  let productId: string;
  let customerContadoId: string;
  let customerCCId: string;

  async function ccMovements(customerId: string): Promise<Array<{ type: string; amount: number }>> {
    const rows = await prisma.$queryRawUnsafe<Array<{ type: string; amount: unknown }>>(
      `SELECT am.type, am.amount
       FROM "account_movements" am
       JOIN "current_accounts" ca ON ca.id = am."currentAccountId"
       WHERE ca."customerId" = '${customerId}'
       ORDER BY am."createdAt" ASC`
    );
    return rows.map((r) => ({ type: r.type, amount: Number(r.amount) }));
  }

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(A);

    const customer1 = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente Contado (test)' });
    expectStatus(customer1, 201);
    customerContadoId = customer1.body.data.id;

    const customer2 = await api
      .post('/api/customers')
      .set(auth(A))
      .send({ name: 'Cliente Cta Cte (test)', saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer2, 201);
    customerCCId = customer2.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({ sku: `VTA-${Date.now()}`, name: 'Producto Ventas (test)', cost: 500, price: 1000, taxRate: 21 });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const stockIn = await api
      .post('/api/stock/movement')
      .set(auth(A))
      .send({ productId, warehouseId, type: 'PURCHASE', quantity: 100, reason: 'Carga inicial tests' });
    expectStatus(stockIn, 201);
  });

  it('factura CONTADO: DRAFT no mueve nada; ISSUED descuenta stock sin tocar CC; el cobro total la deja PAID con recibo', async () => {
    const stockBefore = await getStockQty(A, productId, warehouseId);

    const created = await api
      .post('/api/invoices')
      .set(auth(A))
      .send({
        type: 'FACTURA_B',
        customerId: customerContadoId,
        saleCondition: 'CONTADO',
        stockBehavior: 'DISCOUNT',
        items: [{ productId, quantity: 10, unitPrice: 1000, taxRate: 21 }],
      });
    expectStatus(created, 201);
    const invoice = created.body.data;
    expect(invoice.status).toBe('DRAFT');
    // 10 × 1000 + 21% IVA
    expect(Number(invoice.total)).toBeCloseTo(12100, 2);

    // Borrador: sin movimiento de stock ni de cuenta corriente
    expect(await getStockQty(A, productId, warehouseId)).toBe(stockBefore);
    expect(await ccMovements(customerContadoId)).toHaveLength(0);

    const issued = await api
      .patch(`/api/invoices/${invoice.id}/status`)
      .set(auth(A))
      .send({ status: 'ISSUED' });
    expectStatus(issued, 200);

    // Emisión: descuenta stock; CONTADO sigue sin generar CC
    expect(await getStockQty(A, productId, warehouseId)).toBe(stockBefore - 10);
    expect(await ccMovements(customerContadoId)).toHaveLength(0);

    const paid = await api
      .post(`/api/invoices/${invoice.id}/pay`)
      .set(auth(A))
      .send({ amount: Number(invoice.total), paymentMethod: 'CASH' });
    expectStatus(paid, 200);

    const after = await api.get(`/api/invoices/${invoice.id}`).set(auth(A));
    expectStatus(after, 200);
    expect(after.body.data.status).toBe('PAID');

    const recibos = await prisma.$queryRawUnsafe<Array<{ status: string; amount: unknown }>>(
      `SELECT status, amount FROM "recibos" WHERE "invoiceId" = '${invoice.id}'`
    );
    expect(recibos).toHaveLength(1);
    expect(recibos[0].status).toBe('EMITTED');
    expect(Number(recibos[0].amount)).toBeCloseTo(12100, 2);
  });

  it('factura CUENTA_CORRIENTE: la emisión genera DEBIT; pago parcial deja PARTIALLY_PAID y el saldo la completa a PAID', async () => {
    const created = await api
      .post('/api/invoices')
      .set(auth(A))
      .send({
        type: 'FACTURA_B',
        customerId: customerCCId,
        saleCondition: 'CUENTA_CORRIENTE',
        stockBehavior: 'DISCOUNT',
        items: [{ productId, quantity: 5, unitPrice: 1000, taxRate: 21 }],
      });
    expectStatus(created, 201);
    const invoice = created.body.data;
    const total = Number(invoice.total); // 6050

    const issued = await api
      .patch(`/api/invoices/${invoice.id}/status`)
      .set(auth(A))
      .send({ status: 'ISSUED' });
    expectStatus(issued, 200);

    let movements = await ccMovements(customerCCId);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toEqual({ type: 'DEBIT', amount: total });

    // Pago parcial
    const partial = await api
      .post(`/api/invoices/${invoice.id}/pay`)
      .set(auth(A))
      .send({ amount: 3000, paymentMethod: 'CASH' });
    expectStatus(partial, 200);

    let current = await api.get(`/api/invoices/${invoice.id}`).set(auth(A));
    expect(current.body.data.status).toBe('PARTIALLY_PAID');

    movements = await ccMovements(customerCCId);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toEqual({ type: 'CREDIT', amount: 3000 });

    // Saldo restante
    const rest = await api
      .post(`/api/invoices/${invoice.id}/pay`)
      .set(auth(A))
      .send({ amount: total - 3000, paymentMethod: 'CASH' });
    expectStatus(rest, 200);

    current = await api.get(`/api/invoices/${invoice.id}`).set(auth(A));
    expect(current.body.data.status).toBe('PAID');

    movements = await ccMovements(customerCCId);
    expect(movements).toHaveLength(3);
    const balance = movements.reduce((acc, m) => acc + (m.type === 'DEBIT' ? m.amount : -m.amount), 0);
    expect(balance).toBeCloseTo(0, 2);
  });
});
