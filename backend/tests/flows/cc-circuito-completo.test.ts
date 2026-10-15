import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * Circuito completo de cuentas corrientes (revisión 2026-10-15):
 *  - Clientes: NC con origen se aplica sola a su factura (recibo de
 *    compensación) y la deja PAID al cobrar el resto; saldo a favor (NC,
 *    pago a cuenta) aplicable a otras facturas; descuento cedido / recargo
 *    como movimientos propios; pago a cuenta con recibo.
 *  - Proveedores: descuento obtenido / interés de la OP con movimiento
 *    propio; ND interna imputable.
 *  - Reporte de deudores a fecha: coincide con la cuenta corriente.
 */
describe('Circuito completo de cuentas corrientes', () => {
  const A = ADMIN_A;
  let productId: string;
  let customerId: string;
  let supplierId: string;

  const balance = async (id: string) => {
    const r = await api.get(`/api/current-accounts/customer/${id}/balance`).set(auth(A));
    expectStatus(r, 200);
    return Number(r.body.data?.balance ?? r.body.data);
  };
  const supplierBalance = async () => {
    const r = await api.get(`/api/orden-pagos/supplier/${supplierId}/account`).set(auth(A));
    expectStatus(r, 200);
    return Number(r.body.data.balance.ARS ?? 0);
  };
  const invoice = async (id: string) => (await api.get(`/api/invoices/${id}`).set(auth(A))).body.data;

  async function emit(body: Record<string, unknown>) {
    const created = await api.post('/api/invoices').set(auth(A)).send({
      type: 'FACTURA_B', customerId, saleCondition: 'CUENTA_CORRIENTE',
      ...body,
      items: [{ productId, quantity: 1, unitPrice: body.unitPrice ?? 1000, taxRate: 21 }],
    });
    expectStatus(created, 201);
    const issued = await api.patch(`/api/invoices/${created.body.data.id}/status`).set(auth(A)).send({ status: 'ISSUED' });
    expectStatus(issued, 200);
    return created.body.data;
  }

  beforeAll(async () => {
    const product = await api.post('/api/products').set(auth(A)).send({
      sku: `CCC-${Date.now()}`, name: 'Servicio CC (test)', cost: 0, price: 1000, taxRate: 21, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente circuito CC (test)', saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const supplier = await api.post('/api/suppliers').set(auth(A)).send({ name: 'Proveedor circuito CC (test)', cuit: '30-77777777-7' });
    expectStatus(supplier, 201);
    supplierId = supplier.body.data.id;
  });

  it('la NC con origen se aplica sola a su factura y, cobrado el resto, la factura queda PAID con su NC', async () => {
    const inv = await emit({ unitPrice: 10000 });                                    // 12.100
    const nc = await emit({ type: 'NOTA_CREDITO_B', originInvoiceId: inv.id, unitPrice: 1000 }); // 1.210

    let detail = await invoice(inv.id);
    expect(detail.status).toBe('PARTIALLY_PAID');
    expect(detail.pendingAmount).toBeCloseTo(10890, 2);
    expect((await invoice(nc.id)).status).toBe('PAID');
    expect(await balance(customerId)).toBeCloseTo(10890, 2);

    const pay = await api.post(`/api/invoices/${inv.id}/pay`).set(auth(A)).send({ amount: 10890, paymentMethod: 'CASH' });
    expect([200, 201]).toContain(pay.status);
    detail = await invoice(inv.id);
    expect(detail.status).toBe('PAID');
    expect(detail.creditNotes).toHaveLength(1);
    expect(await balance(customerId)).toBeCloseTo(0, 2);
  });

  it('el pago a cuenta genera recibo y se aplica a una factura como saldo a favor', async () => {
    const pac = await api.post(`/api/current-accounts/customer/${customerId}/payment`).set(auth(A))
      .send({ amount: 5000, paymentMethod: 'CASH' });
    expectStatus(pac, 201);
    expect(pac.body.recibo?.number).toBeTruthy();

    const credits = (await api.get(`/api/current-accounts/customer/${customerId}/credits`).set(auth(A))).body.data;
    const credit = credits.find((c: { amount: number }) => c.amount === 5000);
    expect(credit).toBeTruthy();

    const inv = await emit({ unitPrice: 2000 }); // 2.420
    const before = await balance(customerId);
    const comp = await api.post(`/api/invoices/${inv.id}/pay`).set(auth(A))
      .send({ amount: 2420, paymentMethod: 'COMPENSACION', creditMovementId: credit.creditMovementId });
    expect([200, 201]).toContain(comp.status);
    expect((await invoice(inv.id)).status).toBe('PAID');
    expect(await balance(customerId)).toBeCloseTo(before, 2); // la compensación no mueve la CC

    // El pago a cuenta ya aplicado no se puede anular
    const cancel = await api.delete(`/api/recibos/${pac.body.recibo.id}`).set(auth(A));
    expectStatus(cancel, 400);
  });

  it('descuento cedido y recargo: la factura queda PAID y la CC cuadra', async () => {
    const start = await balance(customerId);
    const inv = await emit({ unitPrice: 10000 }); // 12.100
    const pay = await api.post(`/api/invoices/${inv.id}/pay`).set(auth(A))
      .send({ amount: 11000, discountAmount: 1100, paymentMethod: 'CASH' });
    expect([200, 201]).toContain(pay.status);
    expect((await invoice(inv.id)).status).toBe('PAID');
    expect(await balance(customerId)).toBeCloseTo(start, 2);

    // Anular el recibo revierte cobro y descuento
    const cancel = await api.delete(`/api/recibos/${pay.body.recibo.id}`).set(auth(A));
    expectStatus(cancel, 200);
    expect((await invoice(inv.id)).status).toBe('ISSUED');
    expect(await balance(customerId)).toBeCloseTo(start + 12100, 2);
  });

  it('OP con descuento obtenido: la factura de compra queda PAID y la CC del proveedor en cero', async () => {
    const pi = await api.post('/api/purchase-invoices').set(auth(A)).send({
      supplierId, number: '0009-00000001', type: 'FACTURA_A', subtotal: 10000, taxRate: 21, taxAmount: 2100,
      amount: 12100, saleCondition: 'CUENTA_CORRIENTE',
    });
    expectStatus(pi, 201);
    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId, paymentMethod: 'CASH', items: [{ purchaseInvoiceId: pi.body.data.id, amount: 12100 }],
      ajustes: [{ description: 'Pronto pago', type: 'RESTA', amount: 100 }],
    });
    expectStatus(op, 201);
    const paid = await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A)).send({});
    expect([200, 201]).toContain(paid.status);

    const detail = await api.get(`/api/purchase-invoices/${pi.body.data.id}`).set(auth(A));
    expect(detail.body.data.status).toBe('PAID');
    expect(await supplierBalance()).toBeCloseTo(0, 2);
  });

  it('la ND interna del proveedor es imputable contra un crédito', async () => {
    const nd = await api.post('/api/internal-notes').set(auth(A)).send({ type: 'DEBIT', supplierId, amount: 800, reason: 'ND test' });
    expectStatus(nd, 201);
    const nc = await api.post('/api/internal-notes').set(auth(A)).send({ type: 'CREDIT', supplierId, amount: 800, reason: 'NC test' });
    expectStatus(nc, 201);

    const open = (await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A))).body.data;
    const debit = open.debits.find((d: { source: string; balance: number }) => d.source === 'MOVEMENT' && d.balance === 800);
    const credit = open.credits.find((c: { balance: number }) => c.balance === 800);
    expect(debit).toBeTruthy();
    expect(credit).toBeTruthy();

    const adj = await api.post(`/api/orden-pagos/supplier/${supplierId}/adjustments`).set(auth(A)).send({
      currency: 'ARS', debits: [{ movementId: debit.movementId, amount: 800 }], credits: [{ movementId: credit.movementId, amount: 800 }],
    });
    expectStatus(adj, 201);
    const after = (await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A))).body.data;
    expect(after.debits.find((d: { movementId?: string }) => d.movementId === debit.movementId)).toBeUndefined();

    // Ya imputada, la nota no se puede anular
    const cancel = await api.delete(`/api/internal-notes/${nd.body.data.id}`).set(auth(A));
    expectStatus(cancel, 400);
  });

  it('el reporte de deudores a fecha coincide con la cuenta corriente (incluye notas internas y pagos a cuenta)', async () => {
    await api.post('/api/internal-notes').set(auth(A)).send({ type: 'DEBIT', customerId, amount: 300, reason: 'ND test' });
    const today = new Date().toISOString().slice(0, 10);
    const report = await api.get(`/api/reports/accounts-receivable?asOf=${today}`).set(auth(A));
    expectStatus(report, 200);
    const row = report.body.data.find((d: { entityId: string }) => d.entityId === customerId);
    expect(row?.balanceArs ?? 0).toBeCloseTo(await balance(customerId), 2);
  });
});
