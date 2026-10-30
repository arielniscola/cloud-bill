// Claves VAPID de prueba (formato válido; web-push está mockeado y no sale nada a la red).
process.env.VAPID_PUBLIC_KEY = 'BAUqQ3O1PuBl6LQV0V73QJL_Mx7vn02xuMG-G0x-y5rGfYGvPZZaauhOV8UjSlTTmmxJOkbWJ-Fq0l3BpmsZHGw';
process.env.VAPID_PRIVATE_KEY = 'vNNB3Kl-6yaYYOjhI-327A4ZRvcjmVIq2nRHAxRmngI';

import webpush from 'web-push';
import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, OWNER_A, ADMIN_B } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

const send = webpush.sendNotification as jest.Mock;

/**
 * Avisos push del circuito de aprobaciones: la solicitud nueva le llega al
 * Dueño, la resolución al que la pidió; las suscripciones muertas se borran.
 */
describe('Flujo crítico: avisos push de aprobaciones', () => {
  const ownerEndpoint = 'https://push.example.com/owner-device';
  const adminEndpoint = 'https://push.example.com/admin-device';
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
  const reason = (text: string) => ({ 'X-Approval-Reason': encodeURIComponent(text) });

  let customerId: string;
  let productId: string;

  /** Los avisos se mandan sin await: esperar a que aparezcan. */
  async function waitForSends(n: number): Promise<void> {
    for (let i = 0; i < 50 && send.mock.calls.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  }
  const sentTo = () => send.mock.calls.map(([sub, body]) => ({ endpoint: sub.endpoint as string, payload: JSON.parse(body) }));

  async function createInvoice(): Promise<string> {
    const res = await api
      .post('/api/invoices')
      .set(auth(ADMIN_A))
      .send({ type: 'FACTURA_B', customerId, saleCondition: 'CONTADO', items: [{ productId, quantity: 1, unitPrice: 100, taxRate: 21 }] });
    expectStatus(res, 201);
    return res.body.data.id;
  }

  beforeAll(async () => {
    const customer = await api.post('/api/customers').set(auth(ADMIN_A)).send({ name: 'Cliente Push (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;
    const product = await api
      .post('/api/products')
      .set(auth(ADMIN_A))
      .send({ sku: `PUSH-${Date.now()}`, name: 'Servicio Push (test)', cost: 50, price: 100, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    productId = product.body.data.id;
    expectStatus(await api.put('/api/approvals/settings').set(auth(OWNER_A)).send({ disabledActions: [] }), 200);
  });

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ statusCode: 201 });
  });

  it('expone la clave pública y registra la suscripción del dispositivo', async () => {
    const key = await api.get('/api/push/public-key').set(auth(OWNER_A));
    expectStatus(key, 200);
    expect(key.body.data.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);

    expectStatus(await api.post('/api/push/subscribe').set(auth(OWNER_A)).send({ endpoint: ownerEndpoint, keys }), 201);
    expectStatus(await api.post('/api/push/subscribe').set(auth(ADMIN_A)).send({ endpoint: adminEndpoint, keys }), 201);
    // Repetir el alta no duplica.
    expectStatus(await api.post('/api/push/subscribe').set(auth(OWNER_A)).send({ endpoint: ownerEndpoint, keys }), 201);

    const after = await api.get('/api/push/public-key').set(auth(OWNER_A));
    expect(after.body.data.devices).toBe(1);
  });

  it('una solicitud nueva avisa al Dueño (no al que la pide) y la resolución al solicitante', async () => {
    const id = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)).set(reason('Factura duplicada')), 202);

    await waitForSends(1);
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0].endpoint).toBe(ownerEndpoint);
    expect(sentTo()[0].payload.title).toBe('Aprobación pendiente');
    expect(sentTo()[0].payload.body).toContain('Anular factura');
    expect(sentTo()[0].payload.body).toContain('Factura duplicada');
    expect(sentTo()[0].payload.url).toBe('/approvals');

    send.mockClear();
    const open = await api.get(`/api/approvals/entity/INVOICE/${id}`).set(auth(ADMIN_A));
    expectStatus(await api.post(`/api/approvals/${open.body.data.id}/reject`).set(auth(OWNER_A)).send({ comment: 'Se corrige con NC' }), 200);

    await waitForSends(1);
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0].endpoint).toBe(adminEndpoint);
    expect(sentTo()[0].payload.title).toBe('Solicitud rechazada');
    expect(sentTo()[0].payload.body).toContain('Se corrige con NC');
  });

  it('una suscripción dada de baja por el navegador (410) se borra', async () => {
    send.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const id = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)).set(reason('Prueba 410')), 202);
    await waitForSends(1);

    let rows: unknown[] = [];
    for (let i = 0; i < 50; i++) {
      rows = await prisma.$queryRaw<unknown[]>`SELECT id FROM "push_subscriptions" WHERE endpoint = ${ownerEndpoint}`;
      if (!rows.length) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(rows).toHaveLength(0);
  });

  it('otro usuario en el mismo navegador se queda con la suscripción; desuscribir solo borra la propia', async () => {
    expectStatus(await api.post('/api/push/subscribe').set(auth(ADMIN_B)).send({ endpoint: adminEndpoint, keys }), 201);
    const rows = await prisma.$queryRaw<{ userId: string }[]>`SELECT "userId" FROM "push_subscriptions" WHERE endpoint = ${adminEndpoint}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(ADMIN_B.id);

    // ADMIN_A ya no es dueño de ese endpoint: su baja no toca la de ADMIN_B.
    expectStatus(await api.post('/api/push/unsubscribe').set(auth(ADMIN_A)).send({ endpoint: adminEndpoint }), 200);
    expect(await prisma.$queryRaw<unknown[]>`SELECT id FROM "push_subscriptions" WHERE endpoint = ${adminEndpoint}`).toHaveLength(1);

    expectStatus(await api.post('/api/push/unsubscribe').set(auth(ADMIN_B)).send({ endpoint: adminEndpoint }), 200);
    expect(await prisma.$queryRaw<unknown[]>`SELECT id FROM "push_subscriptions" WHERE endpoint = ${adminEndpoint}`).toHaveLength(0);
  });
});
