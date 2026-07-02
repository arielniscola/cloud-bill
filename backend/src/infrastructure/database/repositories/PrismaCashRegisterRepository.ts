import { injectable } from 'tsyringe';
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
} from '../../../domain/entities/CashRegister';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

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
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
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
      if (filters.startDate) {
        opConditions.push(Prisma.sql`op."createdAt" >= ${new Date(filters.startDate)}`);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        opConditions.push(Prisma.sql`op."createdAt" <= ${endDate}`);
      }
      const opWhere = Prisma.join(opConditions, ' AND ');
      const opRows = await prisma.$queryRaw<any[]>`
        SELECT op.id, op.amount, op."cashRegisterId", op."createdAt", op.number,
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

    // Merge and sort by createdAt desc, then paginate
    const all = [
      ...(accountMovements as unknown as CashRegisterMovement[]),
      ...opMovements,
      ...reciboMovements,
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
    const rows = await prisma.$queryRaw<{ total: any; count: bigint }[]>`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
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
      if (opts.startDate) createdAt.gte = new Date(opts.startDate);
      if (opts.endDate) {
        const end = new Date(opts.endDate);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
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

    const [movements, opOutflows, reciboTotals] = await Promise.all([
      this.prisma.accountMovement.findMany({ where, select: { type: true, amount: true } }),
      this._getOrdenPagoOutflows(cashRegisterId, fromDate, fiscalMode),
      this._getReciboCashTotals(cashRegisterId, fromDate, fiscalMode),
    ]);

    const totalIn = movements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + reciboTotals.totalIn;

    const totalOut = movements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + opOutflows.total + reciboTotals.totalOut;

    return {
      fromDate,
      movementsCount: movements.length + opOutflows.count + reciboTotals.count,
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

    const [movements, opOutflows, reciboTotals] = await Promise.all([
      this.prisma.accountMovement.findMany({ where, select: { type: true, amount: true } }),
      this._getOrdenPagoOutflows(cashRegisterId, fromDate, fiscalMode),
      this._getReciboCashTotals(cashRegisterId, fromDate, fiscalMode),
    ]);

    const totalIn = movements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + reciboTotals.totalIn;

    const totalOut = movements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0) + opOutflows.total + reciboTotals.totalOut;

    const result = await (this.prisma as any).cashRegisterClose.create({
      data: {
        cashRegisterId,
        fromDate,
        totalIn: new Decimal(totalIn),
        totalOut: new Decimal(totalOut),
        netTotal: new Decimal(totalIn - totalOut),
        movementsCount: movements.length + opOutflows.count + reciboTotals.count,
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
