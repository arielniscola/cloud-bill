import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import {
  ISupplierRepository, SupplierFilters, SupplierSummary,
} from '../../../domain/repositories/ISupplierRepository';
import {
  Supplier, CreateSupplierInput, UpdateSupplierInput,
  SupplierRetention, CreateSupplierRetentionInput, UpdateSupplierRetentionInput, RetentionBase,
} from '../../../domain/entities/Supplier';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

type RawRetention = { id: string; retentionType: string | null; retentionPercentage: any };

type RawSupplierRetention = {
  id: string; supplierId: string; companyId: string;
  type: string; jurisdiction: string | null; base: string;
  percentage: any; arcaImpuesto: string | null; arcaRegimen: string | null;
  isActive: boolean; notes: string | null;
  createdAt: Date; updatedAt: Date;
};

function mapRetention(r: RawSupplierRetention): SupplierRetention {
  return {
    ...r,
    base: r.base as RetentionBase,
    percentage: Number(r.percentage),
  };
}

@injectable()
export class PrismaSupplierRepository implements ISupplierRepository {
  // retentionType/retentionPercentage no están en el cliente Prisma generado —
  // se leen/escriben vía raw SQL (mismo patrón que saleCondition en Customer).
  private async getRetention(id: string): Promise<{ retentionType: string | null; retentionPercentage: number | null }> {
    const rows = await prisma.$queryRaw<RawRetention[]>(
      Prisma.sql`SELECT id, "retentionType", "retentionPercentage" FROM suppliers WHERE id = ${id}`
    );
    return {
      retentionType: rows[0]?.retentionType ?? null,
      retentionPercentage: rows[0]?.retentionPercentage != null ? Number(rows[0].retentionPercentage) : null,
    };
  }

