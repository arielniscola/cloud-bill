import { injectable, container } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { IOrdenPagoRepository, OrdenPagoFilters } from '../../../domain/repositories/IOrdenPagoRepository';
import { IChequeRepository } from '../../../domain/repositories/IChequeRepository';
import { OrdenPago, OrdenPagoWithRelations, CreateOrdenPagoInput, OrdenPagoCheque, OrdenPagoAjuste, OrdenPagoRetencion, CreateOrdenPagoRetencionInput } from '../../../domain/entities/OrdenPago';
import { SupplierAccountMovement, CreateSupplierMovementInput, SupplierMovementFilters } from '../../../domain/entities/SupplierAccountMovement';
import { OpenDebitItem, OpenCreditItem, CreateSupplierCcAdjustmentInput, SupplierCcAdjustment } from '../../../domain/entities/SupplierCcAdjustment';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

// Código de impuesto de SICORE por tipo de retención. IIBB es provincial
// (SIRCAR/ARBA/AGIP) y no se declara en SICORE, por eso no tiene código.
const ARCA_IMPUESTO_BY_TYPE: Record<string, string> = {
  GANANCIAS: '217',
  IVA:       '767',
};

type RawOrdenPago = {
  id: string; number: string; supplierId: string; userId: string;
  cashRegisterId: string | null; companyId: string; date: Date;
  amount: any; currency: string; exchangeRate: any;
  paymentMethod: string; reference: string | null; bank: string | null;
  checkDueDate: Date | null; notes: string | null; status: string;
  retentionAmount: any;
  createdAt: Date; updatedAt: Date;
  supplierName?: string; supplierCuit?: string | null;
  userName?: string;
  cashRegisterName?: string | null;
};

type RawItem = {
  id: string; ordenPagoId: string; purchaseId: string | null; purchaseInvoiceId: string | null; amount: any;
  purchaseNumber?: string; purchaseTotal?: any; purchasePaidAmount?: any; purchaseDate?: Date;
  invoiceNumber?: string; invoiceType?: string; invoiceAmount?: any; invoiceStatus?: string; invoiceCurrency?: string;
};

type RawMovement = {
  id: string; supplierId: string; ordenPagoId: string | null; purchaseId: string | null;
  type: string; amount: any; currency: string; balance: any;
  description: string | null; companyId: string; fiscalMode?: string | null;
  createdAt: Date; updatedAt: Date;
};

function mapOrdenPago(row: RawOrdenPago, items: RawItem[]): OrdenPagoWithRelations {
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplierId,
    userId: row.userId,
    cashRegisterId: row.cashRegisterId,
    companyId: row.companyId,
    date: row.date,
    amount: row.amount,
    currency: row.currency as any,
    exchangeRate: row.exchangeRate,
    paymentMethod: row.paymentMethod as any,
    reference: row.reference,
    bank: row.bank,
    checkDueDate: row.checkDueDate,
    notes: row.notes,
    status: row.status as any,
    retentionAmount: row.retentionAmount ?? (0 as any),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    supplier: row.supplierName
      ? { id: row.supplierId, name: row.supplierName, cuit: row.supplierCuit ?? null }
      : undefined,
    user: row.userName ? { id: row.userId, name: row.userName } : undefined,
    cashRegister: row.cashRegisterName
      ? { id: row.cashRegisterId!, name: row.cashRegisterName }
      : null,
    items: items.map((i) => ({
      id: i.id,
      ordenPagoId: i.ordenPagoId,
      purchaseId: i.purchaseId,
      purchaseInvoiceId: i.purchaseInvoiceId ?? null,
      amount: i.amount,
      purchase: i.purchaseNumber
        ? { id: i.purchaseId!, number: i.purchaseNumber, total: i.purchaseTotal, paidAmount: i.purchasePaidAmount, date: i.purchaseDate! }
        : undefined,
      invoice: i.invoiceNumber
        ? { id: i.purchaseInvoiceId!, number: i.invoiceNumber, type: i.invoiceType!, amount: i.invoiceAmount, status: i.invoiceStatus!, currency: i.invoiceCurrency ?? 'ARS' }
        : undefined,
    })),
  };
}

const ITEMS_SELECT = Prisma.sql`
  SELECT opi.*,
    p.number AS "purchaseNumber", p.total AS "purchaseTotal",
    p."paidAmount" AS "purchasePaidAmount", p.date AS "purchaseDate",
    pi.number AS "invoiceNumber", pi.type AS "invoiceType",
    pi.amount AS "invoiceAmount", pi.status AS "invoiceStatus", pi.currency AS "invoiceCurrency"
  FROM "orden_pago_items" opi
  LEFT JOIN "purchases" p ON p.id = opi."purchaseId"
  LEFT JOIN "purchase_invoices" pi ON pi.id = opi."purchaseInvoiceId"
`;

@injectable()
export class PrismaOrdenPagoRepository implements IOrdenPagoRepository {

