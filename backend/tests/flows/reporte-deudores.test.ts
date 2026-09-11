import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Reporte de deudores a una FECHA DE CORTE (`/reports/accounts-receivable?asOf=`).
 *
 * Lo que se cuida acá es lo que distingue este reporte del saldo de hoy:
 *  - Una factura cobrada DESPUÉS del corte tiene que seguir figurando como
 *    deuda a esa fecha (no alcanza con mirar el estado actual del comprobante).
 *  - Un comprobante emitido después del corte no puede aparecer.
 *  - La antigüedad se mide contra la fecha de corte, no contra hoy.
 *  - Sin `asOf` el endpoint mantiene su forma original (saldos actuales).
 */
describe('Reporte de deudores a una fecha de corte', () => {
  const A = ADMIN_A;
  let customerId: string;
  let productId: string;

  const CUTOFF = '2026-06-30';

  async function report(query: Record<string, string> = {}) {
    const res = await api.get('/api/reports/accounts-receivable').set(auth(A)).query(query);
    expectStatus(res, 200);
    return res.body;
  }

  /** Fuerza la fecha de un comprobante: los tests necesitan historia, no "hoy". */
  async function setInvoiceDate(id: string, date: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE "invoices" SET date = '${date}'::timestamptz, "dueDate" = '${date}'::timestamptz WHERE id = '${id}'`
    );
  }

  async function issueInvoice(total: number, date: string): Promise<string> {
    const created = await api.post('/api/invoices').set(auth(A)).send({
      type: 'FACTURA_B',
      customerId,
      saleCondition: 'CUENTA_CORRIENTE',
      stockBehavior: 'DISCOUNT',
      items: [{ productId, quantity: 1, unitPrice: total, taxRate: 0 }],
    });
    expectStatus(created, 201);
    const id = created.body.data.id;
    expectStatus(
      await api.patch(`/api/invoices/${id}/status`).set(auth(A)).send({ status: 'ISSUED' }),
      200
    );
    await setInvoiceDate(id, date);
    return id;
  }

  beforeAll(async () => {
    const warehouseId = await ensureDefaultWarehouse(A);

    const customer = await api.post('/api/customers').set(auth(A))
      .send({ name: 'Cliente Deudor (test)', saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api.post('/api/products').set(auth(A)).send({
      sku: `DEU-${Date.now()}`, name: 'Producto Deudores (test)',
      cost: 100, price: 1000, taxRate: 0,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;

    expectStatus(
      await api.post('/api/stock/movement').set(auth(A)).send({
        productId, warehouseId, type: 'PURCHASE', quantity: 1000, reason: 'Carga tests deudores',
      }),
      201
    );
  });

  it('sin asOf mantiene la respuesta original (saldos de hoy, sin antigüedad)', async () => {
    const body = await report();
    expect(body).toHaveProperty('totalBalance');
    expect(body.asOf).toBeUndefined();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('una factura cobrada DESPUÉS del corte sigue siendo deuda a esa fecha', async () => {
    const invoiceId = await issueInvoice(50000, '2026-06-15');

    // Al corte figura impaga.
    const before = await report({ asOf: CUTOFF });
    const row = before.data.find((d: { entityId: string }) => d.entityId === customerId);
    expect(row).toBeTruthy();
    expect(row.balanceArs).toBeCloseTo(50000, 2);

    // Se cobra en julio, después del corte.
    const pay = await api.post(`/api/invoices/${invoiceId}/pay`).set(auth(A)).send({
      amount: 50000, paymentMethod: 'CASH',
    });
    expectStatus(pay, 200);
    await prisma.$executeRawUnsafe(
      `UPDATE "recibos" SET date = '2026-07-10'::timestamptz WHERE "invoiceId" = '${invoiceId}'`
    );

    // Hoy la factura está pagada...
    const detail = await api.get(`/api/invoices/${invoiceId}`).set(auth(A));
    expect(detail.body.data.status).toBe('PAID');

    // ...pero al 30/06 seguía debiéndose: el reporte no mira el estado actual.
    const after = await report({ asOf: CUTOFF });
    const rowAfter = after.data.find((d: { entityId: string }) => d.entityId === customerId);
    expect(rowAfter).toBeTruthy();
    expect(rowAfter.balanceArs).toBeCloseTo(50000, 2);

    // Y a una fecha posterior al cobro ya no figura.
    const later = await report({ asOf: '2026-07-31' });
    const rowLater = later.data.find((d: { entityId: string }) => d.entityId === customerId);
    expect(rowLater?.balanceArs ?? 0).toBeCloseTo(0, 2);
  });

  it('no incluye comprobantes emitidos después del corte', async () => {
    await issueInvoice(80000, '2026-08-20');

    const atCutoff = await report({ asOf: CUTOFF });
    const row = atCutoff.data.find((d: { entityId: string }) => d.entityId === customerId);
    // Solo la de junio (ya cobrada en julio) pesa al 30/06; la de agosto no existe todavía.
    expect(row.balanceArs).toBeCloseTo(50000, 2);

    const later = await report({ asOf: '2026-08-31' });
    const rowLater = later.data.find((d: { entityId: string }) => d.entityId === customerId);
    expect(rowLater.balanceArs).toBeCloseTo(80000, 2);
  });

  it('mide la antigüedad contra la fecha de corte y trae el detalle de comprobantes', async () => {
    const later = await report({ asOf: '2026-08-31' });
    const row = later.data.find((d: { entityId: string }) => d.entityId === customerId);

    // Vencida el 20/08, corte el 31/08 → 11 días, balde 0-30.
    expect(row.oldestDays).toBe(11);
    expect(row.d0_30).toBeCloseTo(80000, 2);
    expect(row.d31_60).toBeCloseTo(0, 2);

    // El detalle permite ver qué comprobantes componen el saldo.
    expect(row.documents).toHaveLength(1);
    expect(row.documents[0].balance).toBeCloseTo(80000, 2);
    expect(row.documents[0].overdueDays).toBe(11);

    // A un corte muy posterior, la misma factura cae en un balde más viejo.
    const muchLater = await report({ asOf: '2026-12-31' });
    const rowOld = muchLater.data.find((d: { entityId: string }) => d.entityId === customerId);
    expect(rowOld.d90plus).toBeCloseTo(80000, 2);
    expect(rowOld.oldestDays).toBeGreaterThan(90);
  });

  it('devuelve los totales por balde y la cotización usada', async () => {
    const body = await report({ asOf: '2026-08-31' });
    expect(body.asOf).toContain('2026-08-31');
    expect(body.side).toBe('customers');
    expect(body.totals).toHaveProperty('d0_30');
    expect(body.totalBalance).toBeGreaterThan(0);
    // La cotización puede ser null si la fuente no responde: la forma importa.
    expect(body).toHaveProperty('exchangeRate');
  });

  it('la solapa de proveedores responde con la misma forma', async () => {
    const body = await report({ asOf: '2026-08-31', side: 'suppliers' });
    expect(body.side).toBe('suppliers');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.totals).toHaveProperty('d90plus');
  });
});
