import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { IOrdenPagoRepository, OrdenPagoFilters } from '../../../domain/repositories/IOrdenPagoRepository';
import { OrdenPago, OrdenPagoWithRelations, CreateOrdenPagoInput } from '../../../domain/entities/OrdenPago';
import { SupplierAccountMovement, CreateSupplierMovementInput } from '../../../domain/entities/SupplierAccountMovement';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

type RawOrdenPago = {
  id: string; number: string; supplierId: string; userId: string;
  cashRegisterId: string | null; companyId: string; date: Date;
  amount: any; currency: string; exchangeRate: any;
  paymentMethod: string; reference: string | null; bank: string | null;
  checkDueDate: Date | null; notes: string | null; status: string;
  createdAt: Date; updatedAt: Date;
  supplierName?: string; supplierCuit?: string | null;
  userName?: string;
  cashRegisterName?: string | null;
};

type RawItem = {
  id: string; ordenPagoId: string; purchaseId: string; amount: any;
  purchaseNumber?: string; purchaseTotal?: any; purchasePaidAmount?: any; purchaseDate?: Date;
};

type RawMovement = {
  id: string; supplierId: string; ordenPagoId: string | null; purchaseId: string | null;
  type: string; amount: any; currency: string; balance: any;
  description: string | null; companyId: string; createdAt: Date; updatedAt: Date;
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
      amount: i.amount,
      purchase: i.purchaseNumber
        ? {
            id: i.purchaseId,
            number: i.purchaseNumber,
            total: i.purchaseTotal,
            paidAmount: i.purchasePaidAmount,
            date: i.purchaseDate!,
          }
        : undefined,
    })),
  };
}

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

  async findById(id: string): Promise<OrdenPagoWithRelations | null> {
    const rows = await prisma.$queryRaw<RawOrdenPago[]>`
      SELECT op.*,
        s.name AS "supplierName", s.cuit AS "supplierCuit",
        u.name AS "userName",
        cr.name AS "cashRegisterName"
      FROM "orden_pagos" op
      LEFT JOIN "suppliers" s ON s.id = op."supplierId"
      LEFT JOIN "users" u ON u.id = op."userId"
      LEFT JOIN "cash_registers" cr ON cr.id = op."cashRegisterId"
      WHERE op.id = ${id}
    `;
    if (!rows[0]) return null;

    const items = await prisma.$queryRaw<RawItem[]>`
      SELECT opi.*, p.number AS "purchaseNumber",
        p.total AS "purchaseTotal", p."paidAmount" AS "purchasePaidAmount",
        p.date AS "purchaseDate"
      FROM "orden_pago_items" opi
      LEFT JOIN "purchases" p ON p.id = opi."purchaseId"
      WHERE opi."ordenPagoId" = ${id}
    `;
    return mapOrdenPago(rows[0], items);
  }

  async findAll(
    pagination: PaginationParams,
    filters: OrdenPagoFilters = {}
  ): Promise<PaginatedResult<OrdenPagoWithRelations>> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (filters.companyId)    conditions.push(Prisma.sql`op."companyId" = ${filters.companyId}`);
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

    // Batch-load items
    const ids = rows.map((r) => r.id);
    let allItems: RawItem[] = [];
    if (ids.length > 0) {
      allItems = await prisma.$queryRaw<RawItem[]>`
        SELECT opi.*, p.number AS "purchaseNumber",
          p.total AS "purchaseTotal", p."paidAmount" AS "purchasePaidAmount",
          p.date AS "purchaseDate"
        FROM "orden_pago_items" opi
        LEFT JOIN "purchases" p ON p.id = opi."purchaseId"
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
    const companyId = data.companyId ?? '00000000-0000-0000-0000-000000000001';
    const currency = data.currency ?? 'ARS';
    const exchangeRate = data.exchangeRate ?? 1;
    const date = data.date ?? new Date();

    // 1. Insert orden_pago
    await prisma.$executeRaw`
      INSERT INTO "orden_pagos" (
        "id", "number", "supplierId", "userId", "cashRegisterId", "companyId",
        "date", "amount", "currency", "exchangeRate", "paymentMethod",
        "reference", "bank", "checkDueDate", "notes", "status"
      ) VALUES (
        ${opId}, ${number}, ${data.supplierId}, ${data.userId},
        ${data.cashRegisterId ?? null}, ${companyId}, ${date},
        ${data.items.reduce((s, i) => s + i.amount, 0)},
        ${currency}, ${exchangeRate}, ${data.paymentMethod},
        ${data.reference ?? null}, ${data.bank ?? null},
        ${data.checkDueDate ?? null}, ${data.notes ?? null},
        'EMITTED'
      )
    `;

    // 2. Insert items + update purchase paidAmount
    for (const item of data.items) {
      const itemId = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
      await prisma.$executeRaw`
        INSERT INTO "orden_pago_items" ("id", "ordenPagoId", "purchaseId", "amount")
        VALUES (${itemId[0].id}, ${opId}, ${item.purchaseId}, ${item.amount})
      `;

      // Update purchase paidAmount and recalculate paymentStatus
      await prisma.$executeRaw`
        UPDATE "purchases"
        SET "paidAmount" = LEAST("paidAmount" + ${item.amount}, total),
            "paymentStatus" = CASE
              WHEN ("paidAmount" + ${item.amount}) >= total THEN 'PAID'
              WHEN ("paidAmount" + ${item.amount}) > 0      THEN 'PARTIALLY_PAID'
              ELSE 'PENDING'
            END,
            "updatedAt" = NOW()
        WHERE id = ${item.purchaseId}
      `;
    }

    // 3. Create supplier account movement (CREDIT — we paid)
    const totalAmount = data.items.reduce((s, i) => s + i.amount, 0);
    await this.createSupplierMovement({
      supplierId: data.supplierId,
      ordenPagoId: opId,
      type: 'CREDIT',
      amount: totalAmount,
      currency,
      description: `Orden de Pago ${number}`,
      companyId,
    });

    // Note: cash register outflow is reflected in CashRegisterClose totals via OrdenPago records

    return this.findById(opId) as Promise<OrdenPagoWithRelations>;
  }

  async cancel(id: string): Promise<OrdenPago> {
    const op = await this.findById(id);
    if (!op) throw new Error('OrdenPago not found');

    // 1. Revert purchase paidAmount for each item
    for (const item of op.items) {
      const amount = Number(item.amount);
      await prisma.$executeRaw`
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

    // 2. Cancel supplier account movement
    await this.cancelSupplierMovement(id);


    // 4. Mark as CANCELLED
    await prisma.$executeRaw`
      UPDATE "orden_pagos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${id}
    `;

    const rows = await prisma.$queryRaw<RawOrdenPago[]>`
      SELECT * FROM "orden_pagos" WHERE id = ${id}
    `;
    return rows[0] as any as OrdenPago;
  }

  // ── Supplier current account ──────────────────────────────────────────────

  async getSupplierBalance(supplierId: string, companyId?: string): Promise<number> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"supplierId" = ${supplierId}`];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    const where = Prisma.join(conditions, ' AND ');

    const rows = await prisma.$queryRaw<{ balance: any }[]>`
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
    companyId?: string
  ): Promise<PaginatedResult<SupplierAccountMovement>> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [Prisma.sql`"supplierId" = ${supplierId}`];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    const where = Prisma.join(conditions, ' AND ');

    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "supplier_account_movements" WHERE ${where}
      `,
      prisma.$queryRaw<RawMovement[]>`
        SELECT * FROM "supplier_account_movements"
        WHERE ${where}
        ORDER BY "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows as any as SupplierAccountMovement[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createSupplierMovement(data: CreateSupplierMovementInput): Promise<SupplierAccountMovement> {
    const companyId = data.companyId ?? '00000000-0000-0000-0000-000000000001';
    const currency = data.currency ?? 'ARS';

    // Compute running balance
    const currentBalance = await this.getSupplierBalance(data.supplierId, companyId);
    const newBalance = data.type === 'DEBIT'
      ? currentBalance + data.amount
      : currentBalance - data.amount;

    const movId = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;

    await prisma.$executeRaw`
      INSERT INTO "supplier_account_movements" (
        "id", "supplierId", "ordenPagoId", "purchaseId",
        "type", "amount", "currency", "balance", "description", "companyId"
      ) VALUES (
        ${movId[0].id}, ${data.supplierId},
        ${data.ordenPagoId ?? null}, ${data.purchaseId ?? null},
        ${data.type}, ${data.amount}, ${currency},
        ${newBalance}, ${data.description ?? null}, ${companyId}
      )
    `;

    const rows = await prisma.$queryRaw<RawMovement[]>`
      SELECT * FROM "supplier_account_movements" WHERE id = ${movId[0].id}
    `;
    return rows[0] as any as SupplierAccountMovement;
  }

  async cancelSupplierMovement(ordenPagoId: string): Promise<void> {
    // Get the original movement to get its amount and supplierId
    const rows = await prisma.$queryRaw<RawMovement[]>`
      SELECT * FROM "supplier_account_movements" WHERE "ordenPagoId" = ${ordenPagoId}
    `;
    if (!rows[0]) return;

    const original = rows[0];
    // Insert a reversal movement (opposite type, no ordenPagoId link)
    await this.createSupplierMovement({
      supplierId: original.supplierId,
      type: original.type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      amount: Number(original.amount),
      currency: original.currency,
      description: `Reversión: ${original.description ?? ''}`.trim(),
      companyId: original.companyId,
    });

    // Delete the original movement
    await prisma.$executeRaw`
      DELETE FROM "supplier_account_movements" WHERE "ordenPagoId" = ${ordenPagoId}
    `;
  }
}
