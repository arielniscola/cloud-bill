import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  IRecurringInvoiceRepository,
  RecurringInvoiceFilters,
} from '../../../domain/repositories/IRecurringInvoiceRepository';
import {
  RecurringInvoice,
  RecurringInvoiceItem,
  CreateRecurringInvoiceInput,
} from '../../../domain/entities/RecurringInvoice';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

// Modelo nuevo: SQL crudo para no depender de un cliente Prisma regenerado
// (mismo patrón que PrismaCardRepository / PrismaRubroRepository).

function mapRow(r: any): RecurringInvoice {
  return {
    ...r,
    exchangeRate: Number(r.exchangeRate),
    dayOfMonth: r.dayOfMonth ?? null,
    generatedCount: Number(r.generatedCount),
    customer: r.customerName !== undefined
      ? { id: r.customerId, name: r.customerName, taxId: r.customerTaxId ?? null }
      : undefined,
  } as RecurringInvoice;
}

function mapItem(r: any): RecurringInvoiceItem {
  return {
    id: r.id,
    recurringInvoiceId: r.recurringInvoiceId,
    productId: r.productId,
    variantId: r.variantId ?? null,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unitPrice),
    discountPct: Number(r.discountPct),
    taxRate: Number(r.taxRate),
    product: r.productName !== undefined
      ? { id: r.productId, name: r.productName, sku: r.productSku, price: Number(r.productPrice ?? 0) }
      : undefined,
  };
}

