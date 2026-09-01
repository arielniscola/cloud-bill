import { api, auth, expectStatus, ensureDefaultWarehouse } from '../helpers';
import { ADMIN_A } from '../fixtures';

/**
 * La cuenta corriente del cliente es por moneda (unique customerId+currency+
 * fiscalMode): el dominio nunca convierte. Los totales del listado tampoco
 * deben hacerlo — sumar una factura en USD dentro de un número rotulado "ARS"
 * mezclaba dos escalas.
 */
describe('Stats de facturas — desglose por moneda', () => {
  let customerId: string;
  let productId: string;

  const crear = async (currency: 'ARS' | 'USD', unitPrice: number) => {
    const res = await api.post('/api/invoices').set(auth(ADMIN_A)).send({
      type: 'FACTURA_B',
      customerId,
      saleCondition: 'CONTADO',
      currency,
      exchangeRate: 1,
      items: [{ productId, quantity: 1, unitPrice, taxRate: 0 }],
    });
    expectStatus(res, 201);
    return res.body.data.id as string;
  };

  const stats = async () => {
    const res = await api
      .get('/api/invoices/stats')
      .query({ customerId })
      .set(auth(ADMIN_A));
    expectStatus(res, 200);
    return res.body.data as {
      count: number;
      byCurrency: Array<{ currency: string; count: number; total: number }>;
    };
  };

  beforeAll(async () => {
    await ensureDefaultWarehouse(ADMIN_A);

    const customer = await api
      .post('/api/customers')
      .set(auth(ADMIN_A))
      .send({ name: `Cliente monedas ${Date.now()}`, taxCondition: 'CONSUMIDOR_FINAL' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `CUR-${Date.now()}`,
      name: 'Producto monedas (test)',
      cost: 100, price: 200, taxRate: 0, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;
  });

  it('con una sola moneda devuelve un único tramo', async () => {
    await crear('ARS', 100000);
    const s = await stats();
    expect(s.count).toBe(1);
    expect(s.byCurrency).toHaveLength(1);
    expect(s.byCurrency[0]).toMatchObject({ currency: 'ARS', count: 1, total: 100000 });
  });

  it('no suma dólares dentro del total en pesos', async () => {
    await crear('USD', 500);
    const s = await stats();

    expect(s.count).toBe(2);
    expect(s.byCurrency).toHaveLength(2);

    const ars = s.byCurrency.find((t) => t.currency === 'ARS')!;
    const usd = s.byCurrency.find((t) => t.currency === 'USD')!;

    // Cada moneda conserva su propia escala.
    expect(ars.total).toBeCloseTo(100000, 2);
    expect(usd.total).toBeCloseTo(500, 2);
    // Lo que antes pasaba: un solo número de 100.500 rotulado "ARS".
    expect(s.byCurrency.some((t) => Math.abs(t.total - 100500) < 0.01)).toBe(false);
  });

  it('los tramos vienen de mayor a menor facturado', async () => {
    const s = await stats();
    const totales = s.byCurrency.map((t) => t.total);
    expect([...totales].sort((a, b) => b - a)).toEqual(totales);
  });

  it('el count total es la suma de los conteos por moneda', async () => {
    const s = await stats();
    expect(s.count).toBe(s.byCurrency.reduce((acc, t) => acc + t.count, 0));
  });

  it('filtrar por moneda deja un solo tramo', async () => {
    const res = await api
      .get('/api/invoices/stats')
      .query({ customerId, currency: 'USD' })
      .set(auth(ADMIN_A));
    expectStatus(res, 200);
    expect(res.body.data.byCurrency).toHaveLength(1);
    expect(res.body.data.byCurrency[0].currency).toBe('USD');
  });
});
