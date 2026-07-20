import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'crypto';
import { IStockRepository, BulkAdjustItem } from '../../../domain/repositories/IWarehouseRepository';
import { Stock, StockMovement, CreateStockMovementInput } from '../../../domain/entities/Stock';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import { InsufficientStockError } from '../../../shared/errors/AppError';
import prisma from '../prisma';

// Variant-aware queries use raw SQL since:
//   1) Stock no longer has a single composite unique (it's split by variantId IS NULL/NOT NULL)
//   2) The Prisma client may be stale (DLL lock on Windows) and not know about variantId yet

type RawStock = {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  quantity: string | number;
  reservedQuantity: string | number;
  minQuantity: string | number | null;
  updatedAt: Date;
};

function mapStock(r: RawStock): Stock {
  return {
    id: r.id,
    productId: r.productId,
    variantId: r.variantId ?? null,
    warehouseId: r.warehouseId,
    quantity: new Decimal(r.quantity),
    minQuantity: r.minQuantity !== null ? new Decimal(r.minQuantity) : null,
    updatedAt: r.updatedAt,
    // reservedQuantity is on the row but not in the entity — preserved at DB level only
  } as Stock & { reservedQuantity?: Decimal };
}

@injectable()
export class PrismaStockRepository implements IStockRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  private async _getStockRow(
    client: Prisma.TransactionClient | PrismaClient,
    productId: string,
    warehouseId: string,
    v: string | null
  ): Promise<RawStock | null> {
    const rows = v === null
      ? await client.$queryRaw<RawStock[]>`
          SELECT * FROM "stocks"
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND "variantId" IS NULL
          LIMIT 1
        `
      : await client.$queryRaw<RawStock[]>`
          SELECT * FROM "stocks"
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND "variantId" = ${v}
          LIMIT 1
        `;
    return rows[0] ?? null;
  }

  async getStock(productId: string, warehouseId: string, variantId?: string | null): Promise<Stock | null> {
    const row = await this._getStockRow(this.prisma, productId, warehouseId, variantId ?? null);
    return row ? mapStock(row) : null;
  }

  async getStockByProduct(productId: string): Promise<Stock[]> {
    const rows = await this.prisma.$queryRaw<RawStock[]>`
      SELECT * FROM "stocks" WHERE "productId" = ${productId}
    `;
    return rows.map(mapStock);
  }

  async getStockByWarehouse(warehouseId: string): Promise<Stock[]> {
    // Includes product + variant info for UI. Returns extended objects.
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        s.*,
        p.id    AS "p_id", p.sku AS "p_sku", p.name AS "p_name", p.cost AS "p_cost",
        p."rubroId" AS "p_rubroId", p."brandId" AS "p_brandId",
        c.name  AS "cat_name", b.name AS "brand_name",
        v.id    AS "v_id", v.sku AS "v_sku", v.name AS "v_name", v.attributes AS "v_attributes",
        v."priceOverride" AS "v_priceOverride", v."costOverride" AS "v_costOverride"
      FROM "stocks" s
      LEFT JOIN "products" p          ON p.id = s."productId"
      LEFT JOIN "rubros" c        ON c.id = p."rubroId"
      LEFT JOIN "brands" b            ON b.id = p."brandId"
      LEFT JOIN "product_variants" v  ON v.id = s."variantId"
      WHERE s."warehouseId" = ${warehouseId}
      ORDER BY p.name ASC, v.name ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      variantId: r.variantId ?? null,
      warehouseId: r.warehouseId,
      quantity: new Decimal(r.quantity),
      reservedQuantity: new Decimal(r.reservedQuantity),
      minQuantity: r.minQuantity !== null ? new Decimal(r.minQuantity) : null,
      updatedAt: r.updatedAt,
      product: r.p_id ? {
        id: r.p_id, sku: r.p_sku, name: r.p_name,
        cost: new Decimal(r.p_cost ?? 0),
        rubro: r.cat_name ? { name: r.cat_name } : null,
        brand: r.brand_name ? { name: r.brand_name } : null,
      } : null,
      variant: r.v_id ? {
        id: r.v_id, sku: r.v_sku, name: r.v_name,
        attributes: r.v_attributes ?? {},
        priceOverride: r.v_priceOverride !== null ? new Decimal(r.v_priceOverride) : null,
        costOverride: r.v_costOverride !== null ? new Decimal(r.v_costOverride) : null,
      } : null,
    } as any));
  }

  async updateStock(productId: string, warehouseId: string, quantity: number, variantId?: string | null): Promise<Stock> {
    const v = variantId ?? null;
    const existing = await this.getStock(productId, warehouseId, v);
    if (existing) {
      await this.prisma.$executeRaw`
        UPDATE "stocks" SET "quantity" = ${quantity}::decimal, "updatedAt" = NOW()
        WHERE "id" = ${existing.id}
      `;
      return (await this.getStock(productId, warehouseId, v))!;
    }
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "stocks" ("id", "productId", "variantId", "warehouseId", "quantity", "updatedAt")
      VALUES (${id}, ${productId}, ${v}, ${warehouseId}, ${quantity}::decimal, NOW())
    `;
    return (await this.getStock(productId, warehouseId, v))!;
  }

  async setMinQuantity(
    productId: string,
    warehouseId: string,
    minQuantity: number | null,
    variantId?: string | null
  ): Promise<Stock> {
    const v = variantId ?? null;
    const existing = await this.getStock(productId, warehouseId, v);
    if (!existing) {
      const id = randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO "stocks" ("id", "productId", "variantId", "warehouseId", "quantity", "minQuantity", "updatedAt")
        VALUES (${id}, ${productId}, ${v}, ${warehouseId}, 0, ${minQuantity}::decimal, NOW())
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "stocks" SET "minQuantity" = ${minQuantity}::decimal, "updatedAt" = NOW()
        WHERE "id" = ${existing.id}
      `;
    }
    return (await this.getStock(productId, warehouseId, v))!;
  }

  async getLowStockItems(warehouseId?: string, companyId?: string): Promise<Stock[]> {
    const conds: Prisma.Sql[] = [Prisma.sql`s."minQuantity" IS NOT NULL`];
    if (warehouseId) conds.push(Prisma.sql`s."warehouseId" = ${warehouseId}`);
    if (companyId)   conds.push(Prisma.sql`w."companyId" = ${companyId}`);
    const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`;

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT s.*,
             p.id AS "p_id", p.sku AS "p_sku", p.name AS "p_name",
             w.id AS "w_id", w.name AS "w_name",
             v.id AS "v_id", v.sku AS "v_sku", v.name AS "v_name", v.attributes AS "v_attributes"
      FROM "stocks" s
      LEFT JOIN "products" p ON p.id = s."productId"
      LEFT JOIN "warehouses" w ON w.id = s."warehouseId"
      LEFT JOIN "product_variants" v ON v.id = s."variantId"
      ${where}
    `;
    return rows
      .filter((r) => {
        const available = new Decimal(r.quantity).minus(new Decimal(r.reservedQuantity));
        return available.lessThan(new Decimal(r.minQuantity));
      })
      .map((r) => ({
        id: r.id,
        productId: r.productId,
        variantId: r.variantId ?? null,
        warehouseId: r.warehouseId,
        quantity: new Decimal(r.quantity),
        reservedQuantity: new Decimal(r.reservedQuantity),
        minQuantity: new Decimal(r.minQuantity),
        updatedAt: r.updatedAt,
        product: r.p_id ? { id: r.p_id, sku: r.p_sku, name: r.p_name } : null,
        warehouse: r.w_id ? { id: r.w_id, name: r.w_name } : null,
        variant: r.v_id ? { id: r.v_id, sku: r.v_sku, name: r.v_name, attributes: r.v_attributes ?? {} } : null,
      } as any));
  }

  // Productos no inventariados (trackStock = false, ej. servicios) no generan ni
  // validan stock. Se consulta por SQL crudo para no depender del cliente Prisma
  // (puede estar desactualizado por el lock de DLL en Windows). Por defecto true
  // (compatibilidad hacia atrás: productos sin la columna seteada siguen con stock).
  private async _tracksStock(
    client: Prisma.TransactionClient | PrismaClient,
    productId: string
  ): Promise<boolean> {
    const rows = await client.$queryRaw<{ trackStock: boolean }[]>`
      SELECT "trackStock" FROM "products" WHERE "id" = ${productId} LIMIT 1
    `;
    return rows[0] ? rows[0].trackStock !== false : true;
  }

  private async _addMovementWithTx(
    tx: Prisma.TransactionClient,
    data: CreateStockMovementInput
  ): Promise<StockMovement> {
    const v = data.variantId ?? null;

    // Producto no inventariado: no se crea fila de stock ni movimiento.
    if (!(await this._tracksStock(tx, data.productId))) {
      return {
        id: '',
        productId: data.productId,
        variantId: v,
        warehouseId: data.warehouseId,
        type: data.type,
        quantity: new Decimal(data.quantity),
        previousQuantity: new Decimal(0),
        newQuantity: new Decimal(0),
        reason: data.reason ?? null,
        referenceId: data.referenceId ?? null,
        userId: data.userId ?? null,
        createdAt: new Date(),
      } as unknown as StockMovement;
    }

    // Look up current stock row (variant-aware)
    const existing = v === null
      ? await tx.$queryRaw<RawStock[]>`
          SELECT * FROM "stocks"
          WHERE "productId" = ${data.productId} AND "warehouseId" = ${data.warehouseId} AND "variantId" IS NULL
          LIMIT 1
        `
      : await tx.$queryRaw<RawStock[]>`
          SELECT * FROM "stocks"
          WHERE "productId" = ${data.productId} AND "warehouseId" = ${data.warehouseId} AND "variantId" = ${v}
          LIMIT 1
        `;

    const previousQuantity = existing[0] ? new Decimal(existing[0].quantity) : new Decimal(0);
    const quantity = new Decimal(data.quantity);
    let newQuantity: Decimal;

    const isOutgoing = ['SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'REMITO_OUT'].includes(data.type);

    if (isOutgoing) {
      newQuantity = previousQuantity.minus(quantity);
      if (newQuantity.lessThan(0)) {
        const productRow = await tx.product.findUnique({ where: { id: data.productId } });
        const productName = productRow?.name ?? data.productId;
        throw new InsufficientStockError(
          productName,
          previousQuantity.toNumber(),
          quantity.toNumber()
        );
      }
    } else {
      newQuantity = previousQuantity.plus(quantity);
    }

    // Upsert stock row
    if (existing[0]) {
      await tx.$executeRaw`
        UPDATE "stocks" SET "quantity" = ${newQuantity.toString()}::decimal, "updatedAt" = NOW()
        WHERE "id" = ${existing[0].id}
      `;
    } else {
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "stocks" ("id", "productId", "variantId", "warehouseId", "quantity", "updatedAt")
        VALUES (${id}, ${data.productId}, ${v}, ${data.warehouseId}, ${newQuantity.toString()}::decimal, NOW())
      `;
    }

    // Insert movement
    const movId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "stock_movements" (
        "id", "productId", "variantId", "warehouseId", "type", "quantity",
        "previousQuantity", "newQuantity", "reason", "referenceId",
        "userId", "relatedWarehouseId", "createdAt"
      ) VALUES (
        ${movId}, ${data.productId}, ${v}, ${data.warehouseId}, ${data.type}::"StockMovementType",
        ${quantity.toString()}::decimal, ${previousQuantity.toString()}::decimal, ${newQuantity.toString()}::decimal,
        ${data.reason ?? null}, ${data.referenceId ?? null}, ${data.userId ?? null},
        ${data.relatedWarehouseId ?? null}, NOW()
      )
    `;

    return {
      id: movId,
      productId: data.productId,
      variantId: v,
      warehouseId: data.warehouseId,
      type: data.type,
      quantity,
      previousQuantity,
      newQuantity,
      reason: data.reason ?? null,
      referenceId: data.referenceId ?? null,
      userId: data.userId ?? null,
      relatedWarehouseId: data.relatedWarehouseId ?? null,
      createdAt: new Date(),
    };
  }

  async addMovement(data: CreateStockMovementInput, tx?: Prisma.TransactionClient): Promise<StockMovement> {
    // Con `tx` participa de la transacción del llamador; sin él abre la propia.
    if (tx) return this._addMovementWithTx(tx, data);
    return this.prisma.$transaction((t) => this._addMovementWithTx(t, data));
  }

  async getMovements(
    filters: { productId?: string; variantId?: string; warehouseId?: string; type?: string; startDate?: string; endDate?: string; companyId?: string },
    pagination: PaginationParams = { page: 1, limit: 10 }
  ): Promise<PaginatedResult<StockMovement>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [];
    if (filters.productId)   conditions.push(Prisma.sql`sm."productId" = ${filters.productId}`);
    if (filters.variantId)   conditions.push(Prisma.sql`sm."variantId" = ${filters.variantId}`);
    if (filters.warehouseId) conditions.push(Prisma.sql`sm."warehouseId" = ${filters.warehouseId}`);
    if (filters.companyId)   conditions.push(Prisma.sql`w."companyId" = ${filters.companyId}`);
    if (filters.type)        conditions.push(Prisma.sql`sm.type::text = ${filters.type}`);
    if (filters.startDate)   conditions.push(Prisma.sql`sm."createdAt" >= ${new Date(filters.startDate)}`);
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(Prisma.sql`sm."createdAt" <= ${endDate}`);
    }
    const whereClause = conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.sql``;

    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT
          sm.id, sm."productId", sm."variantId", sm."warehouseId", sm.type::text AS type,
          sm.quantity, sm."previousQuantity", sm."newQuantity",
          sm.reason, sm."referenceId", sm."userId", sm."relatedWarehouseId", sm."createdAt",
          p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku",
          v.id AS "var_id", v.name AS "var_name", v.sku AS "var_sku", v.attributes AS "var_attributes",
          w.id AS "wh_id", w.name AS "wh_name",
          u.name AS "user_name",
          COALESCE(
            (SELECT c.name FROM invoices i JOIN customers c ON c.id = i."customerId" WHERE i.id = sm."referenceId" LIMIT 1),
            (SELECT s.name FROM purchases pu JOIN suppliers s ON s.id = pu."supplierId" WHERE pu.id = sm."referenceId" LIMIT 1),
            (SELECT c.name FROM remitos r JOIN customers c ON c.id = r."customerId" WHERE r.id = sm."referenceId" LIMIT 1),
            (SELECT c.name FROM orden_pedidos op JOIN customers c ON c.id = op."customerId" WHERE op.id = sm."referenceId" LIMIT 1),
            (SELECT c.name FROM budgets b JOIN customers c ON c.id = b."customerId" WHERE b.id = sm."referenceId" LIMIT 1)
          ) AS "partyName"
        FROM stock_movements sm
        LEFT JOIN products p           ON p.id = sm."productId"
        LEFT JOIN product_variants v   ON v.id = sm."variantId"
        LEFT JOIN warehouses w         ON w.id = sm."warehouseId"
        LEFT JOIN users u              ON u.id = sm."userId"
        ${whereClause}
        ORDER BY sm."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM stock_movements sm
        LEFT JOIN warehouses w ON w.id = sm."warehouseId"
        ${whereClause}
      `,
    ]);

    const total = Number(totalRows[0]?.count ?? 0);

    const data = rows.map((r) => ({
      id:                 r.id,
      productId:          r.productId,
      variantId:          r.variantId ?? null,
      warehouseId:        r.warehouseId,
      type:               r.type,
      quantity:           r.quantity,
      previousQuantity:   r.previousQuantity,
      newQuantity:        r.newQuantity,
      reason:             r.reason ?? null,
      referenceId:        r.referenceId ?? null,
      userId:             r.userId ?? null,
      relatedWarehouseId: r.relatedWarehouseId ?? null,
      createdAt:          r.createdAt,
      partyName:          r.partyName ?? null,
      product:   r.prod_id ? { id: r.prod_id, name: r.prod_name, sku: r.prod_sku } : null,
      variant:   r.var_id  ? { id: r.var_id,  name: r.var_name,  sku: r.var_sku, attributes: r.var_attributes ?? {} } : null,
      warehouse: r.wh_id   ? { id: r.wh_id,   name: r.wh_name } : null,
      user:      r.user_name ? { name: r.user_name } : null,
    }));

    return { data: data as any, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adjustBulk(
    warehouseId: string,
    items: BulkAdjustItem[],
    reason: string,
    userId?: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const v = item.variantId ?? null;
        const existing = v === null
          ? await tx.$queryRaw<RawStock[]>`
              SELECT * FROM "stocks"
              WHERE "productId" = ${item.productId} AND "warehouseId" = ${warehouseId} AND "variantId" IS NULL
              LIMIT 1
            `
          : await tx.$queryRaw<RawStock[]>`
              SELECT * FROM "stocks"
              WHERE "productId" = ${item.productId} AND "warehouseId" = ${warehouseId} AND "variantId" = ${v}
              LIMIT 1
            `;
        const currentQty = existing[0] ? new Decimal(existing[0].quantity) : new Decimal(0);
        const newQty = new Decimal(item.newQuantity);
        const diff = newQty.minus(currentQty);

        if (diff.isZero()) continue;

        const type = diff.greaterThan(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        await this._addMovementWithTx(tx, {
          productId: item.productId,
          variantId: v,
          warehouseId,
          type,
          quantity: diff.abs().toNumber(),
          reason,
          userId,
        });
      }
    });
  }

  async exportWarehouseStock(warehouseId: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT s.*,
             p.sku AS "p_sku", p.name AS "p_name", p.cost AS "p_cost",
             c.name AS "cat_name", b.name AS "brand_name",
             v.sku AS "v_sku", v.name AS "v_name"
      FROM "stocks" s
      LEFT JOIN "products" p ON p.id = s."productId"
      LEFT JOIN "rubros" c ON c.id = p."rubroId"
      LEFT JOIN "brands" b ON b.id = p."brandId"
      LEFT JOIN "product_variants" v ON v.id = s."variantId"
      WHERE s."warehouseId" = ${warehouseId}
      ORDER BY p.name ASC, v.name ASC
    `;

    const header = 'SKU,Variante,Nombre,Rubro,Marca,Stock Total,Reservado,Disponible,Stock Mínimo,Costo Unitario,Valor Total';

    const csvRows = rows.map((s) => {
      const qty = new Decimal(s.quantity);
      const reserved = new Decimal(s.reservedQuantity);
      const available = qty.minus(reserved);
      const cost = new Decimal(s.p_cost ?? 0);
      const totalValue = qty.mul(cost);
      const sku = s.v_sku ?? s.p_sku ?? '';
      const variant = s.v_name ?? '';
      return [
        sku,
        `"${variant.replace(/"/g, '""')}"`,
        `"${(s.p_name ?? '').replace(/"/g, '""')}"`,
        s.cat_name ?? '',
        s.brand_name ?? '',
        qty.toNumber(),
        reserved.toNumber(),
        available.toNumber(),
        s.minQuantity !== null ? new Decimal(s.minQuantity).toNumber() : '',
        cost.toNumber(),
        totalValue.toNumber(),
      ].join(',');
    });

    return [header, ...csvRows].join('\n');
  }

  async incrementReserved(
    productId: string,
    warehouseId: string,
    quantity: number,
    variantId?: string | null,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const v = variantId ?? null;
    // Producto no inventariado: no reserva stock.
    if (!(await this._tracksStock(client, productId))) return;
    const existing = await this._getStockRow(client, productId, warehouseId, v);
    if (existing) {
      await client.$executeRaw`
        UPDATE "stocks" SET "reservedQuantity" = "reservedQuantity" + ${quantity}::decimal, "updatedAt" = NOW()
        WHERE "id" = ${existing.id}
      `;
    } else {
      const id = randomUUID();
      await client.$executeRaw`
        INSERT INTO "stocks" ("id", "productId", "variantId", "warehouseId", "quantity", "reservedQuantity", "updatedAt")
        VALUES (${id}, ${productId}, ${v}, ${warehouseId}, 0, ${quantity}::decimal, NOW())
      `;
    }
  }

  async decrementReserved(
    productId: string,
    warehouseId: string,
    quantity: number,
    variantId?: string | null,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const v = variantId ?? null;
    const existing = await this._getStockRow(client, productId, warehouseId, v);
    if (!existing) return;
    await client.$executeRaw`
      UPDATE "stocks"
      SET "reservedQuantity" = GREATEST("reservedQuantity" - ${quantity}::decimal, 0),
          "updatedAt" = NOW()
      WHERE "id" = ${existing.id}
    `;
  }

  async transfer(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string,
    variantId?: string | null
  ): Promise<void> {
    const v = variantId ?? null;
    await this.prisma.$transaction(async (tx) => {
      await this._addMovementWithTx(tx, {
        productId,
        variantId: v,
        warehouseId: fromWarehouseId,
        type: 'TRANSFER_OUT',
        quantity,
        reason: 'Transfer to warehouse',
        userId,
        relatedWarehouseId: toWarehouseId,
      });

      await this._addMovementWithTx(tx, {
        productId,
        variantId: v,
        warehouseId: toWarehouseId,
        type: 'TRANSFER_IN',
        quantity,
        reason: 'Transfer from warehouse',
        userId,
        relatedWarehouseId: fromWarehouseId,
      });
    });
  }
}
