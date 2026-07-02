import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B } from '../fixtures';

/**
 * Aislamiento multi-tenant: un usuario de la empresa B no puede ver ni operar
 * sobre recursos de la empresa A. El scoping se hace por companyId en la query
 * (findById(id, companyId)) y debe responder 404 — sin filtrar existencia.
 */
describe('Flujo crítico: aislamiento multi-tenant', () => {
  const A = ADMIN_A;
  const B = ADMIN_B;

  let customerId: string;
  let productId: string;
  let warehouseId: string;
  let pdvId: string;
  let invoiceId: string;

  beforeAll(async () => {
    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente Privado A (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({ sku: `MT-${Date.now()}`, name: 'Producto Privado A (test)', cost: 100, price: 200, taxRate: 21 });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const warehouse = await api
      .post('/api/warehouses')
      .set(auth(A))
      .send({ name: 'Depósito Privado A (test)' });
    expectStatus(warehouse, 201);
    warehouseId = warehouse.body.data.id;

    const pdv = await api
      .post('/api/pdv')
      .set(auth(A))
      .send({ number: 9101, name: 'PDV Privado A (test)' });
    expectStatus(pdv, 201);
    pdvId = pdv.body.data.id;

    const invoice = await api
      .post('/api/invoices')
      .set(auth(A))
      .send({
        type: 'FACTURA_B',
        customerId,
        saleCondition: 'CONTADO',
        items: [{ productId, quantity: 1, unitPrice: 200, taxRate: 21 }],
      });
    expectStatus(invoice, 201);
    invoiceId = invoice.body.data.id;
  });

  it('la empresa A ve sus propios recursos por id', async () => {
    for (const path of [
      `/api/customers/${customerId}`,
      `/api/products/${productId}`,
      `/api/warehouses/${warehouseId}`,
      `/api/pdv/${pdvId}`,
      `/api/invoices/${invoiceId}`,
    ]) {
      const res = await api.get(path).set(auth(A));
      expectStatus(res, 200);
    }
  });

  it('la empresa B recibe 404 al pedir recursos de A por id', async () => {
    for (const path of [
      `/api/customers/${customerId}`,
      `/api/products/${productId}`,
      `/api/warehouses/${warehouseId}`,
      `/api/pdv/${pdvId}`,
      `/api/invoices/${invoiceId}`,
    ]) {
      const res = await api.get(path).set(auth(B));
      if (res.status !== 404) {
        throw new Error(`FUGA multi-tenant: GET ${path} como empresa B devolvió ${res.status}`);
      }
    }
  });

  it('los listados de B no incluyen recursos de A', async () => {
    for (const [path, foreignId] of [
      ['/api/customers', customerId],
      ['/api/products', productId],
      ['/api/warehouses', warehouseId],
      ['/api/invoices', invoiceId],
    ] as const) {
      const res = await api.get(path).set(auth(B));
      expectStatus(res, 200);
      expect(JSON.stringify(res.body)).not.toContain(foreignId);
    }
  });

  it('B no puede operar sobre una factura de A (cobrar/emitir)', async () => {
    const pay = await api
      .post(`/api/invoices/${invoiceId}/pay`)
      .set(auth(B))
      .send({ amount: 242, paymentMethod: 'CASH' });
    expect(pay.status).toBeGreaterThanOrEqual(400);

    const status = await api
      .patch(`/api/invoices/${invoiceId}/status`)
      .set(auth(B))
      .send({ status: 'ISSUED' });
    expect(status.status).toBeGreaterThanOrEqual(400);

    // La factura de A sigue intacta (DRAFT, sin cobros)
    const check = await api.get(`/api/invoices/${invoiceId}`).set(auth(A));
    expectStatus(check, 200);
    expect(check.body.data.status).toBe('DRAFT');
  });

  it('un ADMIN solo ve su propia empresa en /api/companies', async () => {
    const { COMPANY_A, COMPANY_B } = await import('../fixtures');

    const list = await api.get('/api/companies').set(auth(B));
    expectStatus(list, 200);
    const ids = (list.body.data as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual([COMPANY_B]);

    const foreign = await api.get(`/api/companies/${COMPANY_A}`).set(auth(B));
    expectStatus(foreign, 404);

    const own = await api.get(`/api/companies/${COMPANY_B}`).set(auth(B));
    expectStatus(own, 200);
  });

  it('B no puede modificar un cliente de A', async () => {
    const res = await api
      .put(`/api/customers/${customerId}`)
      .set(auth(B))
      .send({ name: 'Hackeado por B' });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const check = await api.get(`/api/customers/${customerId}`).set(auth(A));
    expectStatus(check, 200);
    expect(check.body.data.name).toBe('Cliente Privado A (test)');
  });
});
