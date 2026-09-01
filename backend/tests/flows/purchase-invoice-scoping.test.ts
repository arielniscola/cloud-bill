import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B } from '../fixtures';

/**
 * Las FKs que llegan por el body (`supplierId`, `originInvoiceId`, `remitoIds`)
 * apuntan a filas que pueden ser de otra empresa. El `companyId` de la factura
 * no las protege: hay que validarlas una por una.
 */
describe('Factura de compra — aislamiento de referencias entre empresas', () => {
  let supplierA: string;
  let supplierB: string;
  let invoiceA: string;
  let invoiceB: string;

  beforeAll(async () => {
    const mkSupplier = async (user: typeof ADMIN_A, name: string) => {
      const res = await api.post('/api/suppliers').set(auth(user)).send({ name });
      expectStatus(res, 201);
      return res.body.data.id as string;
    };

    const mkInvoice = async (user: typeof ADMIN_A, supplierId: string, number: string) => {
      const res = await api.post('/api/purchase-invoices').set(auth(user)).send({
        supplierId, number, type: 'FACTURA_A',
        subtotal: 1000, taxRate: 21, taxAmount: 210, amount: 1210,
        saleCondition: 'CUENTA_CORRIENTE',
      });
      expectStatus(res, 201);
      return res.body.data.id as string;
    };

    supplierA = await mkSupplier(ADMIN_A, `Proveedor A ${Date.now()}`);
    supplierB = await mkSupplier(ADMIN_B, `Proveedor B ${Date.now()}`);
    invoiceA = await mkInvoice(ADMIN_A, supplierA, `A-${Date.now()}`);
    invoiceB = await mkInvoice(ADMIN_B, supplierB, `B-${Date.now()}`);
  });

  it('no permite CREAR una factura contra un proveedor de otra empresa', async () => {
    const res = await api.post('/api/purchase-invoices').set(auth(ADMIN_A)).send({
      supplierId: supplierB, number: `X-${Date.now()}`, type: 'FACTURA_A',
      subtotal: 100, taxRate: 21, taxAmount: 21, amount: 121,
    });
    expect(res.status).toBe(404);
  });

  it('no permite REASIGNAR una factura a un proveedor de otra empresa', async () => {
    const res = await api
      .put(`/api/purchase-invoices/${invoiceA}`)
      .set(auth(ADMIN_A))
      .send({ supplierId: supplierB });
    expect(res.status).toBe(404);

    // Y la factura quedó intacta.
    const check = await api.get(`/api/purchase-invoices/${invoiceA}`).set(auth(ADMIN_A));
    expectStatus(check, 200);
    expect(check.body.data.supplierId).toBe(supplierA);
  });

  it('no permite apuntar originInvoiceId a una factura de otra empresa', async () => {
    const res = await api
      .put(`/api/purchase-invoices/${invoiceA}`)
      .set(auth(ADMIN_A))
      .send({ type: 'NOTA_CREDITO_A', originInvoiceId: invoiceB });
    expect(res.status).toBe(404);
  });

  it('no permite vincular un remito de otra empresa', async () => {
    // Un uuid cualquiera que no es de la empresa A alcanza para el caso:
    // la validación es por (id, companyId), no por existencia.
    const res = await api
      .put(`/api/purchase-invoices/${invoiceA}`)
      .set(auth(ADMIN_A))
      .send({ remitoIds: ['cccccccc-0000-4000-8000-00000000000c'] });
    expect(res.status).toBe(404);
  });

  it('sigue permitiendo editar con referencias de la propia empresa', async () => {
    const res = await api
      .put(`/api/purchase-invoices/${invoiceA}`)
      .set(auth(ADMIN_A))
      .send({ supplierId: supplierA, notes: 'ok' });
    expectStatus(res, 200);
    expect(res.body.data.notes).toBe('ok');
  });
});
