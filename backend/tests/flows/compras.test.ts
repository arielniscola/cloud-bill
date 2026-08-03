import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Flujo crítico de compras (factura standalone → CC proveedor → orden de pago):
 *  - La factura de proveedor en CUENTA_CORRIENTE genera el DEBIT en la cuenta
 *    del proveedor al crearse; en CONTADO no genera movimientos.
 *  - La orden de pago pagada genera el CREDIT y recalcula el estado de la
 *    factura: pago parcial → PARTIALLY_PAID, saldo → PAID, balance CC en 0.
 *  - Una NC de proveedor genera CREDIT (reduce la deuda).
 */
describe('Flujo crítico: compras (factura proveedor → CC → orden de pago)', () => {
  const A = ADMIN_A;
  let supplierId: string;

  async function supplierMovements(): Promise<Array<{ type: string; amount: number }>> {
    const rows = await prisma.$queryRawUnsafe<Array<{ type: string; amount: unknown }>>(
      `SELECT type, amount FROM "supplier_account_movements"
       WHERE "supplierId" = '${supplierId}'
       ORDER BY "createdAt" ASC, type ASC`
    );
    return rows.map((r) => ({ type: r.type, amount: Number(r.amount) }));
  }

  async function getInvoice(id: string): Promise<{ status: string; amount: number }> {
    const res = await api.get(`/api/purchase-invoices/${id}`).set(auth(A));
    expectStatus(res, 200);
    return { status: res.body.data.status, amount: Number(res.body.data.amount) };
  }

  function invoiceBody(number: string, amount: number, extra: Record<string, unknown> = {}) {
    const subtotal = Math.round((amount / 1.21) * 100) / 100;
    return {
      supplierId,
      number,
      type: 'FACTURA_A',
      subtotal,
      taxRate: 21,
      taxAmount: Math.round((amount - subtotal) * 100) / 100,
      amount,
      saleCondition: 'CUENTA_CORRIENTE',
      ...extra,
    };
  }

  beforeAll(async () => {
    const supplier = await api
      .post('/api/suppliers')
      .set(auth(A))
      .send({ name: 'Proveedor Compras (test)', cuit: '30-11111111-1' });
    expectStatus(supplier, 201);
    supplierId = supplier.body.data.id;
  });

  it('factura CUENTA_CORRIENTE genera el DEBIT del proveedor; OP parcial y de saldo la llevan a PARTIALLY_PAID y PAID con balance 0', async () => {
    const created = await api
      .post('/api/purchase-invoices')
      .set(auth(A))
      .send(invoiceBody('0001-00001111', 12100));
    expectStatus(created, 201);
    const invoiceId = created.body.data.id;
    expect(created.body.data.status).toBe('PENDING');

    let movements = await supplierMovements();
    expect(movements).toEqual([{ type: 'DEBIT', amount: 12100 }]);

    // OP parcial (5000)
    const opPartial = await api
      .post('/api/orden-pagos')
      .set(auth(A))
      .send({
        supplierId,
        paymentMethod: 'BANK_TRANSFER',
        items: [{ purchaseInvoiceId: invoiceId, amount: 5000 }],
      });
    expectStatus(opPartial, 201);

    const paidPartial = await api.post(`/api/orden-pagos/${opPartial.body.data.id}/pay`).set(auth(A));
    expectStatus(paidPartial, 200);

    expect((await getInvoice(invoiceId)).status).toBe('PARTIALLY_PAID');
    movements = await supplierMovements();
    expect(movements).toHaveLength(2);
    expect(movements[1]).toEqual({ type: 'CREDIT', amount: 5000 });

    // OP por el saldo (7100)
    const opRest = await api
      .post('/api/orden-pagos')
      .set(auth(A))
      .send({
        supplierId,
        paymentMethod: 'BANK_TRANSFER',
        items: [{ purchaseInvoiceId: invoiceId, amount: 7100 }],
      });
    expectStatus(opRest, 201);

    const paidRest = await api.post(`/api/orden-pagos/${opRest.body.data.id}/pay`).set(auth(A));
    expectStatus(paidRest, 200);

    expect((await getInvoice(invoiceId)).status).toBe('PAID');

    movements = await supplierMovements();
    const balance = movements.reduce((acc, m) => acc + (m.type === 'DEBIT' ? m.amount : -m.amount), 0);
    expect(balance).toBeCloseTo(0, 2);
  });

  it('una nota de crédito de proveedor genera CREDIT (reduce la deuda)', async () => {
    const before = (await supplierMovements()).length;

    const nc = await api
      .post('/api/purchase-invoices')
      .set(auth(A))
      .send(invoiceBody('0001-00002222', 1210, { type: 'NOTA_CREDITO_A' }));
    expectStatus(nc, 201);

    const movements = await supplierMovements();
    expect(movements).toHaveLength(before + 1);
    expect(movements[movements.length - 1]).toEqual({ type: 'CREDIT', amount: 1210 });
  });

  it('factura CONTADO no genera movimientos en la cuenta corriente del proveedor', async () => {
    const before = (await supplierMovements()).length;

    const contado = await api
      .post('/api/purchase-invoices')
      .set(auth(A))
      .send(invoiceBody('0001-00003333', 500, { saleCondition: 'CONTADO' }));
    expectStatus(contado, 201);

    expect(await supplierMovements()).toHaveLength(before);
  });

  it('una OP sin facturas es un pago a cuenta: genera solo el CREDIT por el importe', async () => {
    const before = (await supplierMovements()).length;

    const op = await api
      .post('/api/orden-pagos')
      .set(auth(A))
      .send({ supplierId, paymentMethod: 'CASH', amount: 2000 });
    expectStatus(op, 201);

    const paid = await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A));
    expectStatus(paid, 200);

    const movements = await supplierMovements();
    expect(movements).toHaveLength(before + 1);
    expect(movements[movements.length - 1]).toEqual({ type: 'CREDIT', amount: 2000 });
  });

  it('la retención se descuenta del pago pero cancela la factura por el bruto', async () => {
    // Factura de 121.000 (neto 100.000 + IVA 21.000)
    const created = await api
      .post('/api/purchase-invoices')
      .set(auth(A))
      .send({
        supplierId,
        number: '0001-00002222',
        type: 'FACTURA_A',
        subtotal: 100000,
        taxRate: 21,
        taxAmount: 21000,
        amount: 121000,
        saleCondition: 'CUENTA_CORRIENTE',
      });
    expectStatus(created, 201);
    const invoiceId = created.body.data.id;

    const before = (await supplierMovements()).length;

    // Se paga el total reteniendo IIBB 3% sobre el neto = 3.000
    const op = await api
      .post('/api/orden-pagos')
      .set(auth(A))
      .send({
        supplierId,
        paymentMethod: 'BANK_TRANSFER',
        items: [{ purchaseInvoiceId: invoiceId, amount: 121000 }],
        retenciones: [{
          type: 'IIBB', base: 'NETO', baseAmount: 100000, percentage: 3, amount: 3000,
        }],
      });
    expectStatus(op, 201);

    // `amount` es el bruto imputado; el egreso real es amount - retentionAmount
    expect(Number(op.body.data.amount)).toBe(121000);
    expect(Number(op.body.data.retentionAmount)).toBe(3000);
    expect(op.body.data.retenciones).toHaveLength(1);
    expect(op.body.data.retenciones[0].certificate).toMatch(/^RET-\d{4}-\d{4}$/);

    const paid = await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A));
    expectStatus(paid, 200);

    // La factura queda saldada por el total, no por el neto pagado
    expect((await getInvoice(invoiceId)).status).toBe('PAID');

    // El CREDIT es por el BRUTO (121.000), no por los 118.000 que salieron del banco
    const movements = await supplierMovements();
    expect(movements).toHaveLength(before + 1);
    expect(movements[movements.length - 1]).toEqual({ type: 'CREDIT', amount: 121000 });

    // Y la retención aparece en el reporte de retenciones
    const report = await api.get('/api/purchase-invoices/retenciones').set(auth(A)).query({ limit: 100 });
    expectStatus(report, 200);
    const row = report.body.data.find((r: any) => r.origin === 'ORDEN_PAGO' && Number(r.amount) === 3000);
    expect(row).toBeDefined();
    expect(row.baseKind).toBe('NETO');
    expect(row.invoice.number).toBe(op.body.data.number);
  });

  it('el reporte de retenciones por período trae el detalle, los totales y los códigos ARCA', async () => {
    const invoice = await api
      .post('/api/purchase-invoices')
      .set(auth(A))
      .send({
        supplierId,
        number: '0001-00003333',
        type: 'FACTURA_A',
        subtotal: 200000,
        taxRate: 21,
        taxAmount: 42000,
        amount: 242000,
        saleCondition: 'CUENTA_CORRIENTE',
      });
    expectStatus(invoice, 201);

    // Ganancias 2% sobre el neto = 4.000
    const op = await api
      .post('/api/orden-pagos')
      .set(auth(A))
      .send({
        supplierId,
        paymentMethod: 'BANK_TRANSFER',
        items: [{ purchaseInvoiceId: invoice.body.data.id, amount: 242000 }],
        retenciones: [{
          type: 'GANANCIAS', base: 'NETO', baseAmount: 200000, percentage: 2, amount: 4000,
        }],
      });
    expectStatus(op, 201);

    const today = new Date().toISOString().substring(0, 10);
    const report = await api
      .get('/api/reports/retentions')
      .set(auth(A))
      .query({ dateFrom: today, dateTo: today, type: 'GANANCIAS' });
    expectStatus(report, 200);

    const row = report.body.data.find((r: any) => r.ordenPagoNumber === op.body.data.number);
    expect(row).toBeDefined();
    expect(row.amount).toBe(4000);
    expect(row.baseAmount).toBe(200000);
    expect(row.baseKind).toBe('NETO');
    expect(row.ordenPagoAmount).toBe(242000);      // importe del comprobante para SICORE
    expect(row.arcaImpuesto).toBe('217');          // default por tipo (Ganancias)
    expect(row.certificate).toMatch(/^RET-\d{4}-\d{4}$/);

    // Totales y subtotales por régimen
    expect(report.body.totals.amount).toBeGreaterThanOrEqual(4000);
    const ganancias = report.body.byType.find((t: any) => t.type === 'GANANCIAS');
    expect(ganancias.amount).toBeGreaterThanOrEqual(4000);

    // Fuera del período no devuelve nada
    const empty = await api
      .get('/api/reports/retentions')
      .set(auth(A))
      .query({ dateFrom: '2020-01-01', dateTo: '2020-01-31' });
    expectStatus(empty, 200);
    expect(empty.body.data).toHaveLength(0);
  });

  it('la retención no puede superar el total a pagar', async () => {
    const res = await api
      .post('/api/orden-pagos')
      .set(auth(A))
      .send({
        supplierId,
        paymentMethod: 'CASH',
        amount: 1000,
        retenciones: [{ type: 'IIBB', base: 'BRUTO', baseAmount: 1000, percentage: 200, amount: 2000 }],
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('multi-tenant: la empresa B no ve la factura de proveedor de A', async () => {
    const { ADMIN_B } = await import('../fixtures');
    const list = await api.get('/api/purchase-invoices').set(auth(ADMIN_B));
    expectStatus(list, 200);
    expect(JSON.stringify(list.body)).not.toContain(supplierId);
  });
});
