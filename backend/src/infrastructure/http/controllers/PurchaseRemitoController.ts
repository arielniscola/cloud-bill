import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { NotFoundError, AppError, InsufficientStockError } from '../../../shared/errors/AppError';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { allocateDocumentNumber } from '../../database/DocumentSequence';

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
  return allocateDocumentNumber('PURCHASE_REMITO', companyId);
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
      const date = data.date ? new Date(data.date) : new Date();
      const fiscalMode = req.fiscalMode ?? 'FORMAL';

      // El remito, sus ítems y el ingreso de stock se confirman o se revierten
      // juntos. Antes eran queries sueltas: si fallaba a mitad quedaba un remito
      // con la mercadería sin ingresar, o ingresada a medias.
      let number!: string;
      await prisma.$transaction(async (tx) => {
        // Numerar acá adentro: si la transacción se revierte, el número vuelve
        // al pool en vez de dejar un hueco en la correlatividad.
        number = await allocateDocumentNumber('PURCHASE_REMITO', req.companyId!, { tx });

        await tx.$executeRaw`
          INSERT INTO "purchase_remitos"
            (id, number, "supplierId", "userId", "warehouseId", date, status, notes, "companyId", "fiscalMode", "updatedAt")
          VALUES
            (${id}, ${number}, ${data.supplierId}, ${req.user!.userId}, ${data.warehouseId}, ${date},
             'RECEIVED', ${data.notes ?? null}, ${req.companyId}, ${fiscalMode}, NOW())
        `;

        for (const item of data.items) {
          await tx.$executeRaw`
            INSERT INTO "purchase_remito_items"
              (id, "remitoId", "productId", "variantId", description, quantity, "unitPrice")
            VALUES
              (${randomUUID()}, ${id}, ${item.productId ?? null}, ${item.variantId ?? null},
               ${item.description}, ${item.quantity}, ${item.unitPrice})
          `;
        }

        // Mercadería entra al stock (recepción).
        //
        // Un fallo acá tiene que voltear el remito entero. Antes se atrapaba y
        // se mandaba a console.error: el remito quedaba creado y la mercadería
        // nunca entraba al depósito, en silencio y sin forma de enterarse.
        for (const item of data.items.filter((i) => i.productId)) {
          await stockRepo.addMovement({
            productId:   item.productId!,
            variantId:   item.variantId ?? null,
            warehouseId: data.warehouseId,
            type:        'PURCHASE',
            quantity:    item.quantity,
            reason:      `Remito de compra ${number}`,
            referenceId: id,
            userId:      req.user!.userId,
          }, tx);
        }
      });

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

      // La reversión de stock y el cambio de estado van juntos: antes el error
      // de stock se atrapaba y el remito quedaba CANCELLED igual, con la
      // mercadería todavía sumada en el depósito.
      //
      // Si la mercadería ya se vendió, la salida no entra y la cancelación
      // falla. Es lo correcto: hay que resolver el stock antes de cancelar, no
      // dejar el depósito mintiendo.
      await prisma.$transaction(async (tx) => {
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
            }, tx);
          } catch (stockError) {
            if (stockError instanceof InsufficientStockError) {
              throw new AppError(
                `No se puede cancelar el remito ${remito.number}: no hay stock suficiente de ` +
                `"${item.description}" para revertir la recepción. Puede que ya se haya vendido o ` +
                `transferido. Ajustá el stock y volvé a intentar.`,
                400
              );
            }
            throw stockError;
          }
        }

        await tx.$executeRaw`
          UPDATE "purchase_remitos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${remito.id}
        `;
      });

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
