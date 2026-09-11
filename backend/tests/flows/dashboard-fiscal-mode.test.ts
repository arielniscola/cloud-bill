import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * Estadísticas del panel: modo fiscal y monedas.
 *
 *  - En modo ALL (header `X-Fiscal-Mode: ALL`) el backend deja `req.fiscalMode`
 *    en undefined. Las consultas que interpolaban ese undefined generaban
 *    `"fiscalMode" = NULL`, que en Postgres no matchea NADA: el panel devolvía
 *    listas vacías y totales incompletos justo en el modo que tiene que mostrar
 *    todo. ALL tiene que dar FORMAL + INFORMAL.
 *  - Los totales se publican en una sola cifra en pesos, así que una factura en
 *    dólares tiene que entrar convertida por su cotización (antes las ventas
 *    filtraban `currency = 'ARS'` y la dejaban afuera).
 */
describe('Dashboard — modo fiscal y conversión a pesos', () => {
  let customerId: string;
  let productId: string;

  const stats = async (mode: 'FORMAL' | 'INFORMAL' | 'ALL') => {
    const res = await api.get('/api/dashboard/stats').set(auth(ADMIN_A)).set('X-Fiscal-Mode', mode);
    expectStatus(res, 200);
    return res.body.data as {
      ventasMes: { total: number; count: number };
      comprasMes: { total: number; count: number };
      customersWithDebt: unknown[];
      recentOrdenPedidos: unknown[];
    };
  };

  /** Crea la factura y la emite: recién emitida cuenta como venta del mes. */
  const emitir = async (
    mode: 'FORMAL' | 'INFORMAL',
    currency: 'ARS' | 'USD',
    exchangeRate: number,
    unitPrice: number,
    saleCondition: 'CONTADO' | 'CUENTA_CORRIENTE' = 'CONTADO',
  ) => {
    const create = await api.post('/api/invoices').set(auth(ADMIN_A)).set('X-Fiscal-Mode', mode).send({
      type: 'FACTURA_B',
      customerId,
      saleCondition,
      currency,
      exchangeRate,
      items: [{ productId, quantity: 1, unitPrice, taxRate: 0 }],
    });
    expectStatus(create, 201);

    const issue = await api
      .patch(`/api/invoices/${create.body.data.id}/status`)
      .set(auth(ADMIN_A))
      .set('X-Fiscal-Mode', mode)
      .send({ status: 'ISSUED' });
    expectStatus(issue, 200);
    return create.body.data.id as string;
  };

  beforeAll(async () => {
    const warehouseId = await ensureDefaultWarehouse(ADMIN_A);

    const customer = await api.post('/api/customers').set(auth(ADMIN_A)).send({
      name: `Cliente dashboard ${Date.now()}`,
      taxCondition: 'CONSUMIDOR_FINAL',
    });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `DASH-${Date.now()}`,
      name: 'Producto dashboard (test)',
      cost: 100, price: 200, taxRate: 0, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;

    // Emitir la factura descuenta stock (stockBehavior DISCOUNT por defecto).
    const stockIn = await api.post('/api/stock/movement').set(auth(ADMIN_A)).send({
      productId, warehouseId, type: 'PURCHASE', quantity: 100, reason: 'Carga inicial tests',
    });
    expectStatus(stockIn, 201);
  });

  it('ALL suma FORMAL + INFORMAL y el dólar entra convertido', async () => {
    const [beforeFormal, beforeInformal, beforeAll_] = await Promise.all([
      stats('FORMAL'), stats('INFORMAL'), stats('ALL'),
    ]);

    await emitir('FORMAL',   'ARS', 1,    100_000);
    await emitir('FORMAL',   'USD', 1_000,     100);  // 100 USD → 100.000 ARS
    await emitir('INFORMAL', 'ARS', 1,     50_000, 'CUENTA_CORRIENTE');

    const [afterFormal, afterInformal, afterAll] = await Promise.all([
      stats('FORMAL'), stats('INFORMAL'), stats('ALL'),
    ]);

    const delta = (a: { ventasMes: { total: number } }, b: { ventasMes: { total: number } }) =>
      Math.round(a.ventasMes.total - b.ventasMes.total);

    expect(delta(afterFormal, beforeFormal)).toBe(200_000);
    expect(delta(afterInformal, beforeInformal)).toBe(50_000);
    expect(delta(afterAll, beforeAll_)).toBe(250_000);
  });

  it('la nota de crédito de venta resta del mes y no suma como una venta más', async () => {
    const before = await stats('FORMAL');

    const facturaId = await emitir('FORMAL', 'ARS', 1, 80_000);
    const nc = await api.post('/api/invoices').set(auth(ADMIN_A)).set('X-Fiscal-Mode', 'FORMAL').send({
      type: 'NOTA_CREDITO_B',
      customerId,
      originInvoiceId: facturaId,
      saleCondition: 'CONTADO',
      currency: 'ARS',
      exchangeRate: 1,
      items: [{ productId, quantity: 1, unitPrice: 30_000, taxRate: 0 }],
    });
    expectStatus(nc, 201);
    const emitNc = await api
      .patch(`/api/invoices/${nc.body.data.id}/status`)
      .set(auth(ADMIN_A))
      .set('X-Fiscal-Mode', 'FORMAL')
      .send({ status: 'ISSUED' });
    expectStatus(emitNc, 200);

    const after = await stats('FORMAL');
    // 80.000 de factura − 30.000 de NC, y la NC no cuenta como comprobante vendido
    expect(Math.round(after.ventasMes.total - before.ventasMes.total)).toBe(50_000);
    expect(after.ventasMes.count - before.ventasMes.count).toBe(1);
  });

  it('la nota de crédito de compra resta de las compras del mes', async () => {
    const before = await stats('FORMAL');

    const supplier = await api.post('/api/suppliers').set(auth(ADMIN_A))
      .send({ name: `Proveedor dashboard ${Date.now()}` });
    expectStatus(supplier, 201);

    const comprobante = async (type: string, amount: number) => {
      const res = await api.post('/api/purchase-invoices').set(auth(ADMIN_A)).set('X-Fiscal-Mode', 'FORMAL').send({
        supplierId: supplier.body.data.id,
        number: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        subtotal: amount, taxRate: 0, taxAmount: 0, amount,
        saleCondition: 'CUENTA_CORRIENTE',
      });
      expectStatus(res, 201);
    };

    await comprobante('FACTURA_A', 100_000);
    await comprobante('NOTA_CREDITO_A', 30_000);

    const after = await stats('FORMAL');
    expect(Math.round(after.comprasMes.total - before.comprasMes.total)).toBe(70_000);
    expect(after.comprasMes.count - before.comprasMes.count).toBe(1);
  });

  it('las listas de detalle no se vacían en modo ALL', async () => {
    // La factura de cuenta corriente del test anterior dejó saldo INFORMAL.
    const informal = await stats('INFORMAL');
    const todos    = await stats('ALL');

    expect(informal.customersWithDebt.length).toBeGreaterThan(0);
    expect(todos.customersWithDebt.length).toBeGreaterThanOrEqual(informal.customersWithDebt.length);
  });
});
