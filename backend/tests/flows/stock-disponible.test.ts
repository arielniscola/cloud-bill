import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * "Disponible" es siempre `quantity - reservedQuantity`, así que la API tiene
 * que devolver LAS DOS cantidades. `mapStock` dejaba `reservedQuantity` afuera
 * de la entidad y el front hacía `Number(undefined)` → la transferencia de
 * stock mostraba "NaN disponibles" con mercadería en el depósito.
 */
describe('Stock — la API devuelve lo reservado junto a la cantidad', () => {
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(ADMIN_A);

    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `STK-${Date.now()}`,
      name: 'Producto disponible (test)',
      cost: 10, price: 20, taxRate: 0,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const movimiento = await api.post('/api/stock/movement').set(auth(ADMIN_A)).send({
      productId, warehouseId, type: 'PURCHASE', quantity: 109, reason: 'Carga inicial tests',
    });
    expectStatus(movimiento, 201);
  });

  it('GET /stock/:productId/:warehouseId trae quantity y reservedQuantity', async () => {
    const res = await api.get(`/api/stock/${productId}/${warehouseId}`).set(auth(ADMIN_A));
    expectStatus(res, 200);

    const { quantity, reservedQuantity } = res.body.data;
    expect(Number(quantity)).toBe(109);
    expect(reservedQuantity).toBeDefined();
    expect(Number.isFinite(Number(quantity) - Number(reservedQuantity))).toBe(true);
    expect(Number(quantity) - Number(reservedQuantity)).toBe(109);
  });

  it('un producto creado con trackStock=false se guarda como no inventariado (y se puede editar)', async () => {
    const created = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `SRV-${Date.now()}`, name: 'Servicio (test)', cost: 0, price: 100, taxRate: 21, trackStock: false,
    });
    expectStatus(created, 201);
    expect(created.body.data.trackStock).toBe(false);

    const updated = await api.put(`/api/products/${created.body.data.id}`).set(auth(ADMIN_A)).send({ trackStock: true });
    expectStatus(updated, 200);
    expect(updated.body.data.trackStock).toBe(true);
  });

  it('GET /stock/product/:productId también lo trae en cada fila', async () => {
    const res = await api.get(`/api/stock/product/${productId}`).set(auth(ADMIN_A));
    expectStatus(res, 200);

    const rows = res.body.data as Array<{ quantity: unknown; reservedQuantity: unknown }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number.isFinite(Number(r.quantity) - Number(r.reservedQuantity))).toBe(true);
    }
  });
});