  async getNextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "orden_pagos"
      WHERE "number" LIKE ${'OP-' + year + '-%'}
    `;
    const seq = Number(rows[0]?.count ?? 0) + 1;
    return `OP-${year}-${String(seq).padStart(8, '0')}`;
  }

  async findById(id: string, companyId?: string): Promise<OrdenPagoWithRelations | null> {
    const companyFilter = companyId ? Prisma.sql`AND op."companyId" = ${companyId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<RawOrdenPago[]>`
      SELECT op.*,
        s.name AS "supplierName", s.cuit AS "supplierCuit",
        u.name AS "userName",
        cr.name AS "cashRegisterName"
      FROM "orden_pagos" op
      LEFT JOIN "suppliers" s ON s.id = op."supplierId"
      LEFT JOIN "users" u ON u.id = op."userId"
      LEFT JOIN "cash_registers" cr ON cr.id = op."cashRegisterId"
      WHERE op.id = ${id} ${companyFilter}
    `;
    if (!rows[0]) return null;

    const items = await prisma.$queryRaw<RawItem[]>`
      ${ITEMS_SELECT}
      WHERE opi."ordenPagoId" = ${id}
    `;

    const chequeRows = await prisma.$queryRaw<{
      id: string; number: string; type: string; checkNumber: string | null;
      bank: string | null; amount: any; dueDate: Date | null; status: string;
    }[]>`
      SELECT id, number, type, "checkNumber", bank, amount, "dueDate", status
      FROM "cheques" WHERE "ordenPagoId" = ${id}
      ORDER BY "createdAt" ASC
    `;
    const cheques: OrdenPagoCheque[] = chequeRows.map((c) => ({
      id: c.id, number: c.number, type: c.type, checkNumber: c.checkNumber,
      bank: c.bank, amount: c.amount, dueDate: c.dueDate, status: c.status,
    }));

    const ajusteRows = await prisma.$queryRaw<{
      id: string; ordenPagoId: string; accountId: string | null; accountCode: string | null;
      description: string; type: string; amount: any;
    }[]>`
      SELECT id, "ordenPagoId", "accountId", "accountCode", description, type, amount
      FROM "orden_pago_ajustes" WHERE "ordenPagoId" = ${id}
      ORDER BY "createdAt" ASC
    `;
    const ajustes: OrdenPagoAjuste[] = ajusteRows.map((a) => ({
      id: a.id, ordenPagoId: a.ordenPagoId, accountId: a.accountId, accountCode: a.accountCode,
      description: a.description, type: a.type as any, amount: a.amount,
    }));

    const retencionRows = await prisma.$queryRaw<{
      id: string; ordenPagoId: string; supplierRetentionId: string | null;
      type: string; jurisdiction: string | null; base: string;
      baseAmount: any; percentage: any; amount: any;
      arcaImpuesto: string | null; arcaRegimen: string | null;
      certificate: string | null; notes: string | null;
    }[]>`
      SELECT id, "ordenPagoId", "supplierRetentionId", type, jurisdiction, base,
             "baseAmount", percentage, amount, "arcaImpuesto", "arcaRegimen", certificate, notes
      FROM "orden_pago_retenciones" WHERE "ordenPagoId" = ${id}
      ORDER BY "createdAt" ASC
    `;
    const retenciones: OrdenPagoRetencion[] = retencionRows.map((r) => ({
      id: r.id, ordenPagoId: r.ordenPagoId, supplierRetentionId: r.supplierRetentionId,
      type: r.type, jurisdiction: r.jurisdiction, base: r.base as any,
      baseAmount: r.baseAmount, percentage: r.percentage, amount: r.amount,
      arcaImpuesto: r.arcaImpuesto, arcaRegimen: r.arcaRegimen,
      certificate: r.certificate, notes: r.notes,
    }));

    return { ...mapOrdenPago(rows[0], items), cheques, ajustes, retenciones };
  }

  async findAll(
    pagination: PaginationParams,
    filters: OrdenPagoFilters = {}
  ): Promise<PaginatedResult<OrdenPagoWithRelations>> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (filters.companyId)    conditions.push(Prisma.sql`op."companyId" = ${filters.companyId}`);
    if (filters.fiscalMode)   conditions.push(Prisma.sql`op."fiscalMode" = ${filters.fiscalMode}`);
    if (filters.supplierId)   conditions.push(Prisma.sql`op."supplierId" = ${filters.supplierId}`);
    if (filters.status)       conditions.push(Prisma.sql`op.status = ${filters.status}`);
    if (filters.paymentMethod) conditions.push(Prisma.sql`op."paymentMethod" = ${filters.paymentMethod}`);
    if (filters.dateFrom)     conditions.push(Prisma.sql`op.date >= ${filters.dateFrom}`);
    if (filters.dateTo)       conditions.push(Prisma.sql`op.date <= ${filters.dateTo}`);

    const where = Prisma.join(conditions, ' AND ');

    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "orden_pagos" op WHERE ${where}
      `,
      prisma.$queryRaw<RawOrdenPago[]>`
        SELECT op.*,
          s.name AS "supplierName", s.cuit AS "supplierCuit",
          u.name AS "userName",
          cr.name AS "cashRegisterName"
        FROM "orden_pagos" op
        LEFT JOIN "suppliers" s ON s.id = op."supplierId"
        LEFT JOIN "users" u ON u.id = op."userId"
        LEFT JOIN "cash_registers" cr ON cr.id = op."cashRegisterId"
        WHERE ${where}
        ORDER BY op."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    const ids = rows.map((r) => r.id);
    let allItems: RawItem[] = [];
    if (ids.length > 0) {
      allItems = await prisma.$queryRaw<RawItem[]>`
        ${ITEMS_SELECT}
        WHERE opi."ordenPagoId" IN (${Prisma.join(ids)})
      `;
    }

