import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B, COMPANY_B } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';
import { lockInvoiceForPayment } from '../../src/infrastructure/services/CustomerSettlementService';

/**
 * Regresiones de la auditoría de seguridad/integridad:
 *  - bancos: toda operación por id filtra por empresa;
 *  - proveedores: el body pasa por Zod (no llega crudo a Prisma);
 *  - cobro de factura: la cuenta bancaria del body debe ser de la empresa y dos
 *    cobros simultáneos no pueden superar el total;
 *  - /api/sync quedó desmontado.
 */
describe('Seguridad: referencias entre empresas y cobros concurrentes', () => {
  const A = ADMIN_A;
  const B = ADMIN_B;

  let bankA: string;
  let customerId: string;
  let productId: string;

  const balanceOf = async (id: string): Promise<number> => {
    const rows = await prisma.$queryRaw<{ balance: number }[]>`
      SELECT balance::float8 AS balance FROM bank_accounts WHERE id = ${id}
    `;
    return Number(rows[0].balance);
  };

  const newInvoice = async (unitPrice: number) => {
    const res = await api.post('/api/invoices').set(auth(A)).send({
      type: 'FACTURA_B',
      customerId,
      saleCondition: 'CONTADO',
      items: [{ productId, quantity: 1, unitPrice, taxRate: 21 }],
    });
    expectStatus(res, 201);
    return res.body.data as { id: string; total: number };
  };

  beforeAll(async () => {
    const bank = await api.post('/api/banks').set(auth(A)).send({ name: 'Cuenta privada A (test)', bank: 'Banco Test' });
    expectStatus(bank, 201);
    bankA = bank.body.data.id;

    const customer = await api.post('/api/customers').set(auth(A)).send({ name: 'Cliente refs (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    // Servicio (no inventariado): el cobro no depende de que haya stock.
    const product = await api.post('/api/products').set(auth(A)).send({
      sku: `REFS-${Date.now()}`, name: 'Servicio refs (test)', cost: 100, price: 1000, taxRate: 21, trackStock: false,
    });
    expectStatus(product, 201);
    productId = product.body.data.id;
  });

  describe('bancos', () => {
    it('otra empresa no puede leer, editar, borrar ni mover la cuenta', async () => {
      expectStatus(await api.get(`/api/banks/${bankA}`).set(auth(B)), 404);
      expectStatus(await api.get(`/api/banks/${bankA}/movements`).set(auth(B)), 404);
      expectStatus(await api.put(`/api/banks/${bankA}`).set(auth(B)).send({ name: 'Tomada' }), 404);
      expectStatus(await api.delete(`/api/banks/${bankA}`).set(auth(B)), 404);
      expectStatus(
        await api.post(`/api/banks/${bankA}/movements`).set(auth(B)).send({ type: 'DEBIT', amount: 500, description: 'ajeno' }),
        404
      );

      const own = await api.get(`/api/banks/${bankA}`).set(auth(A));
      expectStatus(own, 200);
      expect(own.body.data.name).toBe('Cuenta privada A (test)');
      expect(await balanceOf(bankA)).toBe(0);
    });

    it('el movimiento propio actualiza el saldo y una cuenta con movimientos no se borra', async () => {
      const mov = await api.post(`/api/banks/${bankA}/movements`).set(auth(A)).send({ type: 'CREDIT', amount: 250, description: 'Depósito (test)' });
      expectStatus(mov, 201);
      expect(mov.body.data.id).toBeTruthy();
      expect(await balanceOf(bankA)).toBe(250);

      expectStatus(await api.delete(`/api/banks/${bankA}`).set(auth(A)), 400);
    });
  });

  describe('proveedores', () => {
    it('ignora los campos que no son del proveedor (companyId, relaciones)', async () => {
      const created = await api.post('/api/suppliers').set(auth(A)).send({ name: 'Proveedor refs (test)', companyId: COMPANY_B });
      expectStatus(created, 201);
      const id = created.body.data.id;

      const updated = await api.put(`/api/suppliers/${id}`).set(auth(A)).send({
        phone: '11-5555-0000',
        companyId: COMPANY_B,
        purchaseInvoices: { deleteMany: {} },
      });
      expectStatus(updated, 200);
      expect(updated.body.data.phone).toBe('11-5555-0000');

      // Sigue siendo de A: A lo ve, B no.
      expectStatus(await api.get(`/api/suppliers/${id}`).set(auth(A)), 200);
      expectStatus(await api.get(`/api/suppliers/${id}`).set(auth(B)), 404);
    });

    it('rechaza un body inválido con 400', async () => {
      expectStatus(await api.post('/api/suppliers').set(auth(A)).send({ name: '' }), 400);
    });
  });

  describe('cobro de factura', () => {
    it('no acepta la cuenta bancaria de otra empresa', async () => {
      const bankB = await api.post('/api/banks').set(auth(B)).send({ name: 'Cuenta B (test)', bank: 'Banco Test' });
      expectStatus(bankB, 201);

      const invoice = await newInvoice(1000);
      const pay = await api.post(`/api/invoices/${invoice.id}/pay`).set(auth(A)).send({
        amount: Number(invoice.total), paymentMethod: 'BANK_TRANSFER', bankAccountId: bankB.body.data.id,
      });
      expectStatus(pay, 400);
      expect(await balanceOf(bankB.body.data.id)).toBe(0);
    });

    it('dos cobros simultáneos por el total dejan un solo recibo', async () => {
      const invoice = await newInvoice(2000);
      const total = Number(invoice.total);

      // Emitida antes: así los dos cobros compiten solo por el saldo.
      expectStatus(await api.patch(`/api/invoices/${invoice.id}/status`).set(auth(A)).send({ status: 'ISSUED' }), 200);

      const pay = () => api.post(`/api/invoices/${invoice.id}/pay`).set(auth(A)).send({ amount: total, paymentMethod: 'CASH' });
      const results = await Promise.all([pay(), pay(), pay()]);
      const ok = results.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      for (const r of results) if (r.status !== 200) expect([400, 409]).toContain(r.status);

      const rows = await prisma.$queryRaw<{ n: number; paid: number }[]>`
        SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float8 AS paid
        FROM recibos WHERE "invoiceId" = ${invoice.id} AND status = 'EMITTED'
      `;
      expect(rows[0].n).toBe(1);
      expect(Number(rows[0].paid)).toBeCloseTo(total, 2);

      const after = await api.get(`/api/invoices/${invoice.id}`).set(auth(A));
      expect(after.body.data.status).toBe('PAID');
    });

    // El caso de arriba no alcanza a abrir la ventana de la carrera (en el test
    // los pedidos llegan casi en serie). Acá se prueba el cerrojo en sí: una
    // transacción que llega con un saldo "viejo" es rechazada con el saldo real,
    // y espera a la que tiene la factura tomada en vez de leer por debajo.
    it('el cerrojo revalida el saldo real y serializa las transacciones', async () => {
      const invoice = await newInvoice(3000);
      const total = Number(invoice.total);
      expectStatus(await api.patch(`/api/invoices/${invoice.id}/status`).set(auth(A)).send({ status: 'ISSUED' }), 200);
      const ref = { id: invoice.id, type: 'FACTURA_B', total };

      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let holding!: () => void;
      const held = new Promise<void>((resolve) => { holding = resolve; });

      const first = prisma.$transaction(async (tx) => {
        await lockInvoiceForPayment(ref, total, tx);
        holding();
        await gate;
        order.push('first-done');
      }, { timeout: 15000 });

      await held;
      const second = prisma.$transaction(async (tx) => {
        await lockInvoiceForPayment(ref, total, tx);
        order.push('second-locked');
      }, { timeout: 15000, maxWait: 15000 });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(order).toEqual([]); // la segunda sigue esperando el cerrojo
      release();
      await Promise.all([first, second]);
      expect(order).toEqual(['first-done', 'second-locked']);

      // Con la factura ya cobrada, quien llega con el total "viejo" es rechazado.
      expectStatus(await api.post(`/api/invoices/${invoice.id}/pay`).set(auth(A)).send({ amount: total, paymentMethod: 'CASH' }), 200);
      await expect(
        prisma.$transaction((tx) => lockInvoiceForPayment(ref, total, tx))
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  it('/api/sync ya no está expuesto', async () => {
    expectStatus(await api.get('/api/sync/export').set(auth(A)), 404);
    expectStatus(await api.get('/api/sync/status').set(auth(A)), 404);
  });
});
