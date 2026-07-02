import { api, auth, expectStatus, ensureDefaultWarehouse, getStockQty } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * Flujo crítico: orden de pedido → conversión a factura.
 *  - La OP con DISCOUNT descuenta stock al CREARSE (no al convertir).
 *  - La conversión genera la factura fiscal SIN volver a mover stock
 *    y marca la OP como CONVERTED; no se puede convertir dos veces.
 */
describe('Flujo crítico: orden de pedido → factura', () => {
  const A = ADMIN_A;
  let warehouseId: string;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(A);

    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente OP (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({ sku: `OP-${Date.now()}`, name: 'Producto OP (test)', cost: 400, price: 800, taxRate: 21 });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const stockIn = await api
      .post('/api/stock/movement')
      .set(auth(A))
      .send({ productId, warehouseId, type: 'PURCHASE', quantity: 50, reason: 'Carga inicial tests OP' });
    expectStatus(stockIn, 201);
  });

  it('crea la OP (descuenta stock), la convierte a factura una sola vez y sin doble descuento', async () => {
    const stockBefore = await getStockQty(A, productId, warehouseId);

    const created = await api
      .post('/api/orden-pedidos')
      .set(auth(A))
      .send({
        customerId,
        saleCondition: 'CONTADO',
        stockBehavior: 'DISCOUNT',
        items: [
          {
            productId,
            description: 'Producto OP (test)',
            quantity: 5,
            unitPrice: 800,
            taxRate: 21,
            subtotal: 4000,
            taxAmount: 840,
            total: 4840,
          },
        ],
      });
    expectStatus(created, 201);
    const op = created.body.data;
    expect(Number(op.total)).toBeCloseTo(4840, 2);

    // El stock se descuenta al crear la OP
    expect(await getStockQty(A, productId, warehouseId)).toBe(stockBefore - 5);

    const converted = await api
      .post(`/api/orden-pedidos/${op.id}/convert`)
      .set(auth(A))
      .send({ invoiceType: 'FACTURA_B' });
    expect([200, 201]).toContain(converted.status);
    const invoice = converted.body.data;
    expect(invoice.id).toBeDefined();
    expect(Number(invoice.total)).toBeCloseTo(4840, 2);

    // La conversión NO vuelve a mover stock
    expect(await getStockQty(A, productId, warehouseId)).toBe(stockBefore - 5);

    // La OP queda CONVERTED
    const opAfter = await api.get(`/api/orden-pedidos/${op.id}`).set(auth(A));
    expectStatus(opAfter, 200);
    expect(opAfter.body.data.status).toBe('CONVERTED');

    // Reintentar la conversión es rechazado
    const again = await api
      .post(`/api/orden-pedidos/${op.id}/convert`)
      .set(auth(A))
      .send({ invoiceType: 'FACTURA_B' });
    expectStatus(again, 400);
  });

  it('cancelar una OP devuelve el stock descontado', async () => {
    const stockBefore = await getStockQty(A, productId, warehouseId);

    const created = await api
      .post('/api/orden-pedidos')
      .set(auth(A))
      .send({
        customerId,
        saleCondition: 'CONTADO',
        stockBehavior: 'DISCOUNT',
        items: [
          {
            productId,
            description: 'Producto OP (test)',
            quantity: 3,
            unitPrice: 800,
            taxRate: 21,
            subtotal: 2400,
            taxAmount: 504,
            total: 2904,
          },
        ],
      });
    expectStatus(created, 201);
    expect(await getStockQty(A, productId, warehouseId)).toBe(stockBefore - 3);

    const cancelled = await api
      .patch(`/api/orden-pedidos/${created.body.data.id}/status`)
      .set(auth(A))
      .send({ status: 'CANCELLED' });
    expectStatus(cancelled, 200);

    expect(await getStockQty(A, productId, warehouseId)).toBe(stockBefore);
  });
});
