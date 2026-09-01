import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * La cotización de una orden en USD se propaga: OrdenPedidoController la copia
 * a la factura al convertir, y de ahí sale el MonCotiz que se declara a ARCA y
 * el importe con el que la venta entra en los reportes en pesos.
 *
 * El formulario mandaba `exchangeRate: 1` fijo, así que una orden en dólares
 * viajaba con cotización 1 por todo ese recorrido.
 */
describe('Orden de pedido en USD — la cotización llega a la factura', () => {
  let customerId: string;
  let productId: string;

  let warehouseId: string;

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(ADMIN_A);

    const customer = await api
      .post('/api/customers')
      .set(auth(ADMIN_A))
      .send({ name: `Cliente USD ${Date.now()}`, taxCondition: 'CONSUMIDOR_FINAL' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `USD-${Date.now()}`,
      name: 'Producto USD (test)',
      cost: 50, price: 100, taxRate: 21, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;

    // La orden descuenta stock al crearse (stockBehavior DISCOUNT).
    const stockIn = await api.post('/api/stock/movement').set(auth(ADMIN_A)).send({
      productId, warehouseId, type: 'PURCHASE', quantity: 100, reason: 'Carga inicial tests',
    });
    expectStatus(stockIn, 201);
  });

  const crearOP = async (currency: 'ARS' | 'USD', exchangeRate: number) => {
    const res = await api.post('/api/orden-pedidos').set(auth(ADMIN_A)).send({
      customerId,
      currency,
      exchangeRate,
      saleCondition: 'CONTADO',
      stockBehavior: 'DISCOUNT',
      items: [
        {
          productId,
          description: 'Producto USD (test)',
          quantity: 2,
          unitPrice: 100,
          discountPct: 0,
          taxRate: 21,
          subtotal: 200,
          taxAmount: 42,
          total: 242,
        },
      ],
    });
    expectStatus(res, 201);
    return res.body.data;
  };

  it('la orden conserva la cotización que se le cargó', async () => {
    const op = await crearOP('USD', 1350.5);
    expect(op.currency).toBe('USD');
    expect(Number(op.exchangeRate)).toBeCloseTo(1350.5, 4);
  });

  it('la factura hereda moneda y cotización de la orden', async () => {
    const op = await crearOP('USD', 1420.75);

    const convertida = await api
      .post(`/api/orden-pedidos/${op.id}/convert`)
      .set(auth(ADMIN_A))
      .send({});
    expectStatus(convertida, 201);

    const factura = convertida.body.data;
    expect(factura.currency).toBe('USD');
    // Con cotización 1 en la orden, acá llegaba 1 y de ahí al MonCotiz de ARCA.
    expect(Number(factura.exchangeRate)).toBeCloseTo(1420.75, 4);
  });

  it('en pesos la cotización queda en 1', async () => {
    const op = await crearOP('ARS', 1);
    expect(Number(op.exchangeRate)).toBe(1);
  });
});
