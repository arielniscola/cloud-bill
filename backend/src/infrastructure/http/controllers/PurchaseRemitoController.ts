import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';

// ── Schemas ──────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  productId:   z.string().uuid().optional().nullable(),
  variantId:   z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity:    z.coerce.number().positive(),
  unitPrice:   z.coerce.number().min(0).default(0),
});

const createSchema = z.object({
  supplierId:  z.string().uuid(),
  warehouseId: z.string().uuid(),
  date:        z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
  items:       z.array(itemSchema).min(1, 'Agregue al menos un ítem'),
});

const updateNumberSchema = z.object({
  number: z.string().min(1, 'El número es requerido'),
});

const querySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().default(20),
  supplierId:  z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status:      z.enum(['RECEIVED', 'INVOICED', 'CANCELLED']).optional(),
  dateFrom:    z.string().optional(),
  dateTo:      z.string().optional(),
  search:      z.string().trim().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getNextNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "purchase_remitos"
    WHERE "companyId" = ${companyId} AND number LIKE ${'RC-' + year + '-%'}
  `;
  return `RC-${year}-${String(Number(row?.c ?? 0n) + 1).padStart(4, '0')}`;
}

async function fetchFull(id: string) {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT r.*, s.name AS "supplierName", s.cuit AS "supplierCuit",
           w.name AS "warehouseName", u.name AS "userName",
           p.number AS "purchaseNumber"
    FROM "purchase_remitos" r
    LEFT JOIN "suppliers"  s ON s.id = r."supplierId"
    LEFT JOIN "warehouses" w ON w.id = r."warehouseId"
    LEFT JOIN "users"      u ON u.id = r."userId"
    LEFT JOIN "purchases"  p ON p.id = r."purchaseId"
    WHERE r.id = ${id}
  `;
  if (!rows[0]) return null;
  const r = rows[0];

  const items = await prisma.$queryRaw<any[]>`
    SELECT ri.id, ri."productId", ri."variantId", ri.description, ri.quantity, ri."unitPrice",
           pr.name AS "productName"
    FROM "purchase_remito_items" ri
    LEFT JOIN "products" pr ON pr.id = ri."productId"
    WHERE ri."remitoId" = ${id}
    ORDER BY ri."createdAt" ASC
  `;

  return {
    ...r,
    supplier:  r.supplierName  ? { id: r.supplierId, name: r.supplierName, cuit: r.supplierCuit ?? null } : undefined,
    warehouse: r.warehouseName ? { id: r.warehouseId, name: r.warehouseName } : undefined,
    user:      r.userName      ? { id: r.userId, name: r.userName } : undefined,
    purchase:  r.purchaseId    ? { id: r.purchaseId, number: r.purchaseNumber } : null,
    items,
  };
}

// ── Controller ─────────────────────────────────────────────────────────────