    const data = rows.map((row) =>
      mapOrdenPago(row, allItems.filter((i) => i.ordenPagoId === row.id))
    );

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: CreateOrdenPagoInput): Promise<OrdenPagoWithRelations> {
    const number = await this.getNextNumber();
    const id = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
    const opId = id[0].id;
    const companyId = data.companyId ?? (() => { throw new Error('companyId is required'); })();
    const currency = data.currency ?? 'ARS';
    const exchangeRate = data.exchangeRate ?? 1;
    const date = data.date ?? new Date();

    // Solo el efectivo mueve caja física. Transferencia, Mercado Pago, tarjeta,
    // cheque y compensación se saldan por fuera, así que no se les asocia caja.
    const effectiveCashRegisterId = data.paymentMethod === 'CASH'
      ? (data.cashRegisterId ?? null)
      : null;

    const fiscalMode = (data as any).fiscalMode ?? 'FORMAL';
    // Monto base: suma de facturas seleccionadas o, si es pago a cuenta, el importe explícito.
    const baseAmount = data.items.length > 0
      ? data.items.reduce((s, i) => s + i.amount, 0)
      : Number(data.amount ?? 0);
    // Ajustes: descuentos (RESTA) e intereses (SUMA) modifican el total a pagar.
    const ajustes = data.ajustes ?? [];
    const ajustesNet = ajustes.reduce((s, a) => s + (a.type === 'SUMA' ? a.amount : -a.amount), 0);
    const totalAmount = baseAmount + ajustesNet;
    if (totalAmount <= 0) {
      throw new Error('El total a pagar debe ser mayor a 0 luego de aplicar los ajustes');
    }
    // Retenciones: a diferencia de los ajustes NO tocan `totalAmount` (las facturas
    // se cancelan por el bruto). Solo reducen el egreso real de dinero.
    const retenciones = data.retenciones ?? [];
    const retentionAmount = Math.round(retenciones.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    if (retentionAmount > totalAmount + 0.005) {
      throw new Error('Las retenciones no pueden superar el total a pagar');
    }
    await prisma.$executeRaw`
      INSERT INTO "orden_pagos" (
        "id", "number", "supplierId", "userId", "cashRegisterId", "companyId",
        "date", "amount", "currency", "exchangeRate", "paymentMethod",
        "reference", "bank", "checkDueDate", "notes", "status", "retentionAmount",
        "createdAt", "updatedAt", "fiscalMode"
      ) VALUES (
        ${opId}, ${number}, ${data.supplierId}, ${data.userId},
        ${effectiveCashRegisterId}, ${companyId}, ${date},
        ${totalAmount},
        ${currency}, ${exchangeRate}, ${data.paymentMethod},
        ${data.reference ?? null}, ${data.bank ?? null},
        ${data.checkDueDate ?? null}, ${data.notes ?? null},
        'EMITTED', ${retentionAmount}, NOW(), NOW(), ${fiscalMode}
      )
    `;

    // Insert items (no financial movements yet — those happen on pay())
    for (const item of data.items) {
      const invRows = await prisma.$queryRaw<{ id: string; purchaseId: string }[]>`
        SELECT id, "purchaseId" FROM "purchase_invoices" WHERE id = ${item.purchaseInvoiceId}
      `;
      if (!invRows[0]) throw new Error(`Purchase invoice ${item.purchaseInvoiceId} not found`);
      const invoice = invRows[0];

      const itemId = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
      await prisma.$executeRaw`
        INSERT INTO "orden_pago_items" ("id", "ordenPagoId", "purchaseInvoiceId", "purchaseId", "amount")
        VALUES (${itemId[0].id}, ${opId}, ${item.purchaseInvoiceId}, ${invoice.purchaseId}, ${item.amount})
      `;
    }

    // Ajustes (descuentos / intereses)
    for (const aj of ajustes) {
      const ajId = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
      await prisma.$executeRaw`
        INSERT INTO "orden_pago_ajustes" ("id", "ordenPagoId", "accountId", "accountCode", "description", "type", "amount")
        VALUES (${ajId[0].id}, ${opId}, ${aj.accountId ?? null}, ${aj.accountCode ?? null}, ${aj.description}, ${aj.type}, ${aj.amount})
      `;
    }

    // Retenciones practicadas — cada una recibe su certificado RET-YYYY-NNNN
    for (const ret of retenciones) {
      const retId = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
      const certificate = await this._getNextRetentionCertificate(companyId);
      // Códigos ARCA (SICORE): se congelan acá. Si el pago no los trajo, salen de
      // la config del proveedor, para que la retención quede exportable igual.
      const arca = await this._resolveArcaCodes(ret);
      await prisma.$executeRaw`
        INSERT INTO "orden_pago_retenciones" (
          "id", "ordenPagoId", "supplierRetentionId", "type", "jurisdiction",
          "base", "baseAmount", "percentage", "amount", "arcaImpuesto", "arcaRegimen",
          "certificate", "notes"
        ) VALUES (
          ${retId[0].id}, ${opId}, ${ret.supplierRetentionId ?? null}, ${ret.type},
          ${ret.jurisdiction ?? null}, ${ret.base}, ${ret.baseAmount},
          ${ret.percentage}, ${ret.amount}, ${arca.impuesto}, ${arca.regimen},
          ${certificate}, ${ret.notes ?? null}
        )
      `;
    }

    // Pago con cheques — solo cuando el método es CHECK
    if (data.paymentMethod === 'CHECK') {
      await this._attachCheques(opId, companyId, fiscalMode, data, currency);
    }

    return this.findById(opId) as Promise<OrdenPagoWithRelations>;
  }

  /**
   * Códigos ARCA de la retención para el archivo de SICORE. Prioridad: lo que
   * mandó el pago → la config del proveedor → el default por tipo de impuesto
   * (Ganancias 217 / IVA 767). El régimen no tiene default: depende de la
   * actividad y lo carga el usuario en la ficha del proveedor.
   */
  private async _resolveArcaCodes(
    ret: CreateOrdenPagoRetencionInput
  ): Promise<{ impuesto: string | null; regimen: string | null }> {
    let impuesto = ret.arcaImpuesto || null;
    let regimen  = ret.arcaRegimen  || null;

    if ((!impuesto || !regimen) && ret.supplierRetentionId) {
      const [cfg] = await prisma.$queryRaw<{ arcaImpuesto: string | null; arcaRegimen: string | null }[]>`
        SELECT "arcaImpuesto", "arcaRegimen" FROM "supplier_retentions" WHERE id = ${ret.supplierRetentionId}
      `;
      impuesto = impuesto || cfg?.arcaImpuesto || null;
      regimen  = regimen  || cfg?.arcaRegimen  || null;
    }

    if (!impuesto) impuesto = ARCA_IMPUESTO_BY_TYPE[ret.type] ?? null;
    return { impuesto, regimen };
  }

  /**
   * Siguiente certificado RET-YYYY-NNNN. Las retenciones solo se practican al
   * pagar, así que la numeración sale de `orden_pago_retenciones`.
   */
  private async _getNextRetentionCertificate(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RET-${year}-%`;
    const [row] = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c
      FROM "orden_pago_retenciones" ret
      JOIN "orden_pagos" op ON op.id = ret."ordenPagoId"
      WHERE op."companyId" = ${companyId} AND ret.certificate LIKE ${prefix}
    `;
    return `RET-${year}-${String(Number(row?.c ?? 0n) + 1).padStart(4, '0')}`;
  }

  /**
   * Vincula cheques a la Orden de Pago:
   *  - chequesEnCartera: cheques de tercero (INGRESO) que se endosan al proveedor →
   *    quedan ENDOSADO, ligados a la OP y reasignados al proveedor.
   *  - chequesPropios: cheques propios (EGRESO) que se emiten, tomando la numeración
   *    de la chequera indicada (vía PrismaChequeRepository → consumeNextNumber).
   */
  private async _attachCheques(
    opId: string,
    companyId: string,
    fiscalMode: string,
    data: CreateOrdenPagoInput,
    currency: string
  ): Promise<void> {
    // 1. Endosar cheques de tercero en cartera
    for (const chequeId of data.chequesEnCartera ?? []) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "cheques"
        WHERE id = ${chequeId} AND "companyId" = ${companyId}
          AND "type" = 'INGRESO' AND "status" = 'PENDING' AND "ordenPagoId" IS NULL
      `;
      if (!rows[0]) {
        throw new Error(`El cheque seleccionado no está disponible en cartera para endosar`);
      }
      await prisma.$executeRaw`
        UPDATE "cheques"
        SET "status" = 'ENDOSADO',
            "ordenPagoId" = ${opId},
            "supplierId" = ${data.supplierId},
            "updatedAt" = NOW()
        WHERE id = ${chequeId} AND "companyId" = ${companyId}
      `;
    }

    // 2. Emitir cheques propios desde la chequera (numeración automática)
    const propios = data.chequesPropios ?? [];
    if (propios.length > 0) {
      const supRows = await prisma.$queryRaw<{ name: string }[]>`
        SELECT name FROM "suppliers" WHERE id = ${data.supplierId} LIMIT 1
      `;
      const supplierName = supRows[0]?.name;
      const chequeRepo = container.resolve<IChequeRepository>('ChequeRepository');
      for (const ch of propios) {
        await chequeRepo.create({
          type:        'EGRESO',
          checkNumber: ch.checkNumber,
          bank:        ch.bank,
          amount:      ch.amount,
          currency,
          dueDate:     ch.dueDate,
          beneficiary: supplierName,
          supplierId:  data.supplierId,
          chequeraId:  ch.chequeraId,
          ordenPagoId: opId,
          userId:      data.userId,
          companyId,
          fiscalMode,
        });
      }
    }
  }

  async pay(id: string): Promise<OrdenPagoWithRelations> {
    const op = await this.findById(id);
    if (!op) throw new Error('OrdenPago not found');

    // Lecturas previas (no necesitan la transacción)
    const isPagoACuenta = op.items.length === 0;
    const hasCuentaCorriente = await this._opHasCuentaCorriente(op);
    const existingMovement = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "supplier_account_movements" WHERE "ordenPagoId" = ${id} LIMIT 1
    `;

    // Estado + recalcs de facturas + cuenta corriente se confirman o
    // revierten juntos: un pago a medias dejaba la OP en PAID sin CREDIT.
    await prisma.$transaction(async (tx) => {
      // Mark the OP as PAID first so the per-invoice recalc counts its items.
      await tx.$executeRaw`
        UPDATE "orden_pagos" SET status = 'PAID', "updatedAt" = NOW() WHERE id = ${id}
      `;

      // Recompute each invoice status from the total imputed by PAID orders: a payment
      // for less than the invoice total leaves it PARTIALLY_PAID, never PAID.
      for (const item of op.items) {
        if (item.purchaseInvoiceId) {
          await this._recalcPurchaseInvoicePaymentStatus(item.purchaseInvoiceId, tx);
          if (item.purchaseId) await this._recalcPurchasePaymentStatus(item.purchaseId, tx);
        }
      }

      // Movimiento de cuenta corriente: si las facturas pagadas son de cuenta
      // corriente, o si es un pago a cuenta (sin facturas) → genera CREDIT.
      if ((isPagoACuenta || hasCuentaCorriente) && existingMovement.length === 0) {
        const fiscalMode = ((op as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';

        if (isPagoACuenta) {
          // Sin facturas: un solo movimiento, en la moneda de liquidación de la OP.
          await this.createSupplierMovement({
            supplierId: op.supplierId,
            ordenPagoId: id,
            type: 'CREDIT',
            amount: Number(op.amount),
            currency: op.currency,
            description: `Pago a cuenta ${op.number}`,
            companyId: op.companyId,
            fiscalMode,
          }, tx);
        } else {
          // Con facturas: una OP puede pagar facturas en más de una moneda (el
          // frontend convierte los ítems en USD a la moneda de liquidación con
          // `op.exchangeRate`). Reconstruimos el monto en la moneda PROPIA de
          // cada factura para no netear USD contra ARS en la cuenta corriente.
          const byCurrency = new Map<string, number>();
          for (const item of op.items) {
            const invCurrency = item.purchaseInvoiceId ? (item.invoice?.currency ?? op.currency) : op.currency;
            const converted = invCurrency === op.currency
              ? Number(item.amount)
              : Number(item.amount) / Number(op.exchangeRate);
            byCurrency.set(invCurrency, (byCurrency.get(invCurrency) ?? 0) + converted);
          }
          // Ajustes (descuentos/intereses): no están atados a una factura, quedan
          // en la moneda de liquidación de la propia OP.
          const ajustesNet = (op.ajustes ?? []).reduce(
            (s, a) => s + (a.type === 'SUMA' ? Number(a.amount) : -Number(a.amount)), 0
          );
          if (ajustesNet !== 0) byCurrency.set(op.currency, (byCurrency.get(op.currency) ?? 0) + ajustesNet);

          for (const [curr, amount] of byCurrency) {
            if (Math.abs(amount) < 0.005) continue;
            await this.createSupplierMovement({
              supplierId: op.supplierId,
              ordenPagoId: id,
              type: amount > 0 ? 'CREDIT' : 'DEBIT',
              amount: Math.abs(amount),
              currency: curr,
              description: `Orden de Pago ${op.number}`,
              companyId: op.companyId,
              fiscalMode,
            }, tx);
          }
        }
      }
    }, { timeout: 30000 });

    return this.findById(id) as Promise<OrdenPagoWithRelations>;
  }

  async cancel(id: string): Promise<OrdenPago> {
    const op = await this.findById(id);
    if (!op) throw new Error('OrdenPago not found');

    // Only revert financial movements if the OP was already PAID
    if (op.status !== 'PAID') {
      await prisma.$executeRaw`
        UPDATE "orden_pagos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${id}
      `;
      const rows = await prisma.$queryRaw<RawOrdenPago[]>`SELECT * FROM "orden_pagos" WHERE id = ${id}`;
      return rows[0] as any as OrdenPago;
    }

    // Lectura previa (no necesita la transacción)
    const shouldReverseMovement = op.items.length === 0 || await this._opHasCuentaCorriente(op);

    // Estado + recalcs + reversa de cuenta corriente, todo o nada.
    await prisma.$transaction(async (tx) => {
      // Mark the OP cancelled first so the per-invoice recalc no longer counts its items.
      await tx.$executeRaw`
        UPDATE "orden_pagos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${id}
      `;

      // Recompute each invoice status from the remaining PAID orders (it may still be
      // PARTIALLY_PAID if other orders imputed part of it).
      for (const item of op.items) {
        if (item.purchaseInvoiceId) {
          await this._recalcPurchaseInvoicePaymentStatus(item.purchaseInvoiceId, tx);
          if (item.purchaseId) await this._recalcPurchasePaymentStatus(item.purchaseId, tx);
        } else {
          // Backward compat: items without purchaseInvoiceId use old paidAmount logic
          const amount = Number(item.amount);
          await tx.$executeRaw`
            UPDATE "purchases"
            SET "paidAmount" = GREATEST("paidAmount" - ${amount}, 0),
                "paymentStatus" = CASE
                  WHEN GREATEST("paidAmount" - ${amount}, 0) = 0     THEN 'PENDING'
                  WHEN GREATEST("paidAmount" - ${amount}, 0) < total THEN 'PARTIALLY_PAID'
                  ELSE 'PAID'
                END,
                "updatedAt" = NOW()
            WHERE id = ${item.purchaseId}
          `;
        }
      }

      // Reverse supplier account movement for CC invoices or pago a cuenta (no invoices)
      if (shouldReverseMovement) {
        await this.cancelSupplierMovement(id, tx);
      }
    }, { timeout: 30000 });

    const rows = await prisma.$queryRaw<RawOrdenPago[]>`
      SELECT * FROM "orden_pagos" WHERE id = ${id}
    `;
    return rows[0] as any as OrdenPago;
  }

  // True when any invoice (or, for legacy items, any purchase) paid by this OP is
  // on cuenta corriente. The invoice is the source of truth for the debt now.
  private async _opHasCuentaCorriente(op: OrdenPagoWithRelations): Promise<boolean> {
    const invoiceIds = [...new Set(op.items.map((i) => i.purchaseInvoiceId).filter(Boolean) as string[])];
    if (invoiceIds.length > 0) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "purchase_invoices"
        WHERE id IN (${Prisma.join(invoiceIds)}) AND "saleCondition" = 'CUENTA_CORRIENTE'
        LIMIT 1
      `;
      if (rows.length > 0) return true;
    }
    // Legacy fallback: items linked only to a purchase
    const purchaseIds = [...new Set(op.items.map((i) => i.purchaseId).filter(Boolean) as string[])];
    if (purchaseIds.length > 0) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "purchases"
        WHERE id IN (${Prisma.join(purchaseIds)}) AND "saleCondition" = 'CUENTA_CORRIENTE'
        LIMIT 1
      `;
      if (rows.length > 0) return true;
    }
    return false;
  }

  // Recompute a purchase invoice's status from the total imputed by PAID orders of
  // payment PLUS manual cuenta-corriente adjustments (supplier_cc_adjustment_items):
  // nothing → PENDING, less than the total → PARTIALLY_PAID, full → PAID.
  // Se usa tanto para facturas/ND (deuda que se paga) como para NC (crédito que
  // se consume) — en ambos casos "total imputado" reduce el saldo del comprobante.
  // Compara lo pagado contra pi.amount EN LA MONEDA DE LA FACTURA: si la OP se
  // liquidó en otra moneda (p.ej. factura en USD pagada en ARS), el monto del
  // ítem se reconstruye a la moneda de la factura dividiendo por la cotización
  // usada en esa OP. Sin esto, una factura USD 8.000 pagada con $12.000.000
  // ARS quedaba "PAID" con solo comparar los números sin convertir. Los ítems de
  // ajuste ya se registran en la moneda de la factura (mismo control al crear el
  // ajuste), no requieren conversión.
  private async _recalcPurchaseInvoicePaymentStatus(invoiceId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? prisma).$executeRaw`
      UPDATE "purchase_invoices" pi
      SET status = CASE
            WHEN paid.total <= 0                  THEN 'PENDING'
            WHEN paid.total < pi.amount - 0.01    THEN 'PARTIALLY_PAID'
            ELSE 'PAID'
          END,
          "updatedAt" = NOW()
      FROM (
        SELECT
          COALESCE((
            SELECT SUM(
              CASE WHEN op.currency = pi2.currency
                   THEN opi.amount
                   ELSE opi.amount / NULLIF(op."exchangeRate", 0)
              END
            )
            FROM "orden_pago_items" opi
            JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
            WHERE opi."purchaseInvoiceId" = ${invoiceId} AND op.status = 'PAID'
          ), 0)
          +
          COALESCE((
            SELECT SUM(item.amount)
            FROM "supplier_cc_adjustment_items" item
            WHERE item."purchaseInvoiceId" = ${invoiceId}
          ), 0) AS total
        FROM "purchase_invoices" pi2
        WHERE pi2.id = ${invoiceId}
      ) paid
      WHERE pi.id = ${invoiceId}
    `;
  }

  private async _recalcPurchasePaymentStatus(purchaseId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? prisma).$executeRaw`
      UPDATE "purchases"
      SET "paymentStatus" = CASE
        WHEN NOT EXISTS (SELECT 1 FROM "purchase_invoices" WHERE "purchaseId" = ${purchaseId}) THEN 'PENDING'
        WHEN NOT EXISTS (SELECT 1 FROM "purchase_invoices" WHERE "purchaseId" = ${purchaseId} AND status <> 'PAID') THEN 'PAID'
        WHEN EXISTS     (SELECT 1 FROM "purchase_invoices" WHERE "purchaseId" = ${purchaseId} AND status IN ('PAID', 'PARTIALLY_PAID')) THEN 'PARTIALLY_PAID'
        ELSE 'PENDING'
      END,
      "updatedAt" = NOW()
      WHERE id = ${purchaseId}
    `;
  }

  // ── Supplier current account ──────────────────────────────────────────────

  // Saldo por moneda: nunca se netea una deuda en USD contra un pago en ARS.
  async getSupplierBalance(supplierId: string, companyId?: string, fiscalMode?: string, tx?: Prisma.TransactionClient): Promise<Record<string, number>> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"supplierId" = ${supplierId}`];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    if (fiscalMode) conditions.push(Prisma.sql`"fiscalMode" = ${fiscalMode}`);
    const where = Prisma.join(conditions, ' AND ');

    const rows = await (tx ?? prisma).$queryRaw<{ currency: string; balance: any }[]>`
      SELECT currency,
        COALESCE(
          SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END) -
          SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END),
          0
        ) AS balance
      FROM "supplier_account_movements"
      WHERE ${where}
      GROUP BY currency
    `;
    const result: Record<string, number> = {};
    for (const r of rows) result[r.currency] = Number(r.balance ?? 0);
    return result;
  }

  // Saldo de una sola moneda (uso interno: running balance de un movimiento nuevo).
  private async _getSupplierCurrencyBalance(
    supplierId: string, currency: string, companyId?: string, tx?: Prisma.TransactionClient
  ): Promise<number> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"supplierId" = ${supplierId}`, Prisma.sql`currency = ${currency}`];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    const where = Prisma.join(conditions, ' AND ');

    const rows = await (tx ?? prisma).$queryRaw<{ balance: any }[]>`
      SELECT COALESCE(
        SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END) -
        SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END),
        0
      ) AS balance
      FROM "supplier_account_movements"
      WHERE ${where}
    `;
    return Number(rows[0]?.balance ?? 0);
  }

  async getSupplierMovements(
    supplierId: string,
    pagination: PaginationParams,
    companyId?: string,
    filters?: SupplierMovementFilters,
    fiscalMode?: string
  ): Promise<PaginatedResult<SupplierAccountMovement> & { openingBalance: Record<string, number> }> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    // Clasificación del origen (consistente entre WHERE y SELECT)
    const kindExpr = Prisma.sql`
      CASE
        WHEN sam."internalNoteId" IS NOT NULL          THEN 'NOTE'
        WHEN sam.description ILIKE 'Retenciones%'       THEN 'RETENTION'
        WHEN pi.type LIKE 'NOTA_CREDITO%'               THEN 'NC'
        WHEN pi.type LIKE 'NOTA_DEBITO%'                THEN 'ND'
        WHEN pi.id IS NOT NULL                          THEN 'FC'
        WHEN sam."adjustmentId" IS NOT NULL             THEN 'ADJUSTMENT'
        WHEN sam."ordenPagoId" IS NOT NULL              THEN 'OP'
        WHEN sam."purchaseId" IS NOT NULL               THEN 'PURCHASE'
        ELSE 'OTHER'
      END`;

    const conditions: Prisma.Sql[] = [Prisma.sql`sam."supplierId" = ${supplierId}`];
    if (companyId) conditions.push(Prisma.sql`sam."companyId" = ${companyId}`);
    if (fiscalMode) conditions.push(Prisma.sql`sam."fiscalMode" = ${fiscalMode}`);
    if (filters?.type) conditions.push(Prisma.sql`sam.type = ${filters.type}`);
    if (filters?.currency) conditions.push(Prisma.sql`sam.currency = ${filters.currency}`);
    if (filters?.dateFrom) conditions.push(Prisma.sql`sam."createdAt" >= ${new Date(filters.dateFrom)}`);
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(Prisma.sql`sam."createdAt" <= ${to}`);
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(Prisma.sql`(
        sam.description ILIKE ${term} OR op.number ILIKE ${term}
        OR pi.number ILIKE ${term} OR pu.number ILIKE ${term} OR inn.number ILIKE ${term}
      )`);
    }
    if (filters?.kinds && filters.kinds.length > 0) {
      conditions.push(Prisma.sql`(${kindExpr}) IN (${Prisma.join(filters.kinds)})`);
    }
    const where = Prisma.join(conditions, ' AND ');

    const joins = Prisma.sql`
      FROM "supplier_account_movements" sam
      LEFT JOIN "orden_pagos"        op  ON op.id  = sam."ordenPagoId"
      LEFT JOIN "purchase_invoices"  pi  ON pi.id  = sam."purchaseInvoiceId"
      LEFT JOIN "purchases"          pu  ON pu.id  = sam."purchaseId"
      LEFT JOIN "internal_notes"     inn ON inn.id = sam."internalNoteId"
      WHERE ${where}`;

    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count ${joins}`,
      prisma.$queryRaw<(RawMovement & { kind: string; purchaseInvoiceId: string | null; docNumber: string | null })[]>`
        SELECT sam.*,
               (${kindExpr}) AS kind,
               COALESCE(op.number, pi.number, pu.number, inn.number) AS "docNumber",
               COALESCE(pi.date, op.date, pu.date, inn."createdAt", sam."createdAt") AS "docDate"
        ${joins}
        ORDER BY sam."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);

    // Saldo al inicio, por moneda: balance acumulado de TODOS los movimientos
    // anteriores a `dateFrom` (independiente de los filtros de tipo/kind del rango).
    const openingBalance: Record<string, number> = {};
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom);
      const openConds: Prisma.Sql[] = [
        Prisma.sql`sam."supplierId" = ${supplierId}`,
        Prisma.sql`sam."createdAt" < ${from}`,
      ];
      if (companyId) openConds.push(Prisma.sql`sam."companyId" = ${companyId}`);
      if (fiscalMode) openConds.push(Prisma.sql`sam."fiscalMode" = ${fiscalMode}`);
      const openRows = await prisma.$queryRaw<{ currency: string; opening: any }[]>`
        SELECT sam.currency, COALESCE(SUM(CASE WHEN sam.type = 'DEBIT' THEN sam.amount ELSE -sam.amount END), 0) AS opening
        FROM "supplier_account_movements" sam
        WHERE ${Prisma.join(openConds, ' AND ')}
        GROUP BY sam.currency
      `;
      for (const r of openRows) openingBalance[r.currency] = Number(r.opening ?? 0);
    }

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows as any as SupplierAccountMovement[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
      openingBalance,
    };
  }

  async createSupplierMovement(data: CreateSupplierMovementInput, tx?: Prisma.TransactionClient): Promise<SupplierAccountMovement> {
    const client = tx ?? prisma;
    const companyId = data.companyId ?? (() => { throw new Error('companyId is required'); })();
    const currency = data.currency ?? 'ARS';
    const fiscalMode = data.fiscalMode ?? 'FORMAL';

    const currentBalance = await this._getSupplierCurrencyBalance(data.supplierId, currency, companyId, tx);
    const newBalance = data.type === 'DEBIT'
      ? currentBalance + data.amount
      : currentBalance - data.amount;

    const movId = await client.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;

    await client.$executeRaw`
      INSERT INTO "supplier_account_movements" (
        "id", "supplierId", "ordenPagoId", "purchaseId", "purchaseInvoiceId",
        "type", "amount", "currency", "balance", "description", "companyId", "fiscalMode"
      ) VALUES (
        ${movId[0].id}, ${data.supplierId},
        ${data.ordenPagoId ?? null}, ${data.purchaseId ?? null}, ${data.purchaseInvoiceId ?? null},
        ${data.type}, ${data.amount}, ${currency},
        ${newBalance}, ${data.description ?? null}, ${companyId}, ${fiscalMode}
      )
    `;

    const rows = await client.$queryRaw<RawMovement[]>`
      SELECT * FROM "supplier_account_movements" WHERE id = ${movId[0].id}
    `;
    return rows[0] as any as SupplierAccountMovement;
  }

  // Una OP cancelada no debe seguir figurando en la cuenta corriente del
  // proveedor — igual que una factura anulada, sus movimientos se eliminan
  // directamente (sin dejar un asiento de "Reversión") en vez de compensarlos.
  async cancelSupplierMovement(ordenPagoId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? prisma;
    await client.$executeRaw`
      DELETE FROM "supplier_account_movements" WHERE "ordenPagoId" = ${ordenPagoId}
    `;
  }

  // Reverses the supplier account movement(s) generated by a purchase / NC / ND
  // when that purchase is cancelled. Adds an opposite-sign movement preserving
  // history (does not delete the original).
  async reverseSupplierMovementByPurchase(purchaseId: string): Promise<void> {
    const rows = await prisma.$queryRaw<RawMovement[]>`
      SELECT * FROM "supplier_account_movements"
      WHERE "purchaseId" = ${purchaseId} AND "description" NOT LIKE 'Reversión:%'
    `;
    for (const original of rows) {
      await this.createSupplierMovement({
        supplierId: original.supplierId,
        purchaseId,
        type: original.type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
        amount: Number(original.amount),
        currency: original.currency,
        description: `Reversión: ${original.description ?? ''}`.trim(),
        companyId: original.companyId,
        fiscalMode: (original.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
      });
    }
  }

  // Re-syncs the supplier current-account movements derived from a purchase invoice.
  // The invoice is now the document that drives the debt:
  //   * Main movement: Factura/Nota de Débito → DEBIT (we owe more);
  //     Nota de Crédito → CREDIT (we owe less). `amount` already includes
  //     percepciones / otros tributos (folded in by the form), so no separate
  //     tributos movement is needed. Retenciones are NOT part of the invoice:
  //     they are withheld when paying (see OrdenPagoRetencion).
  // Idempotent: deletes existing movements for this invoice first. Only applies
  // when the invoice's saleCondition is CUENTA_CORRIENTE.
  async syncPurchaseInvoiceMovements(purchaseInvoiceId: string): Promise<void> {
    // Always clear previous movements for this invoice (balance is recomputed on read)
    await prisma.$executeRaw`
      DELETE FROM "supplier_account_movements" WHERE "purchaseInvoiceId" = ${purchaseInvoiceId}
    `;

    // Read the invoice's own fields; fall back to the (legacy) linked purchase
    // for supplier/currency/saleCondition when the invoice predates standalone mode.
    const rows = await prisma.$queryRaw<{
      number: string; purchaseId: string | null; companyId: string; fiscalMode: string | null;
      type: string; amount: any; supplierId: string | null; saleCondition: string | null; currency: string | null;
    }[]>`
      SELECT pi.number, pi."purchaseId", pi."companyId", pi."fiscalMode", pi.type, pi.amount,
             COALESCE(pi."supplierId", p."supplierId")          AS "supplierId",
             COALESCE(pi."saleCondition", p."saleCondition")    AS "saleCondition",
             COALESCE(pi.currency, p.currency::text, 'ARS')     AS currency
      FROM "purchase_invoices" pi
      LEFT JOIN "purchases" p ON p.id = pi."purchaseId"
      WHERE pi.id = ${purchaseInvoiceId}
    `;
    const inv = rows[0];
    if (!inv || !inv.supplierId || inv.saleCondition !== 'CUENTA_CORRIENTE') return;

    const isNC = String(inv.type).startsWith('NOTA_CREDITO');
    const isND = String(inv.type).startsWith('NOTA_DEBITO');
    const mainType: 'DEBIT' | 'CREDIT' = isNC ? 'CREDIT' : 'DEBIT';
    const docLabel = isNC ? 'Nota de Crédito' : isND ? 'Nota de Débito' : 'Factura';

    const fiscalMode = (inv.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
    const currency = inv.currency ?? 'ARS';

    // Main movement: full invoice amount (incl. percepciones / otros tributos)
    const amount = Number(inv.amount);
    if (amount > 0) {
      await this.createSupplierMovement({
        supplierId: inv.supplierId,
        purchaseId: inv.purchaseId ?? undefined,
        purchaseInvoiceId,
        type: mainType,
        amount,
        currency,
        description: `${docLabel} en CC: ${inv.number}`,
        companyId: inv.companyId,
        fiscalMode,
      });
    }
  }

  // ── Imputación manual de cuenta corriente (fuera del flujo de OP) ──────────

  // Débitos abiertos (FC/ND) + créditos disponibles (NC sueltas + movimientos
  // CREDIT sin factura, ej. pago a cuenta) para armar un ajuste. `appliedTotal`
  // ya descuenta lo imputado por OPs pagadas y por ajustes previos.
  async getOpenAccountItems(
    supplierId: string, companyId?: string, tx?: Prisma.TransactionClient
  ): Promise<{ debits: OpenDebitItem[]; credits: OpenCreditItem[] }> {
    const client = tx ?? prisma;

    const debitRows = await client.$queryRaw<{
      purchaseInvoiceId: string; number: string; type: string; currency: string;
      amount: any; dueDate: Date | null; appliedTotal: any;
    }[]>`
      SELECT pi.id AS "purchaseInvoiceId", pi.number, pi.type, pi.currency, pi.amount, pi."dueDate",
        COALESCE((
          SELECT SUM(CASE WHEN op.currency = pi.currency THEN opi.amount ELSE opi.amount / NULLIF(op."exchangeRate", 0) END)
          FROM "orden_pago_items" opi
          JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
          WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
        ), 0)
        +
        COALESCE((
          SELECT SUM(amount) FROM "supplier_cc_adjustment_items" WHERE side = 'DEBIT' AND "purchaseInvoiceId" = pi.id
        ), 0) AS "appliedTotal"
      FROM "purchase_invoices" pi
      WHERE pi."supplierId" = ${supplierId}
        ${companyId ? Prisma.sql`AND pi."companyId" = ${companyId}` : Prisma.empty}
        AND pi.status IN ('PENDING', 'PARTIALLY_PAID')
        AND pi.type NOT LIKE 'NOTA_CREDITO%'
      ORDER BY pi."createdAt" ASC
    `;

    const ncRows = await client.$queryRaw<{
      purchaseInvoiceId: string; number: string; currency: string; amount: any;
      date: Date; appliedTotal: any;
    }[]>`
      SELECT pi.id AS "purchaseInvoiceId", pi.number, pi.currency, pi.amount, pi.date,
        COALESCE((
          SELECT SUM(amount) FROM "supplier_cc_adjustment_items" WHERE side = 'CREDIT' AND "purchaseInvoiceId" = pi.id
        ), 0) AS "appliedTotal"
      FROM "purchase_invoices" pi
      WHERE pi."supplierId" = ${supplierId}
        ${companyId ? Prisma.sql`AND pi."companyId" = ${companyId}` : Prisma.empty}
        AND pi.status IN ('PENDING', 'PARTIALLY_PAID')
        AND pi.type LIKE 'NOTA_CREDITO%'
      ORDER BY pi."createdAt" ASC
    `;

    const movRows = await client.$queryRaw<{
      movementId: string; description: string | null; currency: string; amount: any; createdAt: Date; appliedTotal: any;
    }[]>`
      SELECT sam.id AS "movementId", sam.description, sam.currency, sam.amount, sam."createdAt",
        COALESCE((
          SELECT SUM(amount) FROM "supplier_cc_adjustment_items" WHERE "movementId" = sam.id
        ), 0) AS "appliedTotal"
      FROM "supplier_account_movements" sam
      WHERE sam."supplierId" = ${supplierId}
        ${companyId ? Prisma.sql`AND sam."companyId" = ${companyId}` : Prisma.empty}
        AND sam.type = 'CREDIT'
        AND sam."purchaseInvoiceId" IS NULL
        AND (sam."ordenPagoId" IS NOT NULL OR sam."adjustmentId" IS NOT NULL)
      ORDER BY sam."createdAt" ASC
    `;

    const debits: OpenDebitItem[] = debitRows
      .map((r) => ({
        purchaseInvoiceId: r.purchaseInvoiceId, number: r.number, type: r.type, currency: r.currency,
        amount: Number(r.amount), appliedTotal: Number(r.appliedTotal),
        balance: Number(r.amount) - Number(r.appliedTotal), dueDate: r.dueDate,
      }))
      .filter((d) => d.balance > 0.01);

    const ncCredits: OpenCreditItem[] = ncRows
      .map((r) => ({
        source: 'INVOICE' as const, purchaseInvoiceId: r.purchaseInvoiceId, number: r.number, currency: r.currency,
        amount: Number(r.amount), appliedTotal: Number(r.appliedTotal),
        balance: Number(r.amount) - Number(r.appliedTotal), date: r.date,
      }))
      .filter((c) => c.balance > 0.01);

    const movCredits: OpenCreditItem[] = movRows
      .map((r) => ({
        source: 'MOVEMENT' as const, movementId: r.movementId, number: r.description ?? 'Crédito', currency: r.currency,
        amount: Number(r.amount), appliedTotal: Number(r.appliedTotal),
        balance: Number(r.amount) - Number(r.appliedTotal), date: r.createdAt,
      }))
      .filter((c) => c.balance > 0.01);

    return { debits, credits: [...ncCredits, ...movCredits] };
  }

  // Crea un ajuste de cuenta corriente: imputa los débitos/créditos seleccionados
  // (sin generar movimiento — ya están reflejados en el saldo agregado) y, si
  // `manualAmount` > 0, agrega un crédito sintético (condonación/diferencia) que
  // SÍ genera un único movimiento nuevo en el ledger.
  async createCcAdjustment(input: CreateSupplierCcAdjustmentInput): Promise<SupplierCcAdjustment> {
    const sumDebits = input.debits.reduce((s, d) => s + d.amount, 0);
    const sumExplicitCredits = input.credits.reduce((s, c) => s + c.amount, 0);
    const manualAmount = Math.max(0, input.manualAmount ?? 0);

    if (sumDebits <= 0 && sumExplicitCredits <= 0 && manualAmount <= 0) {
      throw new Error('Seleccioná al menos un comprobante para imputar');
    }
    const gap = sumDebits - sumExplicitCredits;
    if (manualAmount > gap + 0.01) {
      throw new Error('El ajuste manual no puede superar la diferencia entre lo seleccionado');
    }

    const adjustmentId = (await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0].id;

    await prisma.$transaction(async (tx) => {
      // Revalida server-side contra el estado actual (no confía en lo que mandó el front)
      const open = await this.getOpenAccountItems(input.supplierId, input.companyId, tx);
      const debitMap = new Map(open.debits.map((d) => [d.purchaseInvoiceId, d]));
      const creditByInvoice = new Map(open.credits.filter((c) => c.source === 'INVOICE').map((c) => [c.purchaseInvoiceId!, c]));
      const creditByMovement = new Map(open.credits.filter((c) => c.source === 'MOVEMENT').map((c) => [c.movementId!, c]));

      for (const d of input.debits) {
        const found = debitMap.get(d.purchaseInvoiceId);
        if (!found) throw new Error(`Factura ${d.purchaseInvoiceId} no está pendiente`);
        if (d.amount > found.balance + 0.01) throw new Error(`El monto supera el saldo pendiente de ${found.number}`);
      }
      for (const c of input.credits) {
        const found = c.purchaseInvoiceId ? creditByInvoice.get(c.purchaseInvoiceId) : c.movementId ? creditByMovement.get(c.movementId) : undefined;
        if (!found) throw new Error('Crédito no disponible');
        if (c.amount > found.balance + 0.01) throw new Error(`El monto supera el saldo disponible de ${found.number}`);
      }

      await tx.$executeRaw`
        INSERT INTO "supplier_cc_adjustments"
          ("id", "supplierId", "companyId", "fiscalMode", "currency", "manualAmount", "description", "userId")
        VALUES
          (${adjustmentId}, ${input.supplierId}, ${input.companyId}, ${input.fiscalMode ?? 'FORMAL'},
           ${input.currency}, ${manualAmount}, ${input.description ?? null}, ${input.userId})
      `;

      for (const d of input.debits) {
        const itemId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0].id;
        await tx.$executeRaw`
          INSERT INTO "supplier_cc_adjustment_items" ("id", "adjustmentId", "side", "purchaseInvoiceId", "amount")
          VALUES (${itemId}, ${adjustmentId}, 'DEBIT', ${d.purchaseInvoiceId}, ${d.amount})
        `;
      }
      for (const c of input.credits) {
        const itemId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0].id;
        await tx.$executeRaw`
          INSERT INTO "supplier_cc_adjustment_items" ("id", "adjustmentId", "side", "purchaseInvoiceId", "movementId", "amount")
          VALUES (${itemId}, ${adjustmentId}, 'CREDIT', ${c.purchaseInvoiceId ?? null}, ${c.movementId ?? null}, ${c.amount})
        `;
      }

      if (manualAmount > 0) {
        const itemId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0].id;
        await tx.$executeRaw`
          INSERT INTO "supplier_cc_adjustment_items" ("id", "adjustmentId", "side", "amount")
          VALUES (${itemId}, ${adjustmentId}, 'CREDIT', ${manualAmount})
        `;
        const movement = await this.createSupplierMovement({
          supplierId: input.supplierId,
          type: 'CREDIT',
          amount: manualAmount,
          currency: input.currency,
          description: input.description ? `Ajuste CC: ${input.description}` : 'Ajuste de cuenta corriente',
          companyId: input.companyId,
          fiscalMode: input.fiscalMode ?? 'FORMAL',
        }, tx);
        await tx.$executeRaw`
          UPDATE "supplier_account_movements" SET "adjustmentId" = ${adjustmentId} WHERE id = ${movement.id}
        `;
      }

      const touchedInvoiceIds = new Set<string>([
        ...input.debits.map((d) => d.purchaseInvoiceId),
        ...input.credits.map((c) => c.purchaseInvoiceId).filter(Boolean) as string[],
      ]);
      for (const invoiceId of touchedInvoiceIds) {
        await this._recalcPurchaseInvoicePaymentStatus(invoiceId, tx);
      }
    }, { timeout: 30000 });

    const header = (await prisma.$queryRaw<any[]>`SELECT * FROM "supplier_cc_adjustments" WHERE id = ${adjustmentId}`)[0];
    const items = await prisma.$queryRaw<any[]>`SELECT * FROM "supplier_cc_adjustment_items" WHERE "adjustmentId" = ${adjustmentId}`;
    return { ...header, items } as SupplierCcAdjustment;
  }
}
