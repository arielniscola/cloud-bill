import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A, ADMIN_B } from '../fixtures';

const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/**
 * Lotes y vencimientos: el stock de un producto con `trackLots` se reparte entre
 * lotes. Sin elegir, las salidas toman el que vence antes (salteando vencidos);
 * las anulaciones vuelven al mismo lote; la suma de lotes es siempre el stock.
 */
describe('Stock por lote', () => {
  let warehouseId: string;
  let productId: string;
  let customerId: string;

  const lotMap = async () => {
    const res = await api.get('/api/stock/lots').query({ productId, warehouseId, withStock: 'false' }).set(auth(ADMIN_A));
    expectStatus(res, 200);
    return Object.fromEntries((res.body.data as { lotNumber: string; quantity: number }[]).map((l) => [l.lotNumber, l.quantity]));
  };
  const lotId = async (lotNumber: string) => {
    const res = await api.get('/api/stock/lots').query({ productId, warehouseId, withStock: 'false' }).set(auth(ADMIN_A));
    return (res.body.data as { id: string; lotNumber: string }[]).find((l) => l.lotNumber === lotNumber)!.id;
  };
  const ingreso = async (lotNumber: string | null, expiresAt: string | null, quantity: number) => {
    const res = await api.post('/api/stock/movement').set(auth(ADMIN_A)).send({
      productId, warehouseId, type: 'ADJUSTMENT_IN', quantity,
      ...(lotNumber ? { lots: [{ lotNumber, expiresAt, quantity }] } : {}),
    });
    expectStatus(res, 201);
  };

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(ADMIN_A);
    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `LOT-${Date.now()}`, name: 'Producto con lotes (test)', cost: 10, price: 20, taxRate: 21, trackLots: true,
    });
    expectStatus(product, 201);
    expect(product.body.data.trackLots).toBe(true);
    productId = product.body.data.id;

    const customer = await api.post('/api/customers').set(auth(ADMIN_A)).send({ name: 'Cliente lotes (test)', taxCondition: 'CONSUMIDOR_FINAL' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    await ingreso('L-LEJOS', day(90), 10);
    await ingreso('L-CERCA', day(10), 5);
    await ingreso('L-VENCIDO', day(-5), 3);
    await ingreso(null, null, 2); // sin lote → S/L
  });

  it('cada ingreso queda en su lote, y sin lote va a S/L', async () => {
    expect(await lotMap()).toEqual({ 'L-LEJOS': 10, 'L-CERCA': 5, 'L-VENCIDO': 3, 'S/L': 2 });
  });

  it('sin elegir lote sale el que vence antes, sin tocar el vencido; anular lo devuelve', async () => {
    const remito = await api.post('/api/remitos').set(auth(ADMIN_A)).send({
      customerId, items: [{ productId, quantity: 7 }],
    });
    expectStatus(remito, 201);
    expect(await lotMap()).toMatchObject({ 'L-CERCA': 0, 'L-LEJOS': 8, 'L-VENCIDO': 3 });

    const byRef = await api.get('/api/stock/lots/by-reference').query({ ids: remito.body.data.id }).set(auth(ADMIN_A));
    expectStatus(byRef, 200);
    expect(byRef.body.data.map((l: { lotNumber: string; quantity: number }) => `${l.lotNumber}:${l.quantity}`).sort())
      .toEqual(['L-CERCA:5', 'L-LEJOS:2']);

    expectStatus(await api.post(`/api/remitos/${remito.body.data.id}/cancel`).set(auth(ADMIN_A)), 200);
    expect(await lotMap()).toMatchObject({ 'L-CERCA': 5, 'L-LEJOS': 10 });
  });

  it('el lote elegido se respeta (aunque esté vencido) y no se puede pedir más de lo que tiene', async () => {
    const vencido = await lotId('L-VENCIDO');
    const ok = await api.post('/api/remitos').set(auth(ADMIN_A)).send({
      customerId, items: [{ productId, quantity: 3, lots: [{ lotId: vencido, quantity: 3 }] }],
    });
    expectStatus(ok, 201);
    expect((await lotMap())['L-VENCIDO']).toBe(0);

    const tooMuch = await api.post('/api/remitos').set(auth(ADMIN_A)).send({
      customerId, items: [{ productId, quantity: 1, lots: [{ lotId: vencido, quantity: 1 }] }],
    });
    expectStatus(tooMuch, 400);
  });

  it('la factura usa el lote elegido recién al emitir, y anularla lo devuelve', async () => {
    const lejos = await lotId('L-LEJOS');
    const inv = await api.post('/api/invoices').set(auth(ADMIN_A)).send({
      type: 'FACTURA_B', customerId, saleCondition: 'CONTADO',
      items: [{ productId, quantity: 4, unitPrice: 20, taxRate: 21, lots: [{ lotId: lejos, quantity: 4 }] }],
    });
    expectStatus(inv, 201);
    expect((await lotMap())['L-LEJOS']).toBe(10); // borrador: sin movimientos

    expectStatus(await api.patch(`/api/invoices/${inv.body.data.id}/status`).set(auth(ADMIN_A)).send({ status: 'ISSUED' }), 200);
    expect(await lotMap()).toMatchObject({ 'L-LEJOS': 6, 'L-CERCA': 5 });

    expectStatus(await api.post(`/api/invoices/${inv.body.data.id}/cancel`).set(auth(ADMIN_A)), 200);
    expect((await lotMap())['L-LEJOS']).toBe(10);
  });

  it('la trazabilidad muestra a qué cliente fue el lote', async () => {
    const res = await api.get(`/api/stock/lots/${await lotId('L-VENCIDO')}/trace`).set(auth(ADMIN_A));
    expectStatus(res, 200);
    const outs = res.body.data.movements.filter((m: { outgoing: boolean }) => m.outgoing);
    expect(outs).toHaveLength(1);
    expect(outs[0]).toMatchObject({ documentType: 'REMITO', customerName: 'Cliente lotes (test)', quantity: 3 });
  });

  it('otra empresa no ve los lotes ni su trazabilidad', async () => {
    const list = await api.get('/api/stock/lots').query({ productId }).set(auth(ADMIN_B));
    expectStatus(list, 200);
    expect(list.body.data).toHaveLength(0);
    expectStatus(await api.get(`/api/stock/lots/${await lotId('L-LEJOS')}/trace`).set(auth(ADMIN_B)), 404);
  });

  it('la suma de los lotes es el stock del depósito', async () => {
    const stock = await api.get(`/api/stock/${productId}/${warehouseId}`).set(auth(ADMIN_A));
    const sum = Object.values(await lotMap()).reduce((a, b) => a + b, 0);
    expect(sum).toBe(Number(stock.body.data.quantity));
  });

  it('activar lotes en un producto con stock deja todo en S/L', async () => {
    const p = await api.post('/api/products').set(auth(ADMIN_A)).send({ sku: `LOT2-${Date.now()}`, name: 'Sin lotes (test)', cost: 1, price: 2, taxRate: 21 });
    expectStatus(p, 201);
    expectStatus(await api.post('/api/stock/movement').set(auth(ADMIN_A)).send({ productId: p.body.data.id, warehouseId, type: 'ADJUSTMENT_IN', quantity: 8 }), 201);
    expectStatus(await api.put(`/api/products/${p.body.data.id}`).set(auth(ADMIN_A)).send({ trackLots: true }), 200);
    const res = await api.get('/api/stock/lots').query({ productId: p.body.data.id }).set(auth(ADMIN_A));
    expect(res.body.data.map((l: { lotNumber: string; quantity: number }) => [l.lotNumber, l.quantity])).toEqual([['S/L', 8]]);
  });
});
