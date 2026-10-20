import { injectable } from 'tsyringe';

import { startOfDay, endOfDay } from '../../../shared/utils/dateRange';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import {
  CashRegister,
  CashRegisterClose,
  CashRegisterClosePreview,
  CashRegisterMovement,
  CreateCashRegisterInput,
  UpdateCashRegisterInput,
  CreateCashRegisterCloseInput,
  CashMovement,
  CreateCashMovementInput,
} from '../../../domain/entities/CashRegister';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import { AppError } from '../../../shared/errors/AppError';
import { allocateDocumentNumber } from '../DocumentSequence';
import prisma from '../prisma';

export const CASH_CONCEPT_LABELS: Record<string, string> = {
  RETIRO: 'Retiro de efectivo',
  DEPOSITO_BANCARIO: 'Depósito bancario',
  GASTO: 'Gasto',
  APORTE: 'Aporte',
  FONDO_CAMBIO: 'Fondo de cambio',
  EXTRACCION_BANCARIA: 'Extracción bancaria',
  OTRO: 'Otro',
};

@injectable()
export class PrismaCashRegisterRepository implements ICashRegisterRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string, companyId?: string): Promise<CashRegister | null> {
    return this.prisma.cashRegister.findFirst({ where: { id, ...(companyId ? ({ companyId } as any) : {}) } });
  }

  async findAll(onlyActive = false, companyId?: string): Promise<CashRegister[]> {
    const where: any = {};
    if (onlyActive) where.isActive = true;
    if (companyId) where.companyId = companyId;
    return this.prisma.cashRegister.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateCashRegisterInput): Promise<CashRegister> {
    return this.prisma.cashRegister.create({
      data: {
        ...data,
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
      } as any,
    });
  }

  async update(id: string, data: UpdateCashRegisterInput): Promise<CashRegister> {
    return this.prisma.cashRegister.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.cashRegister.delete({ where: { id } });
  }

  async getMovements(
    cashRegisterId: string,
    filters: { type?: string; startDate?: string; endDate?: string; fiscalMode?: string },
    pagination: PaginationParams = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<CashRegisterMovement>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.AccountMovementWhereInput = { cashRegisterId };
    if (filters.type) where.type = filters.type as any;
    if (filters.fiscalMode) (where as any).fiscalMode = filters.fiscalMode;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        (where.createdAt as Prisma.DateTimeFilter).gte = startOfDay(String(filters.startDate));
      }
      if (filters.endDate) {
        (where.createdAt as Prisma.DateTimeFilter).lte = endOfDay(String(filters.endDate));
      }
    }

    const accountMovements = await this.prisma.accountMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        currentAccount: {
          include: { customer: { select: { id: true, name: true } } },
        },
        invoice: { select: { id: true, type: true, number: true } },
      },
    });

    // Also include OrdenPago outflows (unless filtering only CREDIT)
    let opMovements: CashRegisterMovement[] = [];
    if (!filters.type || filters.type === 'DEBIT') {
      const opConditions: Prisma.Sql[] = [
        Prisma.sql`op."cashRegisterId" = ${cashRegisterId}`,
        Prisma.sql`op.status != 'CANCELLED'`,
      ];
      if (filters.fiscalMode) {
        opConditions.push(Prisma.sql`op."fiscalMode" = ${filters.fiscalMode}`);
      }
      const opFrom = filters.startDate ? startOfDay(String(filters.startDate)) : undefined;
      const opTo   = filters.endDate ? endOfDay(String(filters.endDate)) : undefined;
      if (opFrom) opConditions.push(Prisma.sql`op."createdAt" >= ${opFrom}`);
      if (opTo)   opConditions.push(Prisma.sql`op."createdAt" <= ${opTo}`);
      const opWhere = Prisma.join(opConditions, ' AND ');
      // El egreso de caja es el NETO: `amount` es el bruto imputado a las
      // facturas y `retentionAmount` no sale de la caja (queda a depositar).
      const opRows = await prisma.$queryRaw<any[]>`
        SELECT op.id, (op.amount - op."retentionAmount") AS amount,
               op."cashRegisterId", op."createdAt", op.number,
               s.name AS "supplierName"
        FROM "orden_pagos" op
        LEFT JOIN "suppliers" s ON s.id = op."supplierId"
        WHERE ${opWhere}
      `;
      opMovements = opRows.map((op) => ({
        id: op.id,
        currentAccountId: null,
        type: 'DEBIT' as const,
        amount: op.amount,
        balance: 0 as any,
        description: `Orden de Pago ${op.number}${op.supplierName ? ' — ' + op.supplierName : ''}`,
        invoiceId: null,
        cashRegisterId: op.cashRegisterId,
        createdAt: op.createdAt,
        currentAccount: undefined,
        invoice: undefined,
      }));
    }

    // Recibos contado en caja física (cobros = ingreso, devoluciones NC = egreso)
    const reciboMovements = await this._getReciboCashMovements(cashRegisterId, filters);

    // Retiros / ingresos manuales
    const manualMovements = await this._getManualCashMovements(cashRegisterId, filters);

    // Merge and sort by createdAt desc, then paginate
    const all = [
      ...(accountMovements as unknown as CashRegisterMovement[]),
      ...opMovements,
      ...reciboMovements,
      ...manualMovements,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = all.length;
    const data = all.slice(skip, skip + limit);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async _getOrdenPagoOutflows(
    cashRegisterId: string,
    fromDate: Date | null,
    fiscalMode?: string
  ): Promise<{ total: number; count: number }> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"cashRegisterId" = ${cashRegisterId}`,
      Prisma.sql`status != 'CANCELLED'`,
    ];
    if (fromDate) conditions.push(Prisma.sql`"createdAt" > ${fromDate}`);
    if (fiscalMode) conditions.push(Prisma.sql`"fiscalMode" = ${fiscalMode}`);
    const where = Prisma.join(conditions, ' AND ');
    // Neto: lo retenido no sale de la caja (ver _getOrdenPagoOutflows en el listado).
    const rows = await prisma.$queryRaw<{ total: any; count: bigint }[]>`
      SELECT COALESCE(SUM(amount - "retentionAmount"), 0) AS total, COUNT(*) AS count
      FROM "orden_pagos"
      WHERE ${where}
    `;
    return { total: Number(rows[0]?.total ?? 0), count: Number(rows[0]?.count ?? 0) };
  }

  /**
   * Recibos que impactan la caja física (efectivo / tarjeta) y que NO están ya
   * representados por un AccountMovement (los de cuenta corriente se cuentan vía
   * account_movements). Cobros = INGRESO; devoluciones de NC = EGRESO.
   */
  private _reciboCashWhere(
    cashRegisterId: string,
    opts: { fiscalMode?: string; startDate?: string; endDate?: string; fromDate?: Date | null }
  ): Prisma.ReciboWhereInput {
    const where: Prisma.ReciboWhereInput = {
      cashRegisterId,
      status: 'EMITTED',
      paymentMethod: { notIn: ['CHECK', 'BANK_TRANSFER', 'MERCADO_PAGO'] },
      accountMovement: { is: null },
    };
    if (opts.fiscalMode) (where as any).fiscalMode = opts.fiscalMode;
    if (opts.startDate || opts.endDate || opts.fromDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (opts.fromDate) createdAt.gt = opts.fromDate;
      if (opts.startDate) createdAt.gte = startOfDay(String(opts.startDate));
      if (opts.endDate) createdAt.lte = endOfDay(String(opts.endDate));
      where.createdAt = createdAt;
    }
    return where;
  }

  private async _getReciboCashMovements(
    cashRegisterId: string,
    filters: { type?: string; startDate?: string; endDate?: string; fiscalMode?: string }
  ): Promise<CashRegisterMovement[]> {
    const where = this._reciboCashWhere(cashRegisterId, filters);
    const recibos = await this.prisma.recibo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { invoice: { select: { id: true, type: true, number: true } } },
    });
    const mapped: CashRegisterMovement[] = recibos.map((r) => {
      const isNC = (r.invoice?.type ?? '').startsWith('NOTA_CREDITO');
      return {
        id: r.id,
        currentAccountId: null,
        type: (isNC ? 'DEBIT' : 'CREDIT') as 'DEBIT' | 'CREDIT',
        amount: r.amount,
        balance: new Decimal(0),
        description: `${isNC ? 'Devolución' : 'Cobro'} ${r.number}${r.invoice ? ` (${r.invoice.number})` : ''}`,
        invoiceId: r.invoiceId ?? null,
        cashRegisterId: r.cashRegisterId ?? null,
        createdAt: r.createdAt,
        currentAccount: undefined,
        invoice: r.invoice ?? undefined,
      };
    });
    if (filters.type === 'CREDIT') return mapped.filter((m) => m.type === 'CREDIT');
    if (filters.type === 'DEBIT') return mapped.filter((m) => m.type === 'DEBIT');
    return mapped;
  }

  private async _getReciboCashTotals(
    cashRegisterId: string,
    fromDate: Date | null,
    fiscalMode?: string
  ): Promise<{ totalIn: number; totalOut: number; count: number }> {
    const where = this._reciboCashWhere(cashRegisterId, { fiscalMode, fromDate });
    const recibos = await this.prisma.recibo.findMany({
      where,
      select: { amount: true, invoice: { select: { type: true } } },
    });
    let totalIn = 0;
    let totalOut = 0;
    for (const r of recibos) {
      const isNC = (r.invoice?.type ?? '').startsWith('NOTA_CREDITO');
      if (isNC) totalOut += r.amount.toNumber();
      else totalIn += r.amount.toNumber();
    }
    return { totalIn, totalOut, count: recibos.length };
  }

  /**
   * Movimientos manuales (cash_movements). En el listado van también los
   * anulados, marcados, para que quede el rastro; en los totales del cierre no.
   */
  private async _getManualCashMovements(
    cashRegisterId: string,
    filters: { type?: string; startDate?: string; endDate?: string; fiscalMode?: string }
  ): Promise<CashRegisterMovement[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`cm."cashRegisterId" = ${cashRegisterId}`];
    if (filters.type === 'CREDIT') conditions.push(Prisma.sql`cm.type = 'IN'`);
    if (filters.type === 'DEBIT') conditions.push(Prisma.sql`cm.type = 'OUT'`);
    if (filters.fiscalMode) conditions.push(Prisma.sql`cm."fiscalMode" = ${filters.fiscalMode}`);
    if (filters.startDate) conditions.push(Prisma.sql`cm."createdAt" >= ${startOfDay(String(filters.startDate))}`);
    if (filters.endDate) conditions.push(Prisma.sql`cm."createdAt" <= ${endOfDay(String(filters.endDate))}`);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT cm.id, cm.number, cm.type, cm.concept, cm.amount, cm."personName", cm.notes,
             cm.status, cm."cashRegisterId", cm."createdAt", ba.name AS "bankName"
      FROM "cash_movements" cm
      LEFT JOIN "bank_accounts" ba ON ba.id = cm."bankAccountId"
      WHERE ${Prisma.join(conditions, ' AND ')}
    `;
    return rows.map((r) => ({
      id: r.id,
      currentAccountId: null,
      type: (r.type === 'IN' ? 'CREDIT' : 'DEBIT') as 'DEBIT' | 'CREDIT',
      amount: r.amount,
      balance: new Decimal(0),
      description: [
        CASH_CONCEPT_LABELS[r.concept] ?? r.concept,
        r.bankName,
        r.personName,
        r.notes,
      ].filter(Boolean).join(' — '),
      invoiceId: null,
      cashRegisterId: r.cashRegisterId,
      createdAt: r.createdAt,
      currentAccount: undefined,
      invoice: undefined,
      cashMovement: { id: r.id, number: r.number, concept: r.concept, status: r.status },
    }));
  }

  private async _getManualCashTotals(
    cashRegisterId: string,
    fromDate: Date | null,
    fiscalMode?: string
  ): Promise<{ totalIn: number; totalOut: number; count: number }> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"cashRegisterId" = ${cashRegisterId}`,
      Prisma.sql`status = 'ACTIVE'`,
    ];
    if (fromDate) conditions.push(Prisma.sql`"createdAt" > ${fromDate}`);
    if (fiscalMode) conditions.push(Prisma.sql`"fiscalMode" = ${fiscalMode}`);
    const rows = await prisma.$queryRaw<{ totalIn: any; totalOut: any; count: bigint }[]>`
      SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'IN'), 0)  AS "totalIn",
             COALESCE(SUM(amount) FILTER (WHERE type = 'OUT'), 0) AS "totalOut",
             COUNT(*) AS count
      FROM "cash_movements"
      WHERE ${Prisma.join(conditions, ' AND ')}
    `;
    return {
      totalIn: Number(rows[0]?.totalIn ?? 0),
      totalOut: Number(rows[0]?.totalOut ?? 0),
      count: Number(rows[0]?.count ?? 0),
    };
  }

  async findCashMovement(id: string, cashRegisterId: string, companyId?: string): Promise<CashMovement | null> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT cm.*,
             json_build_object('id', cr.id, 'name', cr.name) AS "cashRegister",
             CASE WHEN ba.id IS NULL THEN NULL ELSE json_build_object('id', ba.id, 'name', ba.name, 'bank', ba.bank, 'accountNumber', ba."accountNumber") END AS "bankAccount",
             CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "user"
      FROM "cash_movements" cm
      JOIN "cash_registers" cr ON cr.id = cm."cashRegisterId"
      LEFT JOIN "bank_accounts" ba ON ba.id = cm."bankAccountId"
      LEFT JOIN "users" u ON u.id = cm."userId"
      WHERE cm.id = ${id} AND cm."cashRegisterId" = ${cashRegisterId}
        AND (${companyId ?? null}::text IS NULL OR cm."companyId" = ${companyId ?? null})
    `;
    return (rows[0] as CashMovement) ?? null;
  }

  /** Alta del movimiento + su contraparte bancaria (depósito / extracción), todo o nada. */
  async createCashMovement(data: CreateCashMovementInput): Promise<CashMovement> {
    const id = await this.prisma.$transaction(async (tx) => {
      if (data.bankAccountId) {
        const [bank] = await tx.$queryRaw<{ currency: string; isActive: boolean }[]>`
          SELECT currency, "isActive" FROM "bank_accounts"
          WHERE id = ${data.bankAccountId} AND "companyId" = ${data.companyId}
        `;
        if (!bank) throw new AppError('Cuenta bancaria no encontrada', 404);
        if (!bank.isActive) throw new AppError('La cuenta bancaria está inactiva', 400);
        if (bank.currency !== 'ARS') throw new AppError('La caja maneja pesos: elegí una cuenta bancaria en ARS', 400);
      }

      const number = await allocateDocumentNumber('CASH_MOVEMENT', data.companyId, { tx });
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "cash_movements" (
          id, "companyId", "cashRegisterId", number, type, concept, amount,
          "personName", notes, "bankAccountId", status, "userId", "fiscalMode", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text, ${data.companyId}, ${data.cashRegisterId}, ${number}, ${data.type},
          ${data.concept}, ${new Decimal(data.amount)}, ${data.personName ?? null}, ${data.notes ?? null},
          ${data.bankAccountId ?? null}, 'ACTIVE', ${data.userId ?? null}, ${data.fiscalMode}, NOW(), NOW()
        )
        RETURNING id
      `;

      if (data.bankAccountId) {
        // Depósito: sale de la caja y entra al banco. Extracción: al revés.
        await this._addBankMovement(tx, {
          bankAccountId: data.bankAccountId,
          type: data.type === 'OUT' ? 'CREDIT' : 'DEBIT',
          amount: data.amount,
          description: `${CASH_CONCEPT_LABELS[data.concept] ?? data.concept} (${number})`,
          companyId: data.companyId,
          fiscalMode: data.fiscalMode,
        });
      }
      return row.id;
    });

    return (await this.findCashMovement(id, data.cashRegisterId, data.companyId))!;
  }

  /**
   * Anula un movimiento manual. No se puede si ya entró en un cierre de caja
   * (el cierre guarda los totales y quedaría descuadrado). Revierte el banco.
   */
  async cancelCashMovement(movement: CashMovement): Promise<CashMovement> {
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string; createdAt: Date }[]>`
        SELECT status, "createdAt" FROM "cash_movements" WHERE id = ${movement.id} FOR UPDATE
      `;
      if (!locked || locked.status !== 'ACTIVE') throw new AppError('El movimiento ya está anulado', 400);

      const [lastClose] = await tx.$queryRaw<{ closedAt: Date }[]>`
        SELECT "closedAt" FROM "cash_register_closes"
        WHERE "cashRegisterId" = ${movement.cashRegisterId}
        ORDER BY "closedAt" DESC LIMIT 1
      `;
      if (lastClose && new Date(lastClose.closedAt) >= new Date(locked.createdAt)) {
        throw new AppError('El movimiento ya está incluido en un cierre de caja y no se puede anular', 400);
      }

      await tx.$executeRaw`
        UPDATE "cash_movements" SET status = 'CANCELLED', "cancelledAt" = NOW(), "updatedAt" = NOW()
        WHERE id = ${movement.id}
      `;

      if (movement.bankAccountId) {
        await this._addBankMovement(tx, {
          bankAccountId: movement.bankAccountId,
          type: movement.type === 'OUT' ? 'DEBIT' : 'CREDIT',
          amount: Number(movement.amount),
          description: `Anulación ${(CASH_CONCEPT_LABELS[movement.concept] ?? movement.concept).toLowerCase()} (${movement.number})`,
          companyId: movement.companyId,
          fiscalMode: movement.fiscalMode,
        });
      }
    });

    return (await this.findCashMovement(movement.id, movement.cashRegisterId, movement.companyId))!;
  }

  private async _addBankMovement(
    tx: Prisma.TransactionClient,
    m: { bankAccountId: string; type: 'CREDIT' | 'DEBIT'; amount: number; description: string; companyId: string; fiscalMode: string }
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "bank_movements" (
        id, "bankAccountId", type, amount, description, date, "companyId", "fiscalMode", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text, ${m.bankAccountId}, ${m.type}, ${new Decimal(m.amount)},
        ${m.description}, NOW(), ${m.companyId}, ${m.fiscalMode}, NOW(), NOW()
      )
    `;
    const delta = m.type === 'CREDIT' ? m.amount : -m.amount;
    await tx.$executeRaw`
      UPDATE "bank_accounts" SET balance = balance + ${new Decimal(delta)}, "updatedAt" = NOW()
      WHERE id = ${m.bankAccountId}
    `;
  }

  private async buildClosePeriodWhere(cashRegisterId: string, fiscalMode?: string): Promise<{
    where: Prisma.AccountMovementWhereInput;
    fromDate: Date | null;
  }> {
    const lastClose = await (this.prisma as any).cashRegisterClose.findFirst({
      where: { cashRegisterId },
      orderBy: { closedAt: 'desc' },
    });

    const fromDate: Date | null = lastClose?.closedAt ?? null;
    const where: Prisma.AccountMovementWhereInput = {
      cashRegisterId,
      ...(fromDate && { createdAt: { gt: fromDate } }),
      ...(fiscalMode ? ({ fiscalMode } as any) : {}),
    };

    return { where, fromDate };
  }

  async getClosePreview(cashRegisterId: string, fiscalMode?: string): Promise<CashRegisterClosePreview> {
    const { where, fromDate } = await this.buildClosePeriodWhere(cashRegisterId, fiscalMode);

    const [movements, opOutflows, reciboTotals, manualTotals] = await Promise.all([
      this.prisma.accountMovement.findMany({ where, select: { type: true, amount: true } }),
      this._getOrdenPagoOutflows(cashRegisterId, fromDate, fiscalMode),
      this._getReciboCashTotals(cashRegisterId, fromDate, fiscalMode),
      this._getManualCashTotals(cashRegisterId, fromDate, fiscalMode),
    ]);

    const totalIn = movements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + reciboTotals.totalIn + manualTotals.totalIn;

    const totalOut = movements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + opOutflows.total + reciboTotals.totalOut + manualTotals.totalOut;

    return {
      fromDate,
      movementsCount: movements.length + opOutflows.count + reciboTotals.count + manualTotals.count,
      totalIn,
      totalOut,
      netTotal: totalIn - totalOut,
    };
  }

  async createClose(
    cashRegisterId: string,
    data: CreateCashRegisterCloseInput,
    fiscalMode?: string
  ): Promise<CashRegisterClose> {
    const { where, fromDate } = await this.buildClosePeriodWhere(cashRegisterId, fiscalMode);

    const [movements, opOutflows, reciboTotals, manualTotals] = await Promise.all([
      this.prisma.accountMovement.findMany({ where, select: { type: true, amount: true } }),
      this._getOrdenPagoOutflows(cashRegisterId, fromDate, fiscalMode),
      this._getReciboCashTotals(cashRegisterId, fromDate, fiscalMode),
      this._getManualCashTotals(cashRegisterId, fromDate, fiscalMode),
    ]);

    const totalIn = movements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + reciboTotals.totalIn + manualTotals.totalIn;

    const totalOut = movements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + opOutflows.total + reciboTotals.totalOut + manualTotals.totalOut;

    const result = await (this.prisma as any).cashRegisterClose.create({
      data: {
        cashRegisterId,
        fromDate,
        totalIn: new Decimal(totalIn),
        totalOut: new Decimal(totalOut),
        netTotal: new Decimal(totalIn - totalOut),
        movementsCount: movements.length + opOutflows.count + reciboTotals.count + manualTotals.count,
        notes: data.notes,
        userId: data.userId,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return result as CashRegisterClose;
  }

  async getCloses(
    cashRegisterId: string,
    pagination: PaginationParams = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<CashRegisterClose>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      (this.prisma as any).cashRegisterClose.findMany({
        where: { cashRegisterId },
        skip,
        take: limit,
        orderBy: { closedAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
      (this.prisma as any).cashRegisterClose.count({ where: { cashRegisterId } }),
    ]);

    return {
      data: data as CashRegisterClose[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
