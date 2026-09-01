import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/** Hoy como día calendario argentino — lo mismo que manda el DateInput del front. */
function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Las facturas guardan un timestamp, pero el filtro llega como `YYYY-MM-DD`.
 * Parsearlo con `new Date()` daba medianoche UTC, así que un `lte` descartaba
 * el día entero que el usuario había pedido.
 */
describe('Listado de facturas — filtro "hasta" incluye el día pedido', () => {
  let customerId: string;
  let productId: string;
  let invoiceId: string;

  beforeAll(async () => {
    await ensureDefaultWarehouse(ADMIN_A);

    const customer = await api
      .post('/api/customers')
      .set(auth(ADMIN_A))
      .send({ name: `Cliente filtro ${Date.now()}`, taxCondition: 'CONSUMIDOR_FINAL' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(ADMIN_A))
      .send({ sku: `FLT-${Date.now()}`, name: 'Producto filtro (test)', cost: 500, price: 1000, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const created = await api.post('/api/invoices').set(auth(ADMIN_A)).send({
      type: 'FACTURA_B',
      customerId,
      saleCondition: 'CONTADO',
      items: [{ productId, quantity: 1, unitPrice: 1000, taxRate: 21 }],
    });
    expectStatus(created, 201);
    invoiceId = created.body.data.id;
  });

  it('una factura emitida hoy aparece filtrando "hasta hoy"', async () => {
    const hoy = hoyEnArgentina();
    const res = await api
      .get('/api/invoices')
      .query({ customerId, dateTo: hoy, limit: 100 })
      .set(auth(ADMIN_A));
    expectStatus(res, 200);
    expect(res.body.data.map((i: { id: string }) => i.id)).toContain(invoiceId);
  });

  it('también aparece con el rango "desde hoy hasta hoy"', async () => {
    const hoy = hoyEnArgentina();
    const res = await api
      .get('/api/invoices')
      .query({ customerId, dateFrom: hoy, dateTo: hoy, limit: 100 })
      .set(auth(ADMIN_A));
    expectStatus(res, 200);
    expect(res.body.data.map((i: { id: string }) => i.id)).toContain(invoiceId);
  });

  it('los totales de /stats cuentan el mismo conjunto que el listado', async () => {
    const hoy = hoyEnArgentina();
    const q = { customerId, dateFrom: hoy, dateTo: hoy };

    const [list, stats] = await Promise.all([
      api.get('/api/invoices').query({ ...q, limit: 100 }).set(auth(ADMIN_A)),
      api.get('/api/invoices/stats').query(q).set(auth(ADMIN_A)),
    ]);
    expectStatus(list, 200);
    expectStatus(stats, 200);

    expect(stats.body.data.count).toBe(list.body.total);
    expect(stats.body.data.count).toBeGreaterThan(0);
  });

  it('no aparece filtrando hasta el día anterior', async () => {
    const ayer = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const res = await api
      .get('/api/invoices')
      .query({ customerId, dateTo: ayer, limit: 100 })
      .set(auth(ADMIN_A));
    expectStatus(res, 200);
    expect(res.body.data.map((i: { id: string }) => i.id)).not.toContain(invoiceId);
  });
});
