import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B, SELLER_A, CLERK_A, COMPANY_B } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Regresiones de la auditoría (puntos menores):
 *  - las lecturas de bancos, cheques y recibos ya no están abiertas a cualquier rol;
 *  - send-email valida destinatario y adjunto, y no manda comprobantes de otra empresa.
 */
describe('Seguridad: lecturas por rol', () => {
  let bankId: string;

  beforeAll(async () => {
    const bank = await api.post('/api/banks').set(auth(ADMIN_A)).send({ name: 'Cuenta roles (test)', bank: 'Banco Test' });
    expectStatus(bank, 201);
    bankId = bank.body.data.id;
  });

  it('Depósito no lee bancos, cheques ni recibos', async () => {
    for (const path of [
      '/api/banks', `/api/banks/${bankId}`, `/api/banks/${bankId}/movements`,
      '/api/cheques', '/api/cheques/cartera', '/api/cheques/egresos',
      '/api/recibos', '/api/recibos/checks/list',
    ]) {
      expectStatus(await api.get(path).set(auth(CLERK_A)), 403);
    }
  });

  it('Ventas elige cuenta bancaria y ve recibos, pero no los movimientos bancarios ni la cartera de cheques', async () => {
    expectStatus(await api.get('/api/banks').set(auth(SELLER_A)), 200);
    expectStatus(await api.get('/api/recibos').set(auth(SELLER_A)), 200);
    expectStatus(await api.get(`/api/banks/${bankId}/movements`).set(auth(SELLER_A)), 403);
    expectStatus(await api.get('/api/cheques').set(auth(SELLER_A)), 403);
  });

  it('Administración sigue leyendo todo', async () => {
    for (const path of [
      '/api/banks', `/api/banks/${bankId}/movements`, '/api/cheques', '/api/cheques/cartera', '/api/recibos',
    ]) {
      expectStatus(await api.get(path).set(auth(ADMIN_A)), 200);
    }
  });
});

describe('Seguridad: envío de comprobantes por mail', () => {
  let invoiceId: string;
  const pdf = (content: string) => Buffer.from(content, 'latin1').toString('base64');

  beforeAll(async () => {
    const customer = await api.post('/api/customers').set(auth(ADMIN_A)).send({ name: 'Cliente mail (test)' });
    expectStatus(customer, 201);
    const product = await api.post('/api/products').set(auth(ADMIN_A)).send({
      sku: `MAIL-${Date.now()}`, name: 'Servicio mail (test)', cost: 100, price: 1000, taxRate: 21, trackStock: false,
    });
    expectStatus(product, 201);
    const invoice = await api.post('/api/invoices').set(auth(ADMIN_A)).send({
      type: 'FACTURA_B', customerId: customer.body.data.id, saleCondition: 'CONTADO',
      items: [{ productId: product.body.data.id, quantity: 1, unitPrice: 1000, taxRate: 21 }],
    });
    expectStatus(invoice, 201);
    invoiceId = invoice.body.data.id;
  });

  it('rechaza destinatarios que no son una única dirección válida', async () => {
    for (const to of ['', 'no-es-un-mail', 'a@x.com, b@y.com', 'a@x.com\nBcc: b@y.com', 42]) {
      const res = await api.post(`/api/invoices/${invoiceId}/send-email`).set(auth(ADMIN_A)).send({ to });
      expectStatus(res, 400);
      expect(res.body.message).not.toMatch(/SMTP/); // se rechaza antes de tocar el correo
    }
  });

  it('rechaza un adjunto que no es un PDF', async () => {
    for (const pdfBase64 of [pdf('<html><script>alert(1)</script></html>'), pdf('MZ\x90\x00 ejecutable'), 'no es base64 !!']) {
      const res = await api.post(`/api/invoices/${invoiceId}/send-email`).set(auth(ADMIN_A))
        .send({ to: 'cliente@example.com', pdfBase64 });
      expectStatus(res, 400);
      expect(res.body.message).toMatch(/adjunto/i);
    }
  });

  it('un pedido válido pasa la validación (y recién ahí falla porque no hay SMTP configurado)', async () => {
    const res = await api.post(`/api/invoices/${invoiceId}/send-email`).set(auth(ADMIN_A))
      .send({ to: ' cliente@example.com ', pdfBase64: pdf('%PDF-1.4\n%test') });
    expectStatus(res, 400);
    expect(res.body.message).toMatch(/SMTP/);
  });

  it('no manda el comprobante de otra empresa', async () => {
    // La empresa B tiene SMTP cargado (a un puerto cerrado): si la consulta no
    // filtrara por empresa, llegaría a intentar el envío (502) en vez de 404.
    expectStatus(await api.put('/api/app-settings').set(auth(ADMIN_B)).send({ deadStockDays: 90 }), 200);
    const updated = await prisma.$executeRaw`
      UPDATE "app_settings"
      SET "smtpHost" = '127.0.0.1', "smtpPort" = 1, "smtpUser" = 'test@example.com', "smtpPass" = 'x'
      WHERE id = ${COMPANY_B}
    `;
    expect(updated).toBe(1);

    const res = await api.post(`/api/invoices/${invoiceId}/send-email`).set(auth(ADMIN_B))
      .send({ to: 'cliente@example.com' });
    expectStatus(res, 404);
  });
});
