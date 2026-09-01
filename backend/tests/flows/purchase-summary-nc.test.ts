import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * `syncPurchaseInvoiceMovements` registra una Nota de Crédito de proveedor como
 * CREDIT: resta deuda. Los totales del listado tienen que leerla igual —
 * sumarla en positivo inflaba "Total del filtro" y "Saldo".
 */
describe('Resumen de facturas de compra — la NC resta, no suma', () => {
  let supplierId: string;

  const crear = async (type: string, amount: number, dueDate?: string) => {
    const res = await api.post('/api/purchase-invoices').set(auth(ADMIN_A)).send({
      supplierId,
      number: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      subtotal: amount,
      taxRate: 0,
      taxAmount: 0,
      amount,
      saleCondition: 'CUENTA_CORRIENTE',
      ...(dueDate ? { dueDate } : {}),
    });
    expectStatus(res, 201);
    return res.body.data.id as string;
  };

  const resumen = async () => {
    const res = await api
      .get('/api/purchase-invoices')
      .query({ supplierId, limit: 100 })
      .set(auth(ADMIN_A));
    expectStatus(res, 200);
    return res.body.summary as Record<string, number>;
  };

  beforeAll(async () => {
    const sup = await api
      .post('/api/suppliers')
      .set(auth(ADMIN_A))
      .send({ name: `Proveedor NC ${Date.now()}` });
    expectStatus(sup, 201);
    supplierId = sup.body.data.id;
  });

  it('una factura sola suma al total y al saldo', async () => {
    await crear('FACTURA_A', 100000);
    const s = await resumen();
    expect(s.totalArs).toBeCloseTo(100000, 2);
    expect(s.balanceArs).toBeCloseTo(100000, 2);
  });

  it('una NC posterior descuenta del total y del saldo', async () => {
    await crear('NOTA_CREDITO_A', 30000);
    const s = await resumen();
    // 100.000 de factura − 30.000 de NC
    expect(s.totalArs).toBeCloseTo(70000, 2);
    expect(s.balanceArs).toBeCloseTo(70000, 2);
  });

  it('una ND suma, igual que una factura', async () => {
    await crear('NOTA_DEBITO_A', 5000);
    const s = await resumen();
    expect(s.totalArs).toBeCloseTo(75000, 2);
    expect(s.balanceArs).toBeCloseTo(75000, 2);
  });

  it('una NC vencida no cuenta como deuda vencida', async () => {
    const antes = await resumen();
    await crear('NOTA_CREDITO_A', 9000, '2020-01-01');
    const s = await resumen();

    // No aparece en vencido: una NC no tiene saldo exigible que se atrase.
    expect(s.overdueCount).toBe(antes.overdueCount);
    expect(s.overdueArs).toBeCloseTo(antes.overdueArs, 2);
    // Pero sí bajó el saldo.
    expect(s.balanceArs).toBeCloseTo(antes.balanceArs - 9000, 2);
  });

  it('una factura vencida sí cuenta como deuda vencida', async () => {
    const antes = await resumen();
    await crear('FACTURA_A', 12000, '2020-01-01');
    const s = await resumen();

    expect(s.overdueCount).toBe(antes.overdueCount + 1);
    expect(s.overdueArs).toBeCloseTo(antes.overdueArs + 12000, 2);
  });
});
