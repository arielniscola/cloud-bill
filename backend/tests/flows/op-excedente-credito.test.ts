import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Excedente de pago al proveedor → crédito interno.
 *
 * Cuando se le paga al proveedor más de lo que suman las facturas imputadas, la
 * diferencia queda como CRÉDITO INTERNO (nota interna CREDIT) en su cuenta
 * corriente: saldo a favor nuestro, imputable a facturas futuras.
 *
 * De paso se cubre el crédito fantasma: el CREDIT de una orden que canceló
 * facturas NO puede ofrecerse como crédito disponible, porque esa plata ya se
 * consumió al cancelarlas.
 */
describe('Excedente de orden de pago → crédito interno', () => {
  const A = ADMIN_A;
  let supplierId: string;

  const invoiceBody = (number: string, amount: number, saleCondition = 'CUENTA_CORRIENTE') => {
    const subtotal = Math.round((amount / 1.21) * 100) / 100;
    return {
      supplierId,
      number,
      type: 'FACTURA_A',
      subtotal,
      taxRate: 21,
      taxAmount: Math.round((amount - subtotal) * 100) / 100,
      amount,
      saleCondition,
    };
  };

  async function credits() {
    const res = await api.get(`/api/orden-pagos/supplier/${supplierId}/open-items`).set(auth(A));
    expectStatus(res, 200);
    return res.body.data.credits as Array<{
      source: string; movementId?: string; number: string; currency: string; balance: number;
    }>;
  }

  async function balance(): Promise<Record<string, number>> {
    const res = await api.get(`/api/orden-pagos/supplier/${supplierId}/account`).set(auth(A));
    expectStatus(res, 200);
    return res.body.data.balance;
  }

  beforeAll(async () => {
    const supplier = await api
      .post('/api/suppliers')
      .set(auth(A))
      .send({ name: 'Proveedor Excedente (test)', cuit: '30-66666666-6' });
    expectStatus(supplier, 201);
    supplierId = supplier.body.data.id;
  });

  it('pagar exacto una factura NO deja crédito disponible (no hay crédito fantasma)', async () => {
    const inv = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0008-00000001', 121000));
    expectStatus(inv, 201);

    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'BANK_TRANSFER',
      items: [{ purchaseInvoiceId: inv.body.data.id, amount: 121000 }],
    });
    expectStatus(op, 201);
    expectStatus(await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A)), 200);

    expect(await credits()).toEqual([]);
    expect((await balance()).ARS ?? 0).toBeCloseTo(0, 2);
  });

  it('pagar de más genera un crédito interno por la diferencia, imputable a otra factura', async () => {
    const inv = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0008-00000002', 100000));
    expectStatus(inv, 201);
    const invoiceId = inv.body.data.id;

    // Se le pagan 150.000 por una factura de 100.000.
    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'BANK_TRANSFER',
      items: [{ purchaseInvoiceId: invoiceId, amount: 100000 }],
      onAccountAmount: 50000,
    });
    expectStatus(op, 201);
    expect(Number(op.body.data.amount)).toBe(150000);
    const opId = op.body.data.id;

    expectStatus(await api.post(`/api/orden-pagos/${opId}/pay`).set(auth(A)), 200);

    // La factura queda cancelada por su importe, no por lo pagado.
    const detail = await api.get(`/api/purchase-invoices/${invoiceId}`).set(auth(A));
    expect(detail.body.data.status).toBe('PAID');

    // Queda un único crédito disponible: el excedente.
    const available = await credits();
    expect(available).toHaveLength(1);
    expect(available[0].balance).toBeCloseTo(50000, 2);
    expect(available[0].number).toMatch(/Crédito interno/);

    // Y el saldo de la cuenta queda a favor nuestro (negativo).
    expect((await balance()).ARS ?? 0).toBeCloseTo(-50000, 2);

    // Se registró como nota interna CREDIT, no como un CREDIT suelto.
    const notes = await prisma.$queryRawUnsafe<Array<{ type: string; amount: unknown; status: string }>>(
      `SELECT type, amount, status FROM "internal_notes" WHERE "supplierId" = '${supplierId}'`
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('CREDIT');
    expect(Number(notes[0].amount)).toBe(50000);

    // El crédito interno cancela una factura posterior.
    const inv2 = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0008-00000003', 50000));
    expectStatus(inv2, 201);

    const adj = await api.post(`/api/orden-pagos/supplier/${supplierId}/adjustments`).set(auth(A)).send({
      currency: 'ARS',
      debits: [{ purchaseInvoiceId: inv2.body.data.id, amount: 50000 }],
      credits: [{ movementId: available[0].movementId, amount: 50000 }],
    });
    expectStatus(adj, 201);

    const detail2 = await api.get(`/api/purchase-invoices/${inv2.body.data.id}`).set(auth(A));
    expect(detail2.body.data.status).toBe('PAID');
    expect(await credits()).toEqual([]);
    expect((await balance()).ARS ?? 0).toBeCloseTo(0, 2);
  });

  it('el excedente genera el crédito aunque las facturas sean de CONTADO', async () => {
    const inv = await api.post('/api/purchase-invoices').set(auth(A))
      .send(invoiceBody('0008-00000004', 80000, 'CONTADO'));
    expectStatus(inv, 201);

    // Una factura de contado no mueve la cuenta corriente...
    const before = (await balance()).ARS ?? 0;

    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'CASH',
      items: [{ purchaseInvoiceId: inv.body.data.id, amount: 80000 }],
      onAccountAmount: 20000,
    });
    expectStatus(op, 201);
    expectStatus(await api.post(`/api/orden-pagos/${op.body.data.id}/pay`).set(auth(A)), 200);

    // ...pero el excedente sí: son 20.000 entregados sin comprobante que los respalde.
    expect((await balance()).ARS ?? 0).toBeCloseTo(before - 20000, 2);
    const available = await credits();
    expect(available).toHaveLength(1);
    expect(available[0].balance).toBeCloseTo(20000, 2);
  });

  it('anular la orden da de baja el crédito interno y su nota', async () => {
    const inv = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0008-00000005', 30000));
    expectStatus(inv, 201);

    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'BANK_TRANSFER',
      items: [{ purchaseInvoiceId: inv.body.data.id, amount: 30000 }],
      onAccountAmount: 5000,
    });
    expectStatus(op, 201);
    const opId = op.body.data.id;
    expectStatus(await api.post(`/api/orden-pagos/${opId}/pay`).set(auth(A)), 200);

    const before = (await balance()).ARS ?? 0;
    expectStatus(await api.delete(`/api/orden-pagos/${opId}`).set(auth(A)), 200);

    // El crédito del excedente se revierte junto con el resto de la orden.
    expect((await balance()).ARS ?? 0).toBeCloseTo(before + 5000 + 30000, 2);

    const activas = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM "internal_notes"
       WHERE "supplierId" = '${supplierId}' AND status = 'ACTIVE' AND reason LIKE '%${op.body.data.number}%'`
    );
    expect(Number(activas[0].count)).toBe(0);
  });

  it('expone el excedente al leer la orden', async () => {
    const inv = await api.post('/api/purchase-invoices').set(auth(A)).send(invoiceBody('0008-00000006', 10000));
    expectStatus(inv, 201);

    const op = await api.post('/api/orden-pagos').set(auth(A)).send({
      supplierId,
      paymentMethod: 'BANK_TRANSFER',
      items: [{ purchaseInvoiceId: inv.body.data.id, amount: 10000 }],
      onAccountAmount: 2500,
    });
    expectStatus(op, 201);

    const detail = await api.get(`/api/orden-pagos/${op.body.data.id}`).set(auth(A));
    expectStatus(detail, 200);
    expect(Number(detail.body.data.onAccountAmount)).toBeCloseTo(2500, 2);
  });
});
