import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { startOfUtcDay, endOfUtcDay } from '../../../shared/utils/dateRange';
import { container } from 'tsyringe';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { NotFoundError, AppError, InsufficientStockError } from '../../../shared/errors/AppError';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { allocateDocumentNumber } from '../../database/DocumentSequence';
import { findUserIdsByRoles, sendPushToUsers } from '../../services/PushService';

// ── Schemas ──────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  productId:   z.string().uuid().optional().nullable(),
  variantId:   z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity:    z.coerce.number().positive(),
  unitPrice:   z.coerce.number().min(0).default(0),
  // Lote y vencimiento de lo que entra (productos con lotes).
  lotNumber:   z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(60).optional().nullable()),
  expiresAt:   z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vencimiento inválido').optional().nullable()),
});

const createSchema = z.object({
  supplierId:  z.string().uuid(),
  warehouseId: z.string().uuid(),
  date:        z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
  items:       z.array(itemSchema).min(1, 'Agregue al menos un ítem'),
});

// Confirmación de una recepción cargada por depósito: el admin puede corregir
// cada línea (llegaron 48 y no 50, otro lote…). Las líneas que no manda quedan
// como las cargó el depósito.
const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).optional().nullable());
const confirmSchema = z.object({
  items: z.array(z.object({
    id:        z.string().uuid(),
    quantity:  z.coerce.number().min(0),
    lotNumber: optionalText(60),
    expiresAt: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vencimiento inválido').optional().nullable()),
  })).optional(),
  notes: optionalText(500),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Indicá el motivo del rechazo').max(500),
});

/** Quién carga la recepción sin que entre el stock: queda para que un admin la confirme. */
const NEEDS_CONFIRMATION_ROLES = ['WAREHOUSE_CLERK'];
/** A quién se le avisa que hay una recepción para confirmar. */
const CONFIRMER_ROLES = ['ADMIN', 'OWNER'];

type StockLine = { productId: string | null; variantId: string | null; quantity: number; lotNumber: string | null; expiresAt: string | null };

/**
 * Ingreso de la mercadería al depósito. Corre dentro de la transacción del que
 * llama: si falla una línea se voltea todo (el remito no queda a medias).
 */
async function ingestStock(
  tx: Prisma.TransactionClient,
  remito: { id: string; number: string; warehouseId: string },
  lines: StockLine[],
  userId: string
): Promise<void> {
  const stockRepo = container.resolve<IStockRepository>('StockRepository');
  for (const item of lines.filter((i) => i.productId && i.quantity > 0)) {
    await stockRepo.addMovement({
      productId:   item.productId!,
      variantId:   item.variantId ?? null,
      warehouseId: remito.warehouseId,
      type:        'PURCHASE',
      quantity:    item.quantity,
      reason:      `Remito de compra ${remito.number}`,
      referenceId: remito.id,
      userId,
      // Productos con lotes: la línea trae el lote y su vencimiento (sin lote → S/L).
      lots: item.lotNumber
        ? [{ lotNumber: item.lotNumber, expiresAt: item.expiresAt ?? null, quantity: item.quantity }]
        : undefined,
    }, tx);
  }
}

const updateNumberSchema = z.object({
  number: z.string().min(1, 'El número es requerido'),
});

const querySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().default(20),
  supplierId:  z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status:      z.enum(['RECEIVED', 'INVOICED', 'CANCELLED', 'PENDING_CONFIRMATION', 'REJECTED']).optional(),
  dateFrom:    z.string().optional(),
  dateTo:      z.string().optional(),
  search:      z.string().trim().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchFull(id: string) {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT r.*, s.name AS "supplierName", s.cuit AS "supplierCuit",
           w.name AS "warehouseName", u.name AS "userName",
           p.number AS "purchaseNumber",
           cu.name AS "confirmedByName", ru.name AS "rejectedByName"
    FROM "purchase_remitos" r
    LEFT JOIN "suppliers"  s ON s.id = r."supplierId"
    LEFT JOIN "warehouses" w ON w.id = r."warehouseId"
    LEFT JOIN "users"      u ON u.id = r."userId"
    LEFT JOIN "users"      cu ON cu.id = r."confirmedById"
    LEFT JOIN "users"      ru ON ru.id = r."rejectedById"
    LEFT JOIN "purchases"  p ON p.id = r."purchaseId"
    WHERE r.id = ${id}
  `;
  if (!rows[0]) return null;
  const r = rows[0];

  const items = await prisma.$queryRaw<any[]>`
    SELECT ri.id, ri."productId", ri."variantId", ri.description, ri.quantity, ri."unitPrice",
           ri."lotNumber", to_char(ri."expiresAt", 'YYYY-MM-DD') AS "expiresAt",
           ri."receivedQuantity", ri."receivedLotNumber",
           to_char(ri."receivedExpiresAt", 'YYYY-MM-DD') AS "receivedExpiresAt",
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
    confirmedBy: r.confirmedByName ? { id: r.confirmedById, name: r.confirmedByName } : null,
    rejectedBy:  r.rejectedByName  ? { id: r.rejectedById, name: r.rejectedByName } : null,
    items,
  };
}

