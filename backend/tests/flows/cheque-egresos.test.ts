import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B, SELLER_A } from '../fixtures';

/**
 * Egreso de cheques en cartera: el cheque (manual o de cobranza) sale de la
 * cartera con un motivo parametrizable y queda registrado quién y cuándo.
 * Anular el egreso lo devuelve a cartera.
 */
describe('Flujo crítico: egreso de cheques en cartera', () => {
  const A = ADMIN_A;
  const tag = Date.now().toString().slice(-6);
  let reasonId: string;
  let chequeId: string;
  let reciboId: string;

  beforeAll(async () => {
    const cheque = await api.post('/api/cheques').set(auth(A)).send({
      type: 'INGRESO', checkNumber: `011-001-${tag}`, bank: 'Banco Nación', amount: 50000, issuer: 'Librador Egreso SA', dueDate: '2099-12-31',
    });
    expectStatus(cheque, 201);
    chequeId = cheque.body.data.id;

    // Cheque recibido en una cobranza (recibo con CHECK).
    const product = await api.post('/api/products').set(auth(A)).send({ sku: `EGR-${tag}`, name: 'Servicio egreso (test)', cost: 0, price: 1000, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    const customer = await api.post('/api/customers').set(auth(A)).send({ name: `Cliente egreso ${tag}`, saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer, 201);
    const inv = await api.post('/api/invoices').set(auth(A)).send({
      type: 'FACTURA_B', customerId: customer.body.data.id, saleCondition: 'CUENTA_CORRIENTE',
      items: [{ productId: product.body.data.id, quantity: 1, unitPrice: 1000, taxRate: 21 }],
    });
    expectStatus(inv, 201);
    expectStatus(await api.patch(`/api/invoices/${inv.body.data.id}/status`).set(auth(A)).send({ status: 'ISSUED' }), 200);
    const pay = await api.post(`/api/invoices/${inv.body.data.id}/pay`).set(auth(A)).send({
      amount: 1210, paymentMethod: 'CHECK', reference: `285-002-R${tag}`, bank: 'Banco Galicia', checkDueDate: '2099-12-31',
    });
    expect([200, 201]).toContain(pay.status);
    reciboId = pay.body.recibo.id;
  });

  it('los motivos vienen precargados y son parametrizables por empresa', async () => {
    const list = await api.get('/api/cheque-egreso-reasons').set(auth(A));
    expectStatus(list, 200);
    expect(list.body.data.map((r: { name: string }) => r.name)).toContain('Cambio por efectivo');

    const created = await api.post('/api/cheque-egreso-reasons').set(auth(A)).send({ name: `  Pago a  terceros ${tag} ` });
    expectStatus(created, 201);
    expect(created.body.data.name).toBe(`Pago a terceros ${tag}`);
    reasonId = created.body.data.id;
    expectStatus(await api.post('/api/cheque-egreso-reasons').set(auth(A)).send({ name: `PAGO A TERCEROS ${tag}` }), 409);
    expectStatus(await api.post('/api/cheque-egreso-reasons').set(auth(SELLER_A)).send({ name: 'Otro' }), 403);
  });

  it('la búsqueda en cartera trae cheques manuales y de cobranzas', async () => {
    const byNumber = await api.get('/api/cheques/cartera').query({ search: tag }).set(auth(A));
    expectStatus(byNumber, 200);
    const sources = byNumber.body.data.map((c: { source: string }) => c.source).sort();
    expect(sources).toEqual(['CHEQUE', 'RECIBO']);

    const byHolder = await api.get('/api/cheques/cartera').query({ search: 'Librador Egreso' }).set(auth(A));
    expect(byHolder.body.data.some((c: { id: string }) => c.id === chequeId)).toBe(true);
  });

  it('egresa un cheque manual con motivo, usuario y fecha; no se puede egresar dos veces', async () => {
    const res = await api.post('/api/cheques/egresos').set(auth(A)).send({ source: 'CHEQUE', id: chequeId, reasonId, date: '2026-11-01', notes: 'Se cambió en financiera' });
    expectStatus(res, 201);
    expect(res.body.data).toMatchObject({ reasonName: `Pago a terceros ${tag}`, date: '2026-11-01', status: 'ACTIVE', amount: 50000, holder: 'Librador Egreso SA' });
    expect(res.body.data.user.id).toBe(A.id);

    const cheque = await api.get(`/api/cheques/${chequeId}`).set(auth(A));
    expect(cheque.body.data.status).toBe('EGRESADO');
    expectStatus(await api.post('/api/cheques/egresos').set(auth(A)).send({ source: 'CHEQUE', id: chequeId, reasonId }), 409);

    // Ya no figura en cartera.
    const cartera = await api.get('/api/cheques/cartera').query({ search: tag }).set(auth(A));
    expect(cartera.body.data.some((c: { id: string }) => c.id === chequeId)).toBe(false);
  });

  it('valida motivo, fecha, empresa y roles', async () => {
    expectStatus(await api.post('/api/cheques/egresos').set(auth(A)).send({ source: 'RECIBO', id: reciboId }), 400);
    expectStatus(await api.post('/api/cheques/egresos').set(auth(A)).send({ source: 'RECIBO', id: reciboId, reasonId, date: '2099-01-01' }), 400);
    expectStatus(await api.post('/api/cheques/egresos').set(auth(SELLER_A)).send({ source: 'RECIBO', id: reciboId, reasonId }), 403);
    const ajeno = (await api.get('/api/cheque-egreso-reasons').set(auth(ADMIN_B))).body.data[0];
    expectStatus(await api.post('/api/cheques/egresos').set(auth(A)).send({ source: 'RECIBO', id: reciboId, reasonId: ajeno.id }), 404);
    expectStatus(await api.post('/api/cheques/egresos').set(auth(ADMIN_B)).send({ source: 'RECIBO', id: reciboId, reasonId: ajeno.id }), 404);
  });

  it('egresa el cheque de una cobranza y bloquea operarlo mientras esté egresado', async () => {
    const res = await api.post('/api/cheques/egresos').set(auth(A)).send({ source: 'RECIBO', id: reciboId, reasonId });
    expectStatus(res, 201);
    expect(res.body.data.source).toBe('RECIBO');

    expectStatus(await api.patch(`/api/recibos/${reciboId}/check-status`).set(auth(A)).send({ checkStatus: 'DEPOSITED' }), 400);
  });

  it('el historial lista los egresos y anular devuelve el cheque a cartera', async () => {
    const list = await api.get('/api/cheques/egresos').query({ search: tag }).set(auth(A));
    expectStatus(list, 200);
    expect(list.body.total).toBe(2);
    const manual = list.body.data.find((e: { chequeId: string | null }) => e.chequeId === chequeId);
    expect(manual.user.name).toBeTruthy();

    expectStatus(await api.post(`/api/cheques/egresos/${manual.id}/cancel`).set(auth(SELLER_A)).send({}), 403);
    const cancel = await api.post(`/api/cheques/egresos/${manual.id}/cancel`).set(auth(A)).send({ reason: 'Error de carga' });
    expectStatus(cancel, 200);
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect((await api.get(`/api/cheques/${chequeId}`).set(auth(A))).body.data.status).toBe('PENDING');
    expectStatus(await api.post(`/api/cheques/egresos/${manual.id}/cancel`).set(auth(A)).send({}), 409);

    // Un motivo usado no se borra: se desactiva.
    const del = await api.delete(`/api/cheque-egreso-reasons/${reasonId}`).set(auth(A));
    expect(del.body.data).toEqual({ deleted: false, deactivated: true });
  });
});
