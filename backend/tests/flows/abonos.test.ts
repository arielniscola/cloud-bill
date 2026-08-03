import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';
import { computeNextRun } from '../../src/infrastructure/services/RecurringInvoiceService';

/**
 * Flujo crítico: facturación recurrente (abonos).
 *  - El abono genera facturas EN BORRADOR (sin stock ni CC hasta emitir).
 *  - El generador es idempotente: una corrida vencida se genera una sola vez
 *    y nextRunAt avanza según la frecuencia.
 *  - "Generar ahora" emite una factura extra sin mover la programación.
 */
describe('Flujo crítico: facturación recurrente (abonos)', () => {
  const A = ADMIN_A;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    await ensureDefaultWarehouse(A);

    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente Abono (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({ sku: `ABO-${Date.now()}`, name: 'Servicio Mensual (test)', cost: 0, price: 10000, taxRate: 21 });
    expectStatus(product, 201);
    productId = product.body.data.id;
  });

  it('computeNextRun respeta frecuencia y dayOfMonth (sin romper en febrero)', () => {
    const from = new Date('2026-01-31T10:00:00Z');
    const monthly = computeNextRun(from, 'MONTHLY', 5);
    expect(monthly.getDate()).toBe(5);
    // 31 sin dayOfMonth → clamp a 28 (febrero nunca rompe)
    const clamped = computeNextRun(from, 'MONTHLY', null);
    expect(clamped.getDate()).toBe(28);
    const weekly = computeNextRun(new Date('2026-07-01T10:00:00Z'), 'WEEKLY', null);
    expect(weekly.getDate()).toBe(8);
  });

  it('abono vencido genera UNA factura en borrador y avanza nextRunAt (idempotente)', async () => {
    // startDate ayer → la corrida ya está vencida
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const created = await api
      .post('/api/recurring-invoices')
      .set(auth(A))
      .send({
        name: 'Abono mensual (test)',
        customerId,
        type: 'FACTURA_B',
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        startDate: yesterday.toISOString(),
        items: [{ productId, quantity: 2, unitPrice: 10000, taxRate: 21 }],
      });
    expectStatus(created, 201);
    const recId = created.body.data.id;

    // Primer pase del generador: genera la factura del período vencido
    const run1 = await api.post('/api/recurring-invoices/generate-due').set(auth(A)).send({});
    expectStatus(run1, 200);
    expect(run1.body.data.errors).toBe(0);
    expect(run1.body.data.generated).toBeGreaterThanOrEqual(1);

    // Segundo pase inmediato: nada nuevo (nextRunAt ya avanzó al mes próximo)
    const run2 = await api.post('/api/recurring-invoices/generate-due').set(auth(A)).send({});
    expectStatus(run2, 200);
    expect(run2.body.data.generated).toBe(0);

    // La factura generada existe, es DRAFT y con el total correcto (2 × 10000 × 1.21)
    const invoices = await api.get('/api/invoices?limit=50').set(auth(A));
    expectStatus(invoices, 200);
    const generated = (invoices.body.data as Array<any>).filter(
      (i) => i.customerId === customerId && i.status === 'DRAFT'
    );
    expect(generated.length).toBe(1);
    expect(Number(generated[0].total)).toBeCloseTo(24200, 1);

    // El abono registró la corrida y programó la próxima (día 10)
    const rec = await api.get(`/api/recurring-invoices/${recId}`).set(auth(A));
    expectStatus(rec, 200);
    expect(rec.body.data.generatedCount).toBe(1);
    expect(new Date(rec.body.data.nextRunAt).getDate()).toBe(10);
    expect(new Date(rec.body.data.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    // "Generar ahora" → factura extra sin tocar la programación
    const runNow = await api.post(`/api/recurring-invoices/${recId}/run`).set(auth(A)).send({});
    expectStatus(runNow, 200);
    const recAfter = await api.get(`/api/recurring-invoices/${recId}`).set(auth(A));
    expect(recAfter.body.data.generatedCount).toBe(2);
    expect(recAfter.body.data.nextRunAt).toBe(rec.body.data.nextRunAt);
  });

  it('multi-tenant: la empresa B no ve los abonos de A', async () => {
    const { ADMIN_B } = await import('../fixtures');
    const listB = await api.get('/api/recurring-invoices').set(auth(ADMIN_B));
    expectStatus(listB, 200);
    const names = (listB.body.data as Array<{ name: string }>).map((r) => r.name);
    expect(names).not.toContain('Abono mensual (test)');
  });
});