/** Aviso push a los admins: hay una recepción de depósito para confirmar. */
function notifyPendingReception(companyId: string, requestedById: string, remitoId: string, number: string): void {
  void (async () => {
    const admins = await findUserIdsByRoles(companyId, CONFIRMER_ROLES, requestedById);
    if (!admins.length) return;
    const [who] = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM "users" WHERE id = ${requestedById}`;
    await sendPushToUsers(admins, {
      title: 'Recepción para confirmar',
      body: `${who?.name ?? 'Depósito'} cargó la recepción ${number}`,
      url: `/purchase-remitos/${remitoId}`,
      tag: `reception-${remitoId}`,
    });
  })().catch((err) => console.error('[PurchaseRemito] No se pudo avisar a los admins:', err));
}

// ── Controller ─────────────────────────────────────────────────────────────

export class PurchaseRemitoController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = querySchema.parse(req.query);
      const offset = (q.page - 1) * q.limit;

      // Parametrizada: ningún filtro se concatena al SQL.
      const conds: Prisma.Sql[] = [Prisma.sql`r."companyId" = ${req.companyId}`];
      if (q.supplierId)  conds.push(Prisma.sql`r."supplierId" = ${q.supplierId}`);
      if (q.warehouseId) conds.push(Prisma.sql`r."warehouseId" = ${q.warehouseId}`);
      if (q.status)      conds.push(Prisma.sql`r.status = ${q.status}`);
      const from = q.dateFrom ? startOfUtcDay(q.dateFrom) : undefined;
      const to   = q.dateTo ? endOfUtcDay(q.dateTo) : undefined;
      if (from) conds.push(Prisma.sql`r.date >= ${from}`);
      if (to)   conds.push(Prisma.sql`r.date <= ${to}`);
      if (q.search) {
        const term = `%${q.search}%`;
        conds.push(Prisma.sql`(r.number ILIKE ${term} OR s.name ILIKE ${term})`);
      }
      if (req.fiscalMode) conds.push(Prisma.sql`r."fiscalMode" = ${req.fiscalMode}`);
      const where = Prisma.join(conds, ' AND ');

      const [countRows, rows] = await Promise.all([
        prisma.$queryRaw<{ c: bigint }[]>`
          SELECT COUNT(*) AS c FROM "purchase_remitos" r
          LEFT JOIN "suppliers" s ON s.id = r."supplierId"
          WHERE ${where}
        `,
        prisma.$queryRaw<any[]>`
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
        `,
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
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      // Lo que carga depósito no mueve stock hasta que un admin lo confirma.
      const pending = NEEDS_CONFIRMATION_ROLES.includes(req.user!.role);

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
             ${pending ? 'PENDING_CONFIRMATION' : 'RECEIVED'}, ${data.notes ?? null}, ${req.companyId}, ${fiscalMode}, NOW())
        `;

        for (const item of data.items) {
          await tx.$executeRaw`
            INSERT INTO "purchase_remito_items"
              (id, "remitoId", "productId", "variantId", description, quantity, "unitPrice", "lotNumber", "expiresAt",
               "receivedQuantity", "receivedLotNumber", "receivedExpiresAt")
            VALUES
              (${randomUUID()}, ${id}, ${item.productId ?? null}, ${item.variantId ?? null},
               ${item.description}, ${item.quantity}, ${item.unitPrice},
               ${item.lotNumber || null}, ${item.expiresAt || null}::date,
               ${pending ? item.quantity : null}, ${pending ? item.lotNumber || null : null},
               ${pending ? item.expiresAt || null : null}::date)
          `;
        }

        // Mercadería entra al stock (recepción), salvo que quede para confirmar.
        //
        // Un fallo acá tiene que voltear el remito entero. Antes se atrapaba y
        // se mandaba a console.error: el remito quedaba creado y la mercadería
        // nunca entraba al depósito, en silencio y sin forma de enterarse.
        if (!pending) {
          await ingestStock(
            tx,
            { id, number, warehouseId: data.warehouseId },
            data.items.map((i) => ({
              productId: i.productId ?? null, variantId: i.variantId ?? null, quantity: i.quantity,
              lotNumber: i.lotNumber || null, expiresAt: i.expiresAt || null,
            })),
            req.user!.userId
          );
        }
      });

      await activityRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'PurchaseRemito',
        entityId: id,
        description: pending
          ? `Remito de compra ${number} cargado por depósito, pendiente de confirmación`
          : `Remito de compra ${number} recibido`,
      });

      if (pending) notifyPendingReception(req.companyId!, req.user!.userId, id, number);

      const remito = await fetchFull(id);
      res.status(201).json({ status: 'success', data: remito });
    } catch (error) { next(error); }
  }

  /**
   * El admin confirma una recepción cargada por depósito: aplica sus
   * correcciones, deja guardado lo que había cargado el depósito y recién ahí
   * entra el stock. Todo o nada.
   */
  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = confirmSchema.parse(req.body ?? {});
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const corrections = new Map((data.items ?? []).map((i) => [i.id, i]));
      let number = '';
      let requestedBy: string | null = null;
      let changed = 0;

      await prisma.$transaction(async (tx) => {
        // Bloquea el remito: dos admins confirmando a la vez no duplican el stock.
        const [remito] = await tx.$queryRaw<{ id: string; number: string; status: string; warehouseId: string; userId: string | null }[]>`
          SELECT id, number, status, "warehouseId", "userId" FROM "purchase_remitos"
          WHERE id = ${req.params.id} AND "companyId" = ${req.companyId}
          FOR UPDATE
        `;
        if (!remito) throw new NotFoundError('Remito de compra');
        if (remito.status !== 'PENDING_CONFIRMATION') {
          throw new AppError('Este remito no está pendiente de confirmación', 409);
        }
        number = remito.number;
        requestedBy = remito.userId;

        const items = await tx.$queryRaw<{ id: string; productId: string | null; variantId: string | null; quantity: unknown; lotNumber: string | null; expiresAt: string | null }[]>`
          SELECT id, "productId", "variantId", quantity, "lotNumber", to_char("expiresAt", 'YYYY-MM-DD') AS "expiresAt"
          FROM "purchase_remito_items" WHERE "remitoId" = ${remito.id}
        `;
        if ([...corrections.keys()].some((cid) => !items.some((i) => i.id === cid))) {
          throw new AppError('Una de las líneas corregidas no pertenece al remito', 400);
        }

        const finalLines = items.map((i) => {
          const c = corrections.get(i.id);
          const line = {
            id: i.id,
            productId: i.productId,
            variantId: i.variantId,
            quantity: c ? c.quantity : Number(i.quantity),
            lotNumber: c && c.lotNumber !== undefined ? c.lotNumber ?? null : i.lotNumber,
            expiresAt: c && c.expiresAt !== undefined ? c.expiresAt ?? null : i.expiresAt,
          };
          if (line.quantity !== Number(i.quantity) || line.lotNumber !== i.lotNumber || line.expiresAt !== i.expiresAt) changed++;
          return line;
        });
        if (!finalLines.some((l) => l.quantity > 0)) {
          throw new AppError('No se puede confirmar una recepción sin mercadería: rechazala', 400);
        }

        for (const l of finalLines) {
          await tx.$executeRaw`
            UPDATE "purchase_remito_items"
            SET quantity = ${l.quantity}, "lotNumber" = ${l.lotNumber}, "expiresAt" = ${l.expiresAt}::date
            WHERE id = ${l.id}
          `;
        }

        await ingestStock(tx, remito, finalLines, req.user!.userId);

        await tx.$executeRaw`
          UPDATE "purchase_remitos"
          SET status = 'RECEIVED', "confirmedById" = ${req.user!.userId}, "confirmedAt" = NOW(),
              notes = COALESCE(${data.notes ?? null}, notes), "updatedAt" = NOW()
          WHERE id = ${remito.id}
        `;
      });

      await activityRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'PurchaseRemito',
        entityId: req.params.id,
        description: `Recepción ${number} confirmada${changed ? ` con ${changed} línea(s) corregida(s)` : ''}`,
      });
      if (requestedBy && requestedBy !== req.user!.userId) {
        void sendPushToUsers([requestedBy], {
          title: 'Recepción confirmada',
          body: `${number}${changed ? ` — con ${changed} línea(s) corregida(s)` : ''}`,
          url: `/purchase-remitos/${req.params.id}`,
          tag: `reception-${req.params.id}`,
        });
      }

      res.json({ status: 'success', data: await fetchFull(req.params.id) });
    } catch (error) { next(error); }
  }

  /** El admin rechaza una recepción pendiente: no entra stock y queda el motivo. */
  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = rejectSchema.parse(req.body ?? {});
      const rows = await prisma.$queryRaw<{ id: string; number: string; userId: string | null }[]>`
        UPDATE "purchase_remitos"
        SET status = 'REJECTED', "rejectedById" = ${req.user!.userId}, "rejectedAt" = NOW(),
            "rejectionReason" = ${reason}, "updatedAt" = NOW()
        WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} AND status = 'PENDING_CONFIRMATION'
        RETURNING id, number, "userId"
      `;
      if (!rows[0]) {
        const remito = await fetchFull(req.params.id);
        if (!remito || remito.companyId !== req.companyId) throw new NotFoundError('Remito de compra');
        throw new AppError('Este remito no está pendiente de confirmación', 409);
      }
      const { number, userId } = rows[0];

      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'PurchaseRemito',
        entityId: req.params.id,
        description: `Recepción ${number} rechazada: ${reason}`,
      });
      if (userId && userId !== req.user!.userId) {
        void sendPushToUsers([userId], {
          title: 'Recepción rechazada',
          body: `${number}\nMotivo: ${reason}`,
          url: `/purchase-remitos/${req.params.id}`,
          tag: `reception-${req.params.id}`,
        });
      }

      res.json({ status: 'success', data: await fetchFull(req.params.id) });
    } catch (error) { next(error); }
  }

  /** Recepciones esperando confirmación (contador del menú y de la lista). */
  async pendingCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM "purchase_remitos"
        WHERE "companyId" = ${req.companyId} AND status = 'PENDING_CONFIRMATION'
      `;
      res.json({ status: 'success', data: { count: Number(rows[0]?.c ?? 0) } });
    } catch (error) { next(error); }
  }

  // Corrige el número del remito (ej. para que coincida con el remito físico
  // preimpreso del proveedor). No aplica a remitos cancelados.
  async updateNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remito = await fetchFull(req.params.id);
      if (!remito || remito.companyId !== req.companyId) throw new NotFoundError('Remito de compra');
      if (remito.status === 'CANCELLED' || remito.status === 'REJECTED') {
        throw new AppError('No se puede editar un remito cancelado o rechazado', 400);
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
