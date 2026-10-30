import { api, auth, expectStatus, ensureDefaultWarehouse, getStockQty } from '../helpers';
import { ADMIN_A, CLERK_A, OWNER_A, SELLER_A, ADMIN_B } from '../fixtures';

/**
 * Recepción de mercadería con confirmación: lo que carga depósito queda
 * pendiente sin mover stock; un admin la confirma (puede corregir cantidad,
 * lote y vencimiento → recién ahí entra el stock) o la rechaza.
 */
describe('Flujo crítico: recepción de depósito con confirmación del admin', () => {
  let warehouseId: string;
  let supplierId: string;
  let productId: string;
  let lotProductId: string;

  async function receive(user: typeof CLERK_A | typeof ADMIN_A = CLERK_A) {
    const res = await api
      .post('/api/purchase-remitos')
      .set(auth(user))
      .send({
        supplierId,
        warehouseId,
        items: [
          { productId, description: 'Tornillos (test)', quantity: 50, unitPrice: 10 },
          { productId: lotProductId, description: 'Fertilizante (test)', quantity: 20, unitPrice: 100, lotNumber: 'L-001', expiresAt: '2027-12-31' },
        ],
      });
    expectStatus(res, 201);
    return res.body.data as { id: string; status: string; items: Array<{ id: string; productId: string }> };
  }

  const lotsOf = async (pid: string) => {
    const res = await api.get('/api/stock/lots').query({ productId: pid, warehouseId, withStock: 'false' }).set(auth(ADMIN_A));
    expectStatus(res, 200);
    return res.body.data as Array<{ lotNumber: string; quantity: string | number }>;
  };

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(ADMIN_A);
    const supplier = await api.post('/api/suppliers').set(auth(ADMIN_A)).send({ name: `Proveedor recepción ${Date.now()}` });
    expectStatus(supplier, 201);
    supplierId = supplier.body.data.id;
    const p1 = await api.post('/api/products').set(auth(ADMIN_A))
      .send({ sku: `REC-${Date.now()}`, name: 'Tornillos (test)', cost: 10, price: 20, taxRate: 21 });
    expectStatus(p1, 201);
    productId = p1.body.data.id;
    const p2 = await api.post('/api/products').set(auth(ADMIN_A))
      .send({ sku: `REC-L-${Date.now()}`, name: 'Fertilizante (test)', cost: 100, price: 150, taxRate: 21, trackLots: true });
    expectStatus(p2, 201);
    lotProductId = p2.body.data.id;
  });

  it('depósito carga la recepción: queda pendiente y no entra stock', async () => {
    const before = await getStockQty(ADMIN_A, productId, warehouseId);
    const remito = await receive();
    expect(remito.status).toBe('PENDING_CONFIRMATION');
    expect(await getStockQty(ADMIN_A, productId, warehouseId)).toBe(before);

    // Depósito ve el listado y el contador, pero no confirma ni rechaza.
    expectStatus(await api.get('/api/purchase-remitos').query({ status: 'PENDING_CONFIRMATION' }).set(auth(CLERK_A)), 200);
    const count = await api.get('/api/purchase-remitos/pending-count').set(auth(ADMIN_A));
    expect(count.body.data.count).toBeGreaterThanOrEqual(1);
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/confirm`).set(auth(CLERK_A)), 403);
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/reject`).set(auth(CLERK_A)).send({ reason: 'no' }), 403);
    // Otra empresa no la ve.
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/confirm`).set(auth(ADMIN_B)), 404);
  });

  it('lo que carga Admin entra directo, como siempre', async () => {
    const before = await getStockQty(ADMIN_A, productId, warehouseId);
    const remito = await receive(ADMIN_A);
    expect(remito.status).toBe('RECEIVED');
    expect(await getStockQty(ADMIN_A, productId, warehouseId)).toBe(before + 50);
  });

  it('el admin confirma corrigiendo cantidad y lote: entra lo confirmado y queda lo cargado', async () => {
    const before = await getStockQty(ADMIN_A, productId, warehouseId);
    const lotQty = async (lot: string) => Number((await lotsOf(lotProductId)).find((l) => l.lotNumber === lot)?.quantity ?? 0);
    const l001Before = await lotQty('L-001'); // el test anterior ya ingresó L-001 directo
    const remito = await receive();
    const screws = remito.items.find((i) => i.productId === productId)!;
    const fert = remito.items.find((i) => i.productId === lotProductId)!;

    const res = await api
      .post(`/api/purchase-remitos/${remito.id}/confirm`)
      .set(auth(OWNER_A)) // el Dueño hereda ADMIN
      .send({ items: [
        { id: screws.id, quantity: 48 },
        { id: fert.id, quantity: 20, lotNumber: 'L-002', expiresAt: '2028-01-31' },
      ] });
    expectStatus(res, 200);
    expect(res.body.data.status).toBe('RECEIVED');
    expect(res.body.data.confirmedBy.name).toBe(OWNER_A.name);

    expect(await getStockQty(ADMIN_A, productId, warehouseId)).toBe(before + 48);
    // Entró al lote corregido, no al que había cargado depósito.
    expect(await lotQty('L-002')).toBe(20);
    expect(await lotQty('L-001')).toBe(l001Before);

    const line = res.body.data.items.find((i: { id: string }) => i.id === screws.id);
    expect(Number(line.quantity)).toBe(48);
    expect(Number(line.receivedQuantity)).toBe(50);
    const lotLine = res.body.data.items.find((i: { id: string }) => i.id === fert.id);
    expect(lotLine.receivedLotNumber).toBe('L-001');

    // Confirmar dos veces no duplica el stock.
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/confirm`).set(auth(ADMIN_A)), 409);
    expect(await getStockQty(ADMIN_A, productId, warehouseId)).toBe(before + 48);
  });

  it('confirmar sin correcciones toma lo que cargó depósito', async () => {
    const before = await getStockQty(ADMIN_A, productId, warehouseId);
    const remito = await receive();
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/confirm`).set(auth(ADMIN_A)).send({}), 200);
    expect(await getStockQty(ADMIN_A, productId, warehouseId)).toBe(before + 50);
  });

  it('confirmar todo en cero no se permite: se rechaza', async () => {
    const remito = await receive();
    const items = remito.items.map((i) => ({ id: i.id, quantity: 0 }));
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/confirm`).set(auth(ADMIN_A)).send({ items }), 400);
  });

  it('rechazar no mueve stock, guarda el motivo y no se puede vincular a una factura', async () => {
    const before = await getStockQty(ADMIN_A, productId, warehouseId);
    const remito = await receive();

    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/reject`).set(auth(ADMIN_A)).send({ reason: 'x' }), 400);
    const res = await api.post(`/api/purchase-remitos/${remito.id}/reject`).set(auth(ADMIN_A)).send({ reason: 'No es de este proveedor' });
    expectStatus(res, 200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.rejectionReason).toBe('No es de este proveedor');
    expect(await getStockQty(ADMIN_A, productId, warehouseId)).toBe(before);

    // Ya resuelta: no se confirma después.
    expectStatus(await api.post(`/api/purchase-remitos/${remito.id}/confirm`).set(auth(ADMIN_A)), 409);
  });

  it('un vendedor no carga recepciones', async () => {
    const res = await api.post('/api/purchase-remitos').set(auth(SELLER_A))
      .send({ supplierId, warehouseId, items: [{ productId, description: 'x', quantity: 1 }] });
    expectStatus(res, 403);
  });
});
