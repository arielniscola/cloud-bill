import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * El descuento global en pesos se persiste como el porcentaje equivalente por
 * ítem, que casi nunca es redondo. Con DECIMAL(5,2) se truncaba al guardarlo:
 * el alta salía bien (el repo calcula antes de escribir) pero al reabrir y
 * volver a guardar, updateWithItems recalculaba desde el valor truncado y el
 * total se movía solo.
 */
describe('Factura — el descuento no pierde precisión al guardarse', () => {
  let customerId: string;
  let productId: string;

  // $50.000 de descuento sobre $375.000 = 13,3333…% — el caso que rompía.
  const BASE = 375000;
  const DESCUENTO = 50000;
  const PCT = (DESCUENTO / BASE) * 100;
  const NETO = BASE - DESCUENTO;
  const TOTAL = NETO * 1.21;

  const cuerpo = () => ({
    type: 'FACTURA_B' as const,
    customerId,
    saleCondition: 'CONTADO' as const,
    items: [{ productId, quantity: 1, unitPrice: BASE, discountPct: PCT, taxRate: 21 }],
  });

  beforeAll(async () => {
    await ensureDefaultWarehouse(ADMIN_A);

    const customer = await api
      .post('/api/customers')
      .set(auth(ADMIN_A))
      .send({ name: `Cliente descuento ${Date.now()}`, taxCondition: 'CONSUMIDOR_FINAL' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `DSC-${Date.now()}`,
      name: 'Producto descuento (test)',
      cost: 100, price: BASE, taxRate: 21, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;
  });

  it('el alta calcula el total con el porcentaje sin truncar', async () => {
    const created = await api.post('/api/invoices').set(auth(ADMIN_A)).send(cuerpo());
    expectStatus(created, 201);
    expect(Number(created.body.data.total)).toBeCloseTo(TOTAL, 2);
  });

  it('reabrir y volver a guardar NO mueve el total', async () => {
    const created = await api.post('/api/invoices').set(auth(ADMIN_A)).send(cuerpo());
    expectStatus(created, 201);
    const id = created.body.data.id;
    const totalOriginal = Number(created.body.data.total);

    // Se relee tal como lo haría el formulario y se reenvía sin cambios.
    const leida = await api.get(`/api/invoices/${id}`).set(auth(ADMIN_A));
    expectStatus(leida, 200);

    const reenvio = await api.put(`/api/invoices/${id}`).set(auth(ADMIN_A)).send({
      type: leida.body.data.type,
      customerId: leida.body.data.customerId,
      saleCondition: leida.body.data.saleCondition,
      items: leida.body.data.items.map((it: any) => ({
        productId: it.productId,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        discountPct: Number(it.discountPct),
        taxRate: Number(it.taxRate),
      })),
    });
    expectStatus(reenvio, 200);

    // Con DECIMAL(5,2) el ida y vuelta corría el total ~$125.
    expect(Number(reenvio.body.data.total)).toBeCloseTo(totalOriginal, 2);
    expect(Number(reenvio.body.data.total)).toBeCloseTo(TOTAL, 2);
  });

  it('el porcentaje vuelve del backend con su precisión', async () => {
    const created = await api.post('/api/invoices').set(auth(ADMIN_A)).send(cuerpo());
    expectStatus(created, 201);
    // 13,33333333 — no 13,33
    expect(Number(created.body.data.items[0].discountPct)).toBeCloseTo(PCT, 6);
  });
});
