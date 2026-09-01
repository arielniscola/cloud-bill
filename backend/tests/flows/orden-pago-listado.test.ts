import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * Listado de órdenes de pago: filtros y totales del período.
 *
 * Lo que se cuida acá:
 *  - `summary` describe TODO el filtro, no la página, y en ARS.
 *  - El filtro de estado (la pestaña) no toca los totales ni los contadores:
 *    si los tocara, elegir "Pagadas" vaciaría el resto de las pestañas.
 *  - Los filtros nuevos (búsqueda, moneda, solo con retención, solo pagos a
 *    cuenta) filtran de verdad y no se pisan entre sí.
 *
 * Todas las consultas van filtradas por proveedor: la base de test es
 * compartida y otras suites cargan sus propias órdenes en la misma empresa.
 */
describe('Listado de órdenes de pago: filtros y totales', () => {
  const A = ADMIN_A;
  let supplierId: string;
  let supplierName: string;
  let opRetencionId: string;
  let opACuentaId: string;
  let opAnuladaId: string;

  const invoiceBody = (number: string, amount: number) => {
    const subtotal = Math.round((amount / 1.21) * 100) / 100;
    return {
      supplierId, number, type: 'FACTURA_A',
      subtotal, taxRate: 21,
      taxAmount: Math.round((amount - subtotal) * 100) / 100,
      amount, saleCondition: 'CUENTA_CORRIENTE',
    };
  };

  const list = async (query: Record<string, unknown> = {}) => {
    const res = await api.get('/api/orden-pagos').set(auth(A)).query({ supplierId, limit: 100, ...query });
    expectStatus(res, 200);
    return res.body;
  };

  beforeAll(async () => {
    supplierName = 'Proveedor Listado OP (test)';
    const supplier = await api.post('/api/suppliers').set(auth(A))
      .send({ name: supplierName, cuit: '30-22222222-2' });
    expectStatus(supplier, 201);
    supplierId = supplier.body.data.id;

    // 1) Factura pagada con retención de IIBB 3% sobre el neto (100.000 → 3.000)
    const inv1 = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0009-00000001', 121000));
    expectStatus(inv1, 201);
    const op1 = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'BANK_TRANSFER',
      items: [{ purchaseInvoiceId: inv1.body.data.id, amount: 121000 }],
      retenciones: [{ type: 'IIBB', base: 'NETO', baseAmount: 100000, percentage: 3, amount: 3000 }],
    });
    expectStatus(op1, 201);
    opRetencionId = op1.body.data.id;
    expectStatus(await api.post(`/api/orden-pagos/${opRetencionId}/pay`).set(auth(A)), 200);

    // 2) Pago a cuenta (sin facturas imputadas), queda EMITTED
    const op2 = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId, paymentMethod: 'CASH', amount: 50000,
    });
    expectStatus(op2, 201);
    opACuentaId = op2.body.data.id;

    // 3) Orden imputada y luego anulada: no debe sumar en ningún total
    const inv3 = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0009-00000003', 10000));
    expectStatus(inv3, 201);
    const op3 = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'CASH',
      items: [{ purchaseInvoiceId: inv3.body.data.id, amount: 10000 }],
    });
    expectStatus(op3, 201);
    opAnuladaId = op3.body.data.id;
    expectStatus(await api.delete(`/api/orden-pagos/${opAnuladaId}`).set(auth(A)), 200);
  });

  it('los totales del período salen de todo el filtro y dejan afuera lo anulado', async () => {
    const { summary, total } = await list();

    expect(total).toBe(3);
    expect(summary.paidArs).toBe(121000);
    expect(summary.paidCount).toBe(1);
    expect(summary.pendingArs).toBe(50000);
    expect(summary.pendingCount).toBe(1);
    // La retención no reduce la deuda: queda como impuesto a depositar.
    expect(summary.retentionArs).toBe(3000);
    expect(summary.retentionCount).toBe(1);
    // El pago a cuenta es la orden sin facturas imputadas; la anulada no cuenta.
    expect(summary.onAccountArs).toBe(50000);
    expect(summary.onAccountCount).toBe(1);
    expect(summary.statusCounts).toEqual({ all: 3, EMITTED: 1, PAID: 1, CANCELLED: 1 });
  });

  it('elegir una pestaña filtra las filas pero no vacía los totales ni los contadores', async () => {
    const paid = await list({ status: 'PAID' });
    expect(paid.total).toBe(1);
    expect(paid.data[0].id).toBe(opRetencionId);
    // Los contadores siguen describiendo el período completo.
    expect(paid.summary.statusCounts).toEqual({ all: 3, EMITTED: 1, PAID: 1, CANCELLED: 1 });
    expect(paid.summary.pendingArs).toBe(50000);

    const cancelled = await list({ status: 'CANCELLED' });
    expect(cancelled.total).toBe(1);
    expect(cancelled.data[0].id).toBe(opAnuladaId);
  });

  it('filtra por retención practicada, por pago a cuenta y por método de pago', async () => {
    const conRetencion = await list({ onlyRetentions: 'true' });
    expect(conRetencion.data.map((o: { id: string }) => o.id)).toEqual([opRetencionId]);

    const aCuenta = await list({ onlyOnAccount: 'true' });
    expect(aCuenta.data.map((o: { id: string }) => o.id)).toEqual([opACuentaId]);

    // "false" es un valor presente en la query: no debe activar el filtro.
    expect((await list({ onlyRetentions: 'false' })).total).toBe(3);

    const efectivo = await list({ paymentMethod: 'CASH' });
    expect(efectivo.total).toBe(2);
  });

  it('busca por número de orden y por nombre de proveedor', async () => {
    const porProveedor = await list({ search: 'Listado OP' });
    expect(porProveedor.total).toBe(3);

    const { data } = await list();
    const numero = data.find((o: { id: string }) => o.id === opACuentaId).number;
    const porNumero = await list({ search: numero });
    expect(porNumero.data.map((o: { id: string }) => o.id)).toEqual([opACuentaId]);

    expect((await list({ search: 'no-existe-este-texto' })).total).toBe(0);
  });

  it('convierte a ARS solo lo que está en otra moneda', async () => {
    // Un proveedor aparte: los totales de este caso no deben mezclarse con los anteriores.
    const s = await api.post('/api/suppliers').set(auth(A))
      .send({ name: 'Proveedor USD Listado (test)', cuit: '30-33333333-3' });
    expectStatus(s, 201);
    const usdSupplierId = s.body.data.id;

    // Factura en USD (100 USD) pagada con una OP liquidada EN PESOS: la orden
    // queda en ARS y con `exchangeRate` cargado, porque lo usa para convertir
    // el ítem. Ese importe ya está en pesos y no se vuelve a multiplicar.
    const invUsd = await api.post('/api/purchase-invoices').set(auth(A)).send({
      supplierId: usdSupplierId, number: '0009-00000010', type: 'FACTURA_A',
      subtotal: 100, taxRate: 0, taxAmount: 0, amount: 100,
      currency: 'USD', exchangeRate: 1000, saleCondition: 'CUENTA_CORRIENTE',
    });
    expectStatus(invUsd, 201);
    const opEnPesos = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId: usdSupplierId,
      paymentMethod: 'BANK_TRANSFER',
      currency: 'ARS',
      exchangeRate: 1000,
      items: [{ purchaseInvoiceId: invUsd.body.data.id, amount: 100000 }],
    });
    expectStatus(opEnPesos, 201);
    expectStatus(await api.post(`/api/orden-pagos/${opEnPesos.body.data.id}/pay`).set(auth(A)), 200);

    // Pago a cuenta en USD: acá sí corresponde convertir (50 USD × 1000).
    const opEnUsd = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId: usdSupplierId, paymentMethod: 'BANK_TRANSFER',
      currency: 'USD', exchangeRate: 1000, amount: 50,
    });
    expectStatus(opEnUsd, 201);

    const res = await api.get('/api/orden-pagos').set(auth(A))
      .query({ supplierId: usdSupplierId, limit: 100 });
    expectStatus(res, 200);
    expect(res.body.summary.paidArs).toBe(100000);
    expect(res.body.summary.pendingArs).toBe(50000);
  });

  it('el filtro "hasta" incluye lo cargado hoy después de medianoche', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const res = await list({ dateFrom: hoy, dateTo: hoy });
    expect(res.total).toBe(3);
  });
});
