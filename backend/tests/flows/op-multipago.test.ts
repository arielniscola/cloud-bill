import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * Orden de Pago con varias formas de pago (efectivo + transferencia + cheques):
 *  - la suma de las formas de pago (y los cheques) tiene que dar el neto;
 *  - con más de un medio la OP queda MIXED y guarda el desglose;
 *  - el filtro por método encuentra la OP mixta que lo incluye;
 *  - el formato anterior (paymentMethod único) sigue funcionando.
 */
describe('Orden de Pago con varias formas de pago', () => {
  const A = ADMIN_A;
  let supplierId: string;

  async function invoice(number: string, amount: number): Promise<string> {
    const subtotal = Math.round((amount / 1.21) * 100) / 100;
    const res = await api.post('/api/purchase-invoices').set(auth(A)).send({
      supplierId, number, type: 'FACTURA_A', subtotal, taxRate: 21,
      taxAmount: Math.round((amount - subtotal) * 100) / 100, amount, saleCondition: 'CUENTA_CORRIENTE',
    });
    expectStatus(res, 201);
    return res.body.data.id;
  }

  beforeAll(async () => {
    const res = await api.post('/api/suppliers').set(auth(A)).send({ name: 'Proveedor multipago (test)', cuit: '30-71717171-7' });
    expectStatus(res, 201);
    supplierId = res.body.data.id;
  });

  it('rechaza formas de pago que no suman el neto, indicando la diferencia', async () => {
    const inv = await invoice('0009-00000001', 2000);
    const res = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      items: [{ purchaseInvoiceId: inv, amount: 2000 }],
      payments: [{ method: 'CASH', amount: 1200 }, { method: 'BANK_TRANSFER', amount: 700 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/faltan \$100,00/);
  });

  it('efectivo + transferencia + cheque propio: queda MIXED con el desglose', async () => {
    const inv = await invoice('0009-00000002', 3000);
    const res = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      items: [{ purchaseInvoiceId: inv, amount: 3000 }],
      payments: [
        { method: 'CASH', amount: 1000 },
        { method: 'BANK_TRANSFER', amount: 1500, reference: 'TRX-1' },
      ],
      chequesPropios: [{ bank: 'Banco Test', checkNumber: '011-001-12345', amount: 500 }],
    });
    expectStatus(res, 201);
    const op = res.body.data;
    expect(op.paymentMethod).toBe('MIXED');
    const byMethod = Object.fromEntries(op.payments.map((p: any) => [p.method, Number(p.amount)]));
    expect(byMethod).toEqual({ CASH: 1000, BANK_TRANSFER: 1500, CHECK: 500 });
    expect(op.cheques).toHaveLength(1);

    expectStatus(await api.post(`/api/orden-pagos/${op.id}/pay`).set(auth(A)), 200);

    const list = await api.get(`/api/orden-pagos?supplierId=${supplierId}&paymentMethod=BANK_TRANSFER`).set(auth(A));
    expectStatus(list, 200);
    expect(list.body.data.map((o: any) => o.id)).toContain(op.id);
  });

  it('con retenciones las formas de pago suman el NETO (total - retenido)', async () => {
    const inv = await invoice('0009-00000003', 1000);
    const res = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      items: [{ purchaseInvoiceId: inv, amount: 1000 }],
      retenciones: [{ type: 'IIBB', base: 'BRUTO', baseAmount: 1000, percentage: 2, amount: 20 }],
      payments: [{ method: 'CASH', amount: 480 }, { method: 'BANK_TRANSFER', amount: 500 }],
    });
    expectStatus(res, 201);
    expect(Number(res.body.data.amount)).toBe(1000);
    expect(res.body.data.payments.reduce((s: number, p: any) => s + Number(p.amount), 0)).toBeCloseTo(980, 2);
  });

  it('el formato anterior (un solo método) sigue funcionando y guarda una línea', async () => {
    const res = await api.post('/api/orden-pagos').set(auth(A)).send({ supplierId, paymentMethod: 'CASH', amount: 750 });
    expectStatus(res, 201);
    expect(res.body.data.paymentMethod).toBe('CASH');
    expect(res.body.data.payments.map((p: any) => [p.method, Number(p.amount)])).toEqual([['CASH', 750]]);
  });
});