@injectable()
export class PrismaRecurringInvoiceRepository implements IRecurringInvoiceRepository {
  private async fetchItems(recurringInvoiceId: string): Promise<RecurringInvoiceItem[]> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT i.*, p.name AS "productName", p.sku AS "productSku", p.price AS "productPrice"
      FROM "recurring_invoice_items" i
      JOIN "products" p ON p.id = i."productId"
      WHERE i."recurringInvoiceId" = ${recurringInvoiceId}
    `;
    return rows.map(mapItem);
  }

  async findById(id: string, companyId?: string): Promise<RecurringInvoice | null> {
    const conds = [Prisma.sql`r.id = ${id}`];
    if (companyId) conds.push(Prisma.sql`r."companyId" = ${companyId}`);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT r.*, c.name AS "customerName", c."taxId" AS "customerTaxId"
      FROM "recurring_invoices" r
      JOIN "customers" c ON c.id = r."customerId"
      WHERE ${Prisma.join(conds, ' AND ')}
      LIMIT 1
    `;
    if (!rows[0]) return null;
    const rec = mapRow(rows[0]);
    rec.items = await this.fetchItems(id);
    return rec;
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: RecurringInvoiceFilters = {}
  ): Promise<PaginatedResult<RecurringInvoice>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const conds = [Prisma.sql`1=1`];
    if (filters.companyId) conds.push(Prisma.sql`r."companyId" = ${filters.companyId}`);
    if (filters.customerId) conds.push(Prisma.sql`r."customerId" = ${filters.customerId}`);
    if (filters.isActive !== undefined) conds.push(Prisma.sql`r."isActive" = ${filters.isActive}`);
    const where = Prisma.join(conds, ' AND ');

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT r.*, c.name AS "customerName", c."taxId" AS "customerTaxId",
               (SELECT COUNT(*)::int FROM "recurring_invoice_items" i WHERE i."recurringInvoiceId" = r.id) AS "itemCount"
        FROM "recurring_invoices" r
        JOIN "customers" c ON c.id = r."customerId"
        WHERE ${where}
        ORDER BY r."isActive" DESC, r."nextRunAt" ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "recurring_invoices" r WHERE ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows.map((r) => ({ ...mapRow(r), itemCount: Number(r.itemCount) } as any)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findDue(): Promise<RecurringInvoice[]> {
    // NOW() del lado de la base: comparar timestamps con parámetros Date en
    // queries crudas resultó no confiable (serialización del driver).
    const rows = await prisma.$queryRaw<any[]>`
      SELECT r.*, c.name AS "customerName", c."taxId" AS "customerTaxId"
      FROM "recurring_invoices" r
      JOIN "customers" c ON c.id = r."customerId"
      WHERE r."isActive" = true AND r."nextRunAt" <= NOW()
      ORDER BY r."nextRunAt" ASC
    `;
    const result: RecurringInvoice[] = [];
    for (const row of rows) {
      const rec = mapRow(row);
      rec.items = await this.fetchItems(rec.id);
      result.push(rec);
    }
    return result;
  }

  async create(data: CreateRecurringInvoiceInput): Promise<RecurringInvoice> {
    const id = randomUUID();
    const companyId = data.companyId ?? (() => { throw new Error('companyId is required'); })();
    await prisma.$executeRaw`
      INSERT INTO "recurring_invoices" (
        "id", "name", "customerId", "userId", "type", "currency", "exchangeRate",
        "saleCondition", "paymentTerms", "stockBehavior", "warehouseId", "notes",
        "frequency", "dayOfMonth", "useCurrentPrices", "startDate", "endDate",
        "nextRunAt", "companyId", "fiscalMode", "updatedAt"
      ) VALUES (
        ${id}, ${data.name}, ${data.customerId}, ${data.userId},
        ${data.type}::"InvoiceType", ${data.currency ?? 'ARS'}::"Currency", ${data.exchangeRate ?? 1},
        ${data.saleCondition ?? 'CONTADO'}, ${data.paymentTerms ?? null}, ${data.stockBehavior ?? 'DISCOUNT'},
        ${data.warehouseId ?? null}, ${data.notes ?? null},
        ${data.frequency}, ${data.dayOfMonth ?? null}, ${data.useCurrentPrices ?? false},
        ${data.startDate}, ${data.endDate ?? null}, ${data.nextRunAt},
        ${companyId}, ${data.fiscalMode ?? 'FORMAL'}, NOW()
      )
    `;
    await this.replaceItems(id, data.items);
    return this.findById(id) as Promise<RecurringInvoice>;
  }

  private async replaceItems(
    recurringInvoiceId: string,
    items: CreateRecurringInvoiceInput['items']
  ): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "recurring_invoice_items" WHERE "recurringInvoiceId" = ${recurringInvoiceId}`;
    for (const item of items) {
      await prisma.$executeRaw`
        INSERT INTO "recurring_invoice_items" (
          "id", "recurringInvoiceId", "productId", "variantId", "quantity", "unitPrice", "discountPct", "taxRate"
        ) VALUES (
          ${randomUUID()}, ${recurringInvoiceId}, ${item.productId}, ${item.variantId ?? null},
          ${item.quantity}, ${item.unitPrice}, ${item.discountPct ?? 0}, ${item.taxRate ?? 21}
        )
      `;
    }
  }

  async update(
    id: string,
    data: Partial<CreateRecurringInvoiceInput> & { isActive?: boolean }
  ): Promise<RecurringInvoice> {
    const sets: Prisma.Sql[] = [Prisma.sql`"updatedAt" = NOW()`];
    if (data.name !== undefined) sets.push(Prisma.sql`"name" = ${data.name}`);
    if (data.customerId !== undefined) sets.push(Prisma.sql`"customerId" = ${data.customerId}`);
    if (data.type !== undefined) sets.push(Prisma.sql`"type" = ${data.type}::"InvoiceType"`);
    if (data.currency !== undefined) sets.push(Prisma.sql`"currency" = ${data.currency}::"Currency"`);
    if (data.exchangeRate !== undefined) sets.push(Prisma.sql`"exchangeRate" = ${data.exchangeRate}`);
    if (data.saleCondition !== undefined) sets.push(Prisma.sql`"saleCondition" = ${data.saleCondition}`);
    if (data.paymentTerms !== undefined) sets.push(Prisma.sql`"paymentTerms" = ${data.paymentTerms}`);
    if (data.stockBehavior !== undefined) sets.push(Prisma.sql`"stockBehavior" = ${data.stockBehavior}`);
    if (data.warehouseId !== undefined) sets.push(Prisma.sql`"warehouseId" = ${data.warehouseId}`);
    if (data.notes !== undefined) sets.push(Prisma.sql`"notes" = ${data.notes}`);
    if (data.frequency !== undefined) sets.push(Prisma.sql`"frequency" = ${data.frequency}`);
    if (data.dayOfMonth !== undefined) sets.push(Prisma.sql`"dayOfMonth" = ${data.dayOfMonth}`);
    if (data.useCurrentPrices !== undefined) sets.push(Prisma.sql`"useCurrentPrices" = ${data.useCurrentPrices}`);
    if (data.startDate !== undefined) sets.push(Prisma.sql`"startDate" = ${data.startDate}`);
    if (data.endDate !== undefined) sets.push(Prisma.sql`"endDate" = ${data.endDate}`);
    if (data.nextRunAt !== undefined) sets.push(Prisma.sql`"nextRunAt" = ${data.nextRunAt}`);
    if (data.isActive !== undefined) sets.push(Prisma.sql`"isActive" = ${data.isActive}`);

    await prisma.$executeRaw`
      UPDATE "recurring_invoices" SET ${Prisma.join(sets, ', ')} WHERE id = ${id}
    `;
    if (data.items) await this.replaceItems(id, data.items);
    return this.findById(id) as Promise<RecurringInvoice>;
  }

  async delete(id: string): Promise<void> {
    // Las facturas ya generadas quedan (FK SET NULL); solo se borra la plantilla.
    await prisma.$executeRaw`DELETE FROM "recurring_invoices" WHERE id = ${id}`;
  }

  async claimRun(id: string, newNextRunAt: Date): Promise<boolean> {
    // Condición "sigue vencida" en vez de igualdad exacta de timestamp (la
    // igualdad con parámetros Date no matchea de forma confiable). Sigue
    // siendo atómico: el primer UPDATE avanza nextRunAt y los siguientes
    // ya no cumplen el WHERE.
    const updated = await prisma.$executeRaw`
      UPDATE "recurring_invoices"
      SET "nextRunAt" = ${newNextRunAt}, "updatedAt" = NOW()
      WHERE id = ${id} AND "isActive" = true AND "nextRunAt" <= NOW()
    `;
    return updated > 0;
  }

  async recordRun(id: string, ranAt: Date): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "recurring_invoices"
      SET "lastRunAt" = ${ranAt}, "generatedCount" = "generatedCount" + 1, "updatedAt" = NOW()
      WHERE id = ${id}
    `;
  }
}