  /**
   * Ids de proveedores filtrados/ordenados por plata, resueltos en SQL.
   * Hace falta cuando el listado ordena por saldo / comprado / última compra o
   * filtra por deuda: hacerlo en memoria solo ordenaría la página visible.
   *
   * El pendiente por comprobante se calcula igual que en `getSummaries` y
   * `getOpenAccountItems` (pagos de OP imputados + ajustes de cuenta corriente);
   * si cambia una, cambian las tres.
   */
  private async findIdsByFinance(
    filters: SupplierFilters, skip: number, take: number
  ): Promise<{ ids: string[]; total: number }> {
    const { companyId, fiscalMode, search, isActive, hasBalance, hasOverdue } = filters;
    const sortBy = filters.sortBy ?? 'name';
    const dir = filters.sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const supplierWhere: Prisma.Sql[] = [];
    if (companyId) supplierWhere.push(Prisma.sql`s."companyId" = ${companyId}`);
    if (isActive !== undefined) supplierWhere.push(Prisma.sql`s."isActive" = ${isActive}`);
    if (search) {
      const like = `%${search}%`;
      supplierWhere.push(Prisma.sql`(s.name ILIKE ${like} OR s.cuit ILIKE ${like})`);
    }
    if (hasBalance) supplierWhere.push(Prisma.sql`COALESCE(bal.balance, 0) > 0.01`);
    if (hasOverdue) supplierWhere.push(Prisma.sql`COALESCE(agg.overdue, 0) > 0.01`);
    const where = supplierWhere.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(supplierWhere, ' AND ')}`
      : Prisma.empty;

    const companyPi = companyId ? Prisma.sql`AND pi."companyId" = ${companyId}` : Prisma.empty;
    const fiscalPi = fiscalMode ? Prisma.sql`AND pi."fiscalMode" = ${fiscalMode}` : Prisma.empty;
    const companySam = companyId ? Prisma.sql`AND sam."companyId" = ${companyId}` : Prisma.empty;
    const fiscalSam = fiscalMode ? Prisma.sql`AND sam."fiscalMode" = ${fiscalMode}` : Prisma.empty;

    const orderExpr =
      sortBy === 'balance'      ? Prisma.sql`COALESCE(bal.balance, 0)`
      : sortBy === 'purchased12m' ? Prisma.sql`COALESCE(bought.total, 0)`
      : sortBy === 'lastPurchase' ? Prisma.sql`lastp."lastDate"`
      : Prisma.sql`LOWER(s.name)`;

    const base = Prisma.sql`
      WITH open_inv AS (
        SELECT pi."supplierId", pi."dueDate",
          (
            pi.amount
            - COALESCE((
                SELECT SUM(CASE WHEN op.currency = pi.currency THEN opi.amount ELSE opi.amount / NULLIF(op."exchangeRate", 0) END)
                FROM "orden_pago_items" opi
                JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
                WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
              ), 0)
            - COALESCE((
                SELECT SUM(amount) FROM "supplier_cc_adjustment_items"
                WHERE side = 'DEBIT' AND "purchaseInvoiceId" = pi.id
              ), 0)
          ) * (CASE WHEN pi.currency = 'ARS' THEN 1 ELSE COALESCE(NULLIF(pi."exchangeRate", 0), 1) END) AS pending
        FROM "purchase_invoices" pi
        WHERE pi."supplierId" IS NOT NULL ${companyPi} ${fiscalPi}
          AND pi.status IN ('PENDING', 'PARTIALLY_PAID')
          AND pi.type NOT LIKE 'NOTA_CREDITO%'
      ),
      agg AS (
        SELECT "supplierId",
          SUM(CASE WHEN "dueDate" IS NOT NULL AND "dueDate" < NOW() THEN pending ELSE 0 END) AS overdue
        FROM open_inv WHERE pending > 0.01 GROUP BY "supplierId"
      ),
      bal AS (
        SELECT sam."supplierId",
          SUM(CASE WHEN sam.type = 'DEBIT' THEN sam.amount ELSE -sam.amount END) AS balance
        FROM "supplier_account_movements" sam
        WHERE sam.currency = 'ARS' ${companySam} ${fiscalSam}
        GROUP BY sam."supplierId"
      ),
      bought AS (
        -- El x1 explícito para ARS no es decorativo: hay comprobantes en pesos
        -- que guardan la cotización del día en la columna exchangeRate (se usa al imputar
        -- contra facturas en dólares), y multiplicar por ella multiplicaría por
        -- ~1500 lo comprado en pesos.
        SELECT pi."supplierId",
          SUM((CASE WHEN pi.type LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END)
              * pi.amount
              * (CASE WHEN pi.currency = 'ARS' THEN 1 ELSE COALESCE(NULLIF(pi."exchangeRate", 0), 1) END)) AS total
        FROM "purchase_invoices" pi
        WHERE pi."supplierId" IS NOT NULL ${companyPi} ${fiscalPi}
          AND pi.date >= NOW() - INTERVAL '12 months'
        GROUP BY pi."supplierId"
      ),
      lastp AS (
        SELECT pi."supplierId", MAX(pi.date) AS "lastDate"
        FROM "purchase_invoices" pi
        WHERE pi."supplierId" IS NOT NULL ${companyPi} ${fiscalPi}
          AND pi.type NOT LIKE 'NOTA_CREDITO%'
        GROUP BY pi."supplierId"
      )
      SELECT s.id
      FROM "suppliers" s
      LEFT JOIN agg    ON agg."supplierId"    = s.id
      LEFT JOIN bal    ON bal."supplierId"    = s.id
      LEFT JOIN bought ON bought."supplierId" = s.id
      LEFT JOIN lastp  ON lastp."supplierId"  = s.id
      ${where}
    `;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>`
        ${base}
        ORDER BY ${orderExpr} ${dir} NULLS LAST, LOWER(s.name) ASC
        LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM (${base}) q`,
    ]);

    return { ids: rows.map((r) => r.id), total: Number(countRows[0]?.count ?? 0) };
  }

  /**
   * Agregados de cuenta corriente y compras para un lote de proveedores.
   * Cuatro consultas para todo el lote (antes el front pedía la cuenta de cada
   * proveedor por separado: N+1 pedidos por página).
   *
   * Los importes salen en ARS convirtiendo con la cotización guardada en cada
   * comprobante — la misma que usa la imputación de órdenes de pago.
   */
  async getSummaries(
    ids: string[], companyId?: string, fiscalMode?: string
  ): Promise<Record<string, SupplierSummary>> {
    const empty = (supplierId: string): SupplierSummary => ({
      supplierId,
      balance: {},
      pendingAmount: 0, pendingCount: 0,
      overdueAmount: 0, overdueCount: 0,
      nextDueDate: null, lastPurchaseDate: null,
      purchased12m: 0,
      aging: { notDue: 0, d1_30: 0, d31_60: 0, d60plus: 0 },
    });

    const result: Record<string, SupplierSummary> = {};
    for (const id of ids) result[id] = empty(id);
    if (ids.length === 0) return result;

    const idList = Prisma.join(ids);
    const samScope = Prisma.join(
      [
        Prisma.sql`"supplierId" IN (${idList})`,
        ...(companyId ? [Prisma.sql`"companyId" = ${companyId}`] : []),
        ...(fiscalMode ? [Prisma.sql`"fiscalMode" = ${fiscalMode}`] : []),
      ],
      ' AND '
    );
    const piScope = Prisma.join(
      [
        Prisma.sql`pi."supplierId" IN (${idList})`,
        ...(companyId ? [Prisma.sql`pi."companyId" = ${companyId}`] : []),
        ...(fiscalMode ? [Prisma.sql`pi."fiscalMode" = ${fiscalMode}`] : []),
      ],
      ' AND '
    );

    const [balanceRows, openRows, boughtRows, lastRows] = await Promise.all([
      prisma.$queryRaw<{ supplierId: string; currency: string; balance: any }[]>`
        SELECT "supplierId", currency,
          COALESCE(
            SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END) -
            SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END),
            0
          ) AS balance
        FROM "supplier_account_movements"
        WHERE ${samScope}
        GROUP BY "supplierId", currency
      `,
      // Facturas/ND abiertas con su saldo pendiente (misma lógica que
      // getOpenAccountItems: pagos de OP imputados + ajustes de cuenta corriente).
      prisma.$queryRaw<{
        supplierId: string; dueDate: Date | null; currency: string; exchangeRate: any;
        amount: any; appliedTotal: any;
      }[]>`
        SELECT pi."supplierId", pi."dueDate", pi.currency, pi."exchangeRate", pi.amount,
          COALESCE((
            SELECT SUM(CASE WHEN op.currency = pi.currency THEN opi.amount ELSE opi.amount / NULLIF(op."exchangeRate", 0) END)
            FROM "orden_pago_items" opi
            JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
            WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
          ), 0)
          +
          COALESCE((
            SELECT SUM(amount) FROM "supplier_cc_adjustment_items"
            WHERE side = 'DEBIT' AND "purchaseInvoiceId" = pi.id
          ), 0) AS "appliedTotal"
        FROM "purchase_invoices" pi
        WHERE ${piScope}
          AND pi.status IN ('PENDING', 'PARTIALLY_PAID')
          AND pi.type NOT LIKE 'NOTA_CREDITO%'
      `,
      prisma.$queryRaw<{ supplierId: string; total: any }[]>`
        SELECT pi."supplierId",
          COALESCE(SUM(
            (CASE WHEN pi.type LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END)
            * pi.amount
            -- x1 explícito en pesos: ver el CTE bought de findIdsByFinance.
            * (CASE WHEN pi.currency = 'ARS' THEN 1 ELSE COALESCE(NULLIF(pi."exchangeRate", 0), 1) END)
          ), 0) AS total
        FROM "purchase_invoices" pi
        WHERE ${piScope}
          AND pi.date >= NOW() - INTERVAL '12 months'
        GROUP BY pi."supplierId"
      `,
      prisma.$queryRaw<{ supplierId: string; lastDate: Date | null }[]>`
        SELECT pi."supplierId", MAX(pi.date) AS "lastDate"
        FROM "purchase_invoices" pi
        WHERE ${piScope}
          AND pi.type NOT LIKE 'NOTA_CREDITO%'
        GROUP BY pi."supplierId"
      `,
    ]);

    for (const r of balanceRows) {
      const s = result[r.supplierId];
      if (s) s.balance[r.currency] = Number(r.balance ?? 0);
    }

    const today = new Date();
    for (const r of openRows) {
      const s = result[r.supplierId];
      if (!s) continue;
      const rate = r.currency === 'ARS' ? 1 : Number(r.exchangeRate ?? 1) || 1;
      const pending = (Number(r.amount ?? 0) - Number(r.appliedTotal ?? 0)) * rate;
      if (pending <= 0.01) continue;

      s.pendingAmount += pending;
      s.pendingCount += 1;

      const due = r.dueDate ? new Date(r.dueDate) : null;
      const daysLate = due ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : 0;

      if (!due || daysLate <= 0) {
        s.aging.notDue += pending;
        if (due && (!s.nextDueDate || due < new Date(s.nextDueDate))) {
          s.nextDueDate = due.toISOString();
        }
      } else {
        s.overdueAmount += pending;
        s.overdueCount += 1;
        if (daysLate <= 30) s.aging.d1_30 += pending;
        else if (daysLate <= 60) s.aging.d31_60 += pending;
        else s.aging.d60plus += pending;
      }
    }

    for (const r of boughtRows) {
      const s = result[r.supplierId];
      if (s) s.purchased12m = Number(r.total ?? 0);
    }
    for (const r of lastRows) {
      const s = result[r.supplierId];
      if (s && r.lastDate) s.lastPurchaseDate = new Date(r.lastDate).toISOString();
    }

    // Redondeo a 2 decimales: los importes vienen de sumas con cotización.
    for (const s of Object.values(result)) {
      const r2 = (n: number) => Math.round(n * 100) / 100;
      s.pendingAmount = r2(s.pendingAmount);
      s.overdueAmount = r2(s.overdueAmount);
      s.purchased12m = r2(s.purchased12m);
      s.aging = {
        notDue: r2(s.aging.notDue), d1_30: r2(s.aging.d1_30),
        d31_60: r2(s.aging.d31_60), d60plus: r2(s.aging.d60plus),
      };
    }

    return result;
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: SupplierFilters = {}
  ): Promise<PaginatedResult<Supplier>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { cuit: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.companyId) {
      (where as any).companyId = filters.companyId;
    }

    // Ordenar por saldo / comprado / última compra o filtrar por deuda exige
    // resolver los agregados en SQL: en memoria solo se ordenaría la página.
    const financeSort = filters.sortBy !== undefined && filters.sortBy !== 'name';
    const needsFinance = Boolean(filters.hasBalance || filters.hasOverdue || financeSort);

    let data: Awaited<ReturnType<typeof prisma.supplier.findMany>>;
    let total: number;

    if (needsFinance) {
      const ordered = await this.findIdsByFinance(filters, skip, limit);
      total = ordered.total;
      const rows = ordered.ids.length > 0
        ? await prisma.supplier.findMany({ where: { id: { in: ordered.ids } } })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      data = ordered.ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
    } else {
      const orderDir = filters.sortDir === 'desc' ? 'desc' : 'asc';
      [data, total] = await Promise.all([
        prisma.supplier.findMany({ where, skip, take: limit, orderBy: { name: orderDir } }),
        prisma.supplier.count({ where }),
      ]);
    }

    const retMap = new Map<string, { retentionType: string | null; retentionPercentage: number | null }>();
    if (data.length > 0) {
      const rows = await prisma.$queryRaw<RawRetention[]>(
        Prisma.sql`SELECT id, "retentionType", "retentionPercentage" FROM suppliers WHERE id IN (${Prisma.join(data.map((s) => s.id))})`
      );
      for (const r of rows) {
        retMap.set(r.id, {
          retentionType: r.retentionType ?? null,
          retentionPercentage: r.retentionPercentage != null ? Number(r.retentionPercentage) : null,
        });
      }
    }

    return {
      data: data.map((s) => ({ ...s, ...(retMap.get(s.id) ?? { retentionType: null, retentionPercentage: null }) })) as Supplier[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, companyId?: string): Promise<Supplier | null> {
    const supplier = await prisma.supplier.findFirst({ where: { id, ...(companyId ? ({ companyId } as any) : {}) } });
    if (!supplier) return null;
    const retention = await this.getRetention(id);
    return { ...supplier, ...retention } as Supplier;
  }

  async findByCuit(cuit: string, companyId?: string): Promise<Supplier | null> {
    const supplier = await prisma.supplier.findFirst({
      where: { cuit, ...(companyId ? ({ companyId } as any) : {}) },
    });
    if (!supplier) return null;
    const retention = await this.getRetention(supplier.id);
    return { ...supplier, ...retention } as Supplier;
  }

  async create(data: CreateSupplierInput): Promise<Supplier> {
    const { retentionType = null, retentionPercentage = null, ...rest } = data as any;
    const created = await prisma.supplier.create({
      data: {
        ...rest,
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
      } as any,
    });
    await prisma.$executeRaw(
      Prisma.sql`UPDATE suppliers SET "retentionType" = ${retentionType}, "retentionPercentage" = ${retentionPercentage} WHERE id = ${created.id}`
    );
    return { ...created, retentionType, retentionPercentage } as Supplier;
  }

  async update(id: string, data: UpdateSupplierInput): Promise<Supplier> {
    const { retentionType, retentionPercentage, ...rest } = data as any;
    const updated = await prisma.supplier.update({ where: { id }, data: rest });
    if (retentionType !== undefined || retentionPercentage !== undefined) {
      const current = await this.getRetention(id);
      const nextType = retentionType !== undefined ? retentionType : current.retentionType;
      const nextPct  = retentionPercentage !== undefined ? retentionPercentage : current.retentionPercentage;
      await prisma.$executeRaw(
        Prisma.sql`UPDATE suppliers SET "retentionType" = ${nextType}, "retentionPercentage" = ${nextPct} WHERE id = ${id}`
      );
      return { ...updated, retentionType: nextType, retentionPercentage: nextPct } as Supplier;
    }
    const current = await this.getRetention(id);
    return { ...updated, ...current } as Supplier;
  }

  async delete(id: string): Promise<void> {
    await prisma.supplier.delete({ where: { id } });
  }

  // ── Retenciones configuradas por proveedor ──────────────────────────────
  // Tabla nueva: se accede vía raw SQL para no depender de que el cliente
  // Prisma esté regenerado (mismo patrón que orden_pago_ajustes).

  async findRetentions(supplierId: string, companyId?: string, onlyActive = false): Promise<SupplierRetention[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"supplierId" = ${supplierId}`];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    if (onlyActive) conditions.push(Prisma.sql`"isActive" = true`);
    const rows = await prisma.$queryRaw<RawSupplierRetention[]>`
      SELECT * FROM "supplier_retentions"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY "createdAt" ASC
    `;
    return rows.map(mapRetention);
  }

  async findRetentionById(id: string, companyId?: string): Promise<SupplierRetention | null> {
    const companyFilter = companyId ? Prisma.sql`AND "companyId" = ${companyId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<RawSupplierRetention[]>`
      SELECT * FROM "supplier_retentions" WHERE id = ${id} ${companyFilter}
    `;
    return rows[0] ? mapRetention(rows[0]) : null;
  }

  async createRetention(data: CreateSupplierRetentionInput): Promise<SupplierRetention> {
    const [{ id }] = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
    await prisma.$executeRaw`
      INSERT INTO "supplier_retentions"
        ("id", "supplierId", "companyId", "type", "jurisdiction", "base", "percentage",
         "arcaImpuesto", "arcaRegimen", "isActive", "notes", "createdAt", "updatedAt")
      VALUES
        (${id}, ${data.supplierId}, ${data.companyId}, ${data.type}, ${data.jurisdiction ?? null},
         ${data.base}, ${data.percentage}, ${data.arcaImpuesto || null}, ${data.arcaRegimen || null},
         ${data.isActive ?? true}, ${data.notes ?? null}, NOW(), NOW())
    `;
    return (await this.findRetentionById(id))!;
  }

  async updateRetention(id: string, data: UpdateSupplierRetentionInput): Promise<SupplierRetention> {
    const sets: Prisma.Sql[] = [];
    if (data.type         !== undefined) sets.push(Prisma.sql`"type" = ${data.type}`);
    if (data.jurisdiction !== undefined) sets.push(Prisma.sql`"jurisdiction" = ${data.jurisdiction}`);
    if (data.base         !== undefined) sets.push(Prisma.sql`"base" = ${data.base}`);
    if (data.percentage   !== undefined) sets.push(Prisma.sql`"percentage" = ${data.percentage}`);
    if (data.arcaImpuesto !== undefined) sets.push(Prisma.sql`"arcaImpuesto" = ${data.arcaImpuesto || null}`);
    if (data.arcaRegimen  !== undefined) sets.push(Prisma.sql`"arcaRegimen" = ${data.arcaRegimen || null}`);
    if (data.isActive     !== undefined) sets.push(Prisma.sql`"isActive" = ${data.isActive}`);
    if (data.notes        !== undefined) sets.push(Prisma.sql`"notes" = ${data.notes}`);
    sets.push(Prisma.sql`"updatedAt" = NOW()`);

    await prisma.$executeRaw`
      UPDATE "supplier_retentions" SET ${Prisma.join(sets, ', ')} WHERE id = ${id}
    `;
    return (await this.findRetentionById(id))!;
  }

  async deleteRetention(id: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "supplier_retentions" WHERE id = ${id}`;
  }
}