export class PurchaseRemitoController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = querySchema.parse(req.query);
      const offset = (q.page - 1) * q.limit;

      const conds: any[] = [`r."companyId" = '${req.companyId}'`];
      if (q.supplierId)  conds.push(`r."supplierId" = '${q.supplierId}'`);
      if (q.warehouseId) conds.push(`r."warehouseId" = '${q.warehouseId}'`);
      if (q.status)      conds.push(`r.status = '${q.status}'`);
      if (q.dateFrom)    conds.push(`r.date >= '${new Date(q.dateFrom).toISOString()}'`);
      if (q.dateTo) {
        const to = new Date(q.dateTo);
        to.setHours(23, 59, 59, 999);
        conds.push(`r.date <= '${to.toISOString()}'`);
      }
      if (q.search) {
        const term = q.search.replace(/'/g, "''");
        conds.push(`(r.number ILIKE '%${term}%' OR s.name ILIKE '%${term}%')`);
      }
      if (req.fiscalMode) conds.push(`r."fiscalMode" = '${req.fiscalMode}'`);
      const where = conds.join(' AND ');

      const [countRows, rows] = await Promise.all([
        prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) AS c FROM "purchase_remitos" r LEFT JOIN "suppliers" s ON s.id = r."supplierId" WHERE ${where}`),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT r.*, s.name AS "supplierName", w.name AS "warehouseName",
                 p.number AS "purchaseNumber",
                 (SELECT COUNT(*) FROM "purchase_remito_items" ri WHERE ri."remitoId" = r.id) AS "itemCount"
          FROM "purchase_remitos" r
          LEFT JOIN "suppliers"  s ON s.id = r."supplierId"
          LEFT JOIN "warehouses" w ON w.id = r."warehouseId"
          LEFT JOIN "purchases"  p ON p.id = r."purchaseId"
          WHERE ${where}
          ORDER BY r."createdAt" DESC
          LIMIT ${q.limit} OFFSET ${offset}
        `),
      ]);

      const total = Number(countRows[0]?.c ?? 0);
      const data = rows.map((r) => ({
        ...r,
        itemCount: Number(r.itemCount ?? 0),
        supplier:  r.supplierName  ? { id: r.supplierId, name: r.supplierName } : undefined,
        warehouse: r.warehouseName ? { id: r.warehouseId, name: r.warehouseName } : undefined,
        purchase:  r.purchaseId    ? { id: r.purchaseId, number: r.purchaseNumber } : null,
      }));

      res.json({ status: 'success', data, total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) });
    } catch (error) { next(error); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remito = await fetchFull(req.params.id);
      if (!remito || remito.companyId !== req.companyId) throw new NotFoundError('Remito de compra');
      res.json({ status: 'success', data: remito });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const stockRepo = container.resolve<IStockRepository>('StockRepository');
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const id = randomUUID();
      const number = await getNextNumber(req.companyId!);
      const date = data.date ? new Date(data.date) : new Date();
      const fiscalMode = req.fiscalMode ?? 'FORMAL';

      await prisma.$executeRaw`
        INSERT INTO "purchase_remitos"
          (id, number, "supplierId", "userId", "warehouseId", date, status, notes, "companyId", "fiscalMode", "updatedAt")
        VALUES
          (${id}, ${number}, ${data.supplierId}, ${req.user!.userId}, ${data.warehouseId}, ${date},
           'RECEIVED', ${data.notes ?? null}, ${req.companyId}, ${fiscalMode}, NOW())
      `;

      for (const item of data.items) {
        await prisma.$executeRaw`
          INSERT INTO "purchase_remito_items"
            (id, "remitoId", "productId", "variantId", description, quantity, "unitPrice")
          VALUES
            (${randomUUID()}, ${id}, ${item.productId ?? null}, ${item.variantId ?? null},
             ${item.description}, ${item.quantity}, ${item.unitPrice})
        `;
      }

      // Mercadería entra al stock (recepción)
      for (const item of data.items.filter((i) => i.productId)) {
        try {
          await stockRepo.addMovement({
            productId:   item.productId!,
            variantId:   item.variantId ?? null,
            warehouseId: data.warehouseId,
            type:        'PURCHASE',
            quantity:    item.quantity,
            reason:      `Remito de compra ${number}`,
            referenceId: id,
            userId:      req.user!.userId,
          });
        } catch (stockError) {
          console.error(`Stock movement failed for product ${item.productId}:`, stockError);
        }
      }

      await activityRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'PurchaseRemito',
        entityId: id,
        description: `Remito de compra ${number} recibido`,
      });

      const remito = await fetchFull(id);
      res.status(201).json({ status: 'success', data: remito });
    } catch (error) { next(error); }
  }

  // Corrige el número del remito (ej. para que coincida con el remito físico
  // preimpreso del proveedor). No aplica a remitos cancelados.
  async updateNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remito = await fetchFull(req.params.id);
      if (!remito || remito.companyId !== req.companyId) throw new NotFoundError('Remito de compra');
      if (remito.status === 'CANCELLED') {
        throw new AppError('No se puede editar un remito cancelado', 400);
      }

      const { number } = updateNumberSchema.parse(req.body);
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const previousNumber = remito.number;

      await prisma.$executeRaw`
        UPDATE "purchase_remitos" SET number = ${number}, "updatedAt" = NOW() WHERE id = ${remito.id}
      `;

      await activityRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'PurchaseRemito',
        entityId: remito.id,
        description: `Remito de compra renumerado de ${previousNumber} a ${number}`,
      });

      const updated = await fetchFull(remito.id);
      res.json({ status: 'success', data: updated });
    } catch (error) { next(error); }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remito = await fetchFull(req.params.id);
      if (!remito || remito.companyId !== req.companyId) throw new NotFoundError('Remito de compra');
      if (remito.status !== 'RECEIVED') {
        throw new AppError('Solo se pueden cancelar remitos en estado Recibido', 400);
      }

      const stockRepo = container.resolve<IStockRepository>('StockRepository');
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      // Revertir stock recibido
      for (const item of (remito.items as any[]).filter((i) => i.productId)) {
        try {
          await stockRepo.addMovement({
            productId:   item.productId,
            variantId:   item.variantId ?? null,
            warehouseId: remito.warehouseId,
            type:        'ADJUSTMENT_OUT',
            quantity:    Number(item.quantity),
            reason:      `Cancelación remito ${remito.number}`,
            referenceId: remito.id,
            userId:      req.user!.userId,
          });
        } catch (stockError) {
          console.error(`Stock reversal failed for product ${item.productId}:`, stockError);
        }
      }

      await prisma.$executeRaw`
        UPDATE "purchase_remitos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${remito.id}
      `;

      await activityRepo.create({
        userId: req.user!.userId,
        action: 'CANCEL',
        entity: 'PurchaseRemito',
        entityId: remito.id,
        description: `Remito de compra ${remito.number} cancelado`,
      });

      const updated = await fetchFull(remito.id);
      res.json({ status: 'success', data: updated });
    } catch (error) { next(error); }
  }

}
