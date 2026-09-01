import { api, auth, expectStatus, ensureDefaultWarehouse, getStockQty } from '../helpers';
import { ADMIN_A } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';

/**
 * Regresión: una factura nacida de una orden de pedido NO debe volver a
 * aplicar los efectos de emisión.
 *
 * El alta de la OP ya descontó stock y debitó la cuenta corriente
 * (OrdenPedidoController.create). `convertToInvoice` crea la factura en DRAFT
 * heredando `saleCondition` y forzando `stockBehavior: 'RESERVE'` "para evitar
 * movimientos de stock" — pero `applyIssuanceEffects` (InvoiceController.ts:34)
 * sí actúa sobre RESERVE (incrementReserved) y vuelve a debitar la CC.
 *
 * La UI bloquea el cobro de facturas con `ordenPedidoId`, pero no la emisión:
 * el botón "Emitir" queda habilitado sobre ese borrador.
 */
describe('Regresión: emitir la factura convertida desde una OP no duplica efectos', () => {
  const A = ADMIN_A;
  let warehouseId: string;
  let productId: string;
  let customerId: string;

  /** Movimientos de cuenta corriente de un cliente, en orden cronológico. */
  async function ccMovements(
    forCustomerId: string = customerId
  ): Promise<Array<{ type: string; amount: number; description: string }>> {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ type: string; amount: unknown; description: string }>
    >(
      `SELECT am.type, am.amount, am.description
       FROM "account_movements" am
       JOIN "current_accounts" ca ON ca.id = am."currentAccountId"
       WHERE ca."customerId" = '${forCustomerId}'
       ORDER BY am."createdAt" ASC`
    );
    return rows.map((r) => ({ type: r.type, amount: Number(r.amount), description: r.description }));
  }

  /**
   * Cantidad reservada del producto en el almacén; 0 si no hay fila de stock.
   * Se lee por SQL y no por `GET /api/stock/:productId/:warehouseId`: `mapStock`
   * deja `reservedQuantity` fuera de la entidad a propósito, así que la API
   * nunca la devuelve y la lectura por HTTP daría 0 siempre.
   */
  async function getReserved(): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<Array<{ reservedQuantity: unknown }>>(
      `SELECT "reservedQuantity" FROM "stocks"
       WHERE "productId" = '${productId}' AND "warehouseId" = '${warehouseId}'
         AND "variantId" IS NULL
       LIMIT 1`
    );
    return rows.length ? Number(rows[0].reservedQuantity) : 0;
  }

  beforeAll(async () => {
    warehouseId = await ensureDefaultWarehouse(A);

    const customer = await api
      .post('/api/customers')
      .set(auth(A))
      .send({ name: 'Cliente OP→Factura CC (test)', saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(A))
      .send({
        sku: `OPCONV-${Date.now()}`,
        name: 'Producto OP→Factura (test)',
        cost: 500,
        price: 1000,
        taxRate: 21,
      });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const stockIn = await api
      .post('/api/stock/movement')
      .set(auth(A))
      .send({
        productId,
        warehouseId,
        type: 'PURCHASE',
        quantity: 100,
        reason: 'Carga inicial test OP→Factura',
      });
    expectStatus(stockIn, 201);
  });

  it('emitir la factura convertida no genera un segundo DEBIT ni reserva stock de nuevo', async () => {
    const stockInicial = await getStockQty(A, productId, warehouseId);
    const reservadoInicial = await getReserved();
    const total = 4 * 1000 * 1.21; // 4840

    // ── 1. Alta de la OP: acá se descuenta stock y se debita la cuenta corriente
    const created = await api
      .post('/api/orden-pedidos')
      .set(auth(A))
      .send({
        customerId,
        saleCondition: 'CUENTA_CORRIENTE',
        stockBehavior: 'DISCOUNT',
        items: [
          {
            productId,
            description: 'Producto OP→Factura (test)',
            quantity: 4,
            unitPrice: 1000,
            taxRate: 21,
            subtotal: 4000,
            taxAmount: 840,
            total: 4840,
          },
        ],
      });
    expectStatus(created, 201);
    const op = created.body.data;

    expect(await getStockQty(A, productId, warehouseId)).toBe(stockInicial - 4);
    expect(await getReserved()).toBe(reservadoInicial);

    const ccTrasAlta = await ccMovements();
    expect(ccTrasAlta).toHaveLength(1);
    expect(ccTrasAlta[0].type).toBe('DEBIT');
    expect(ccTrasAlta[0].amount).toBeCloseTo(total, 2);

    // ── 2. Conversión a factura: solo el comprobante fiscal, sin efectos nuevos
    const converted = await api
      .post(`/api/orden-pedidos/${op.id}/convert`)
      .set(auth(A))
      .send({ invoiceType: 'FACTURA_B' });
    expect([200, 201]).toContain(converted.status);
    const invoice = converted.body.data;

    // La factura nace EMITIDA, no en borrador: un borrador habilitaría "Emitir",
    // que volvería a aplicar los efectos que ya aplicó el alta de la orden.
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.ordenPedidoId).toBe(op.id);
    expect(invoice.saleCondition).toBe('CUENTA_CORRIENTE');
    expect(invoice.stockBehavior).toBe('RESERVE');

    expect(await getStockQty(A, productId, warehouseId)).toBe(stockInicial - 4);
    expect(await ccMovements()).toHaveLength(1);

    // ── 3. Intentar emitirla igual queda rechazado: ya no hay transición
    // DRAFT → ISSUED disponible, que era la que disparaba applyIssuanceEffects.
    const issued = await api
      .patch(`/api/invoices/${invoice.id}/status`)
      .set(auth(A))
      .send({ status: 'ISSUED' });
    expectStatus(issued, 400);

    // ── 4. Lo que debería seguir siendo cierto.
    // Se comparan los tres efectos juntos: si se afirmaran uno por uno, el
    // primer fallo taparía los otros dos.
    const ccFinal = await ccMovements();
    const observado = {
      movimientosCC: ccFinal.map((m) => m.type),
      saldoCC: Number(
        ccFinal.reduce((s, m) => s + (m.type === 'DEBIT' ? m.amount : -m.amount), 0).toFixed(2)
      ),
      stock: await getStockQty(A, productId, warehouseId),
      reservado: await getReserved(),
    };

    expect(observado).toEqual({
      movimientosCC: ['DEBIT'],
      saldoCC: Number(total.toFixed(2)),
      stock: stockInicial - 4,
      reservado: reservadoInicial,
    });
  });

  it('anular la factura convertida no revierte el stock ni la cuenta corriente de la orden', async () => {
    // Cliente propio: la cuenta corriente del test anterior ya tiene movimientos.
    const customer = await api
      .post('/api/customers')
      .set(auth(A))
      .send({ name: 'Cliente anulación OP→Factura (test)', saleCondition: 'CUENTA_CORRIENTE' });
    expectStatus(customer, 201);
    const otroCustomerId = customer.body.data.id;

    const stockInicial = await getStockQty(A, productId, warehouseId);

    const created = await api
      .post('/api/orden-pedidos')
      .set(auth(A))
      .send({
        customerId: otroCustomerId,
        saleCondition: 'CUENTA_CORRIENTE',
        stockBehavior: 'DISCOUNT',
        items: [
          {
            productId,
            description: 'Producto OP→Factura (test)',
            quantity: 2,
            unitPrice: 1000,
            taxRate: 21,
            subtotal: 2000,
            taxAmount: 420,
            total: 2420,
          },
        ],
      });
    expectStatus(created, 201);

    const converted = await api
      .post(`/api/orden-pedidos/${created.body.data.id}/convert`)
      .set(auth(A))
      .send({ invoiceType: 'FACTURA_B' });
    expect([200, 201]).toContain(converted.status);

    const cancelled = await api
      .post(`/api/invoices/${converted.body.data.id}/cancel`)
      .set(auth(A))
      .send({});
    expectStatus(cancelled, 200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    // Los efectos son de la orden, no de la factura: revertirlos acá acreditaría
    // la cuenta corriente sin devolver la mercadería.
    const ccFinal = await ccMovements(otroCustomerId);
    expect(ccFinal.map((m) => m.type)).toEqual(['DEBIT']);
    expect(await getStockQty(A, productId, warehouseId)).toBe(stockInicial - 2);
  });
});
