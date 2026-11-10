import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { container } from 'tsyringe';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { AppError, ConflictError, NotFoundError } from '../../../shared/errors/AppError';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';

/**
 * Egreso de cheques en cartera: el cheque sale de la cartera por un motivo
 * parametrizable (cambio por efectivo, entrega a terceros, extravío…) y queda
 * constancia de quién lo egresó y cuándo. Cubre los dos orígenes de cartera:
 * cheques cargados en "Cheques" (INGRESO) y cheques recibidos en cobranzas
 * (recibos con checkStatus). Ambos pasan a estado EGRESADO; anular el egreso
 * los devuelve a cartera.
 */

const tidyName = (s: string): string => s.trim().replace(/\s+/g, ' ');

const DEFAULT_REASONS = ['Cambio por efectivo', 'Entrega a terceros', 'Devolución al librador', 'Extravío / robo'];

const reasonCreateSchema = z.object({
  name: z.string().transform(tidyName).pipe(z.string().min(2, 'Ingresá el nombre').max(80)),
});
const reasonUpdateSchema = z.object({
  name: z.string().transform(tidyName).pipe(z.string().min(2).max(80)).optional(),
  isActive: z.boolean().optional(),
});

const today = (): string => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // día argentino

const egresoSchema = z.object({
  source: z.enum(['CHEQUE', 'RECIBO']),
  id: z.string().min(1),
  reasonId: z.string().min(1, 'Elegí el motivo del egreso'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional().nullable(),
});

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  search: z.string().trim().max(100).optional(),
  reasonId: z.string().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export interface ChequeEgresoReasonRow {
  id: string;
  name: string;
  isActive: boolean;
  usageCount: number;
}

/** Cheque en cartera, normalizado para los dos orígenes. */
export interface CarteraChequeRow {
  source: 'CHEQUE' | 'RECIBO';
  id: string;
  number: string;          // N° interno (CHQ-…) o N° de recibo
  checkNumber: string | null;
  bank: string | null;
  amount: string;
  currency: string;
  dueDate: Date | null;
  holder: string | null;   // librador / cliente
  createdAt: Date;
}

async function findReason(id: string, companyId: string): Promise<ChequeEgresoReasonRow | null> {
  const rows = await prisma.$queryRaw<ChequeEgresoReasonRow[]>`
    SELECT r.id, r.name, r."isActive",
           (SELECT COUNT(*)::int FROM "cheque_egresos" e WHERE e."reasonId" = r.id) AS "usageCount"
    FROM "cheque_egreso_reasons" r
    WHERE r.id = ${id} AND r."companyId" = ${companyId}
  `;
  return rows[0] ?? null;
}

/** La primera vez que una empresa entra, le carga los motivos más comunes. */
async function seedDefaultReasons(companyId: string): Promise<void> {
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "cheque_egreso_reasons" WHERE "companyId" = ${companyId}
  `;
  if (count > 0) return;
  for (const name of DEFAULT_REASONS) {
    await prisma.$executeRaw`
      INSERT INTO "cheque_egreso_reasons" (id, "companyId", name, "isActive", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${companyId}, ${name}, true, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
  }
}

const isUniqueViolation = (error: unknown): boolean =>
  /cheque_egreso_reasons_company_name_key|23505/.test(String(error));

function log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entity: string, entityId: string, description: string): void {
  const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
  void activityLogRepo
    .create({ userId: req.user!.userId, action, entity, entityId, description })
    .catch(() => { /* el log no frena la operación */ });
}

const fiscalFilter = (alias: string, fiscalMode: string | undefined): Prisma.Sql =>
  fiscalMode ? Prisma.sql`AND ${Prisma.raw(alias)}."fiscalMode" = ${fiscalMode}` : Prisma.empty;

export class ChequeEgresoController {
  // ── Motivos ────────────────────────────────────────────────────

  /** `?all=true` incluye los desactivados (pantalla de configuración). */
  findReasons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await seedDefaultReasons(req.companyId!);
      const all = req.query.all === 'true';
      const rows = await prisma.$queryRaw<ChequeEgresoReasonRow[]>`
        SELECT r.id, r.name, r."isActive",
               (SELECT COUNT(*)::int FROM "cheque_egresos" e WHERE e."reasonId" = r.id) AS "usageCount"
        FROM "cheque_egreso_reasons" r
        WHERE r."companyId" = ${req.companyId} AND (${all} OR r."isActive" = true)
        ORDER BY r."isActive" DESC, lower(r.name)
      `;
      res.json({ status: 'success', data: rows });
    } catch (error) { next(error); }
  };

  createReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = reasonCreateSchema.parse(req.body);
      const id = randomUUID();
      try {
        await prisma.$executeRaw`
          INSERT INTO "cheque_egreso_reasons" (id, "companyId", name, "isActive", "createdAt", "updatedAt")
          VALUES (${id}, ${req.companyId}, ${data.name}, true, NOW(), NOW())
        `;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(`Ya existe el motivo "${data.name}"`);
        throw error;
      }
      log(req, 'CREATE', 'ChequeEgresoReason', id, `Motivo de egreso de cheques "${data.name}" creado`);
      res.status(201).json({ status: 'success', data: await findReason(id, req.companyId!) });
    } catch (error) { next(error); }
  };

  updateReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await findReason(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Motivo');
      const data = reasonUpdateSchema.parse(req.body);
      try {
        await prisma.$executeRaw`
          UPDATE "cheque_egreso_reasons"
          SET name = ${data.name ?? existing.name}, "isActive" = ${data.isActive ?? existing.isActive}, "updatedAt" = NOW()
          WHERE id = ${existing.id}
        `;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(`Ya existe el motivo "${data.name}"`);
        throw error;
      }
      log(req, 'UPDATE', 'ChequeEgresoReason', existing.id, `Motivo de egreso de cheques "${data.name ?? existing.name}" actualizado`);
      res.json({ status: 'success', data: await findReason(existing.id, req.companyId!) });
    } catch (error) { next(error); }
  };

  /** Si ya se usó, se desactiva (los egresos lo siguen mostrando); si no, se borra. */
  deleteReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await findReason(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Motivo');
      if (existing.usageCount > 0) {
        await prisma.$executeRaw`UPDATE "cheque_egreso_reasons" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${existing.id}`;
        log(req, 'UPDATE', 'ChequeEgresoReason', existing.id, `Motivo de egreso de cheques "${existing.name}" desactivado`);
        res.json({ status: 'success', data: { deleted: false, deactivated: true } });
        return;
      }
      await prisma.$executeRaw`DELETE FROM "cheque_egreso_reasons" WHERE id = ${existing.id}`;
      log(req, 'DELETE', 'ChequeEgresoReason', existing.id, `Motivo de egreso de cheques "${existing.name}" eliminado`);
      res.json({ status: 'success', data: { deleted: true, deactivated: false } });
    } catch (error) { next(error); }
  };

  // ── Cartera ────────────────────────────────────────────────────

  /** Cheques en cartera (manuales + de cobranzas), con búsqueda por N°, banco, librador o monto. */
  cartera = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
      const like = `%${search}%`;
      const digits = search.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
      const amount = digits && !Number.isNaN(Number(digits)) ? Number(digits) : null;
      const companyId = req.companyId!;
      const fm = req.fiscalMode as string | undefined;

      const rows = await prisma.$queryRaw<CarteraChequeRow[]>`
        SELECT * FROM (
          SELECT 'CHEQUE' AS source, c.id, c.number, c."checkNumber", c.bank, c.amount::text AS amount, c.currency,
                 c."dueDate", COALESCE(NULLIF(c.issuer, ''), cu.name) AS holder, c."createdAt"
          FROM "cheques" c
          LEFT JOIN "customers" cu ON cu.id = c."customerId"
          WHERE c."companyId" = ${companyId} AND c.type = 'INGRESO' AND c.status = 'PENDING'
            ${fiscalFilter('c', fm)}
            AND (${search} = '' OR c.number ILIKE ${like} OR c."checkNumber" ILIKE ${like} OR c.bank ILIKE ${like}
                 OR c.issuer ILIKE ${like} OR cu.name ILIKE ${like} OR (${amount}::numeric IS NOT NULL AND c.amount = ${amount}::numeric))
          UNION ALL
          SELECT 'RECIBO' AS source, r.id, r.number, r.reference AS "checkNumber", r.bank, r.amount::text AS amount, r.currency,
                 r."checkDueDate" AS "dueDate", cu.name AS holder, r."createdAt"
          FROM "recibos" r
          JOIN "customers" cu ON cu.id = r."customerId"
          WHERE r."companyId" = ${companyId} AND r."paymentMethod" = 'CHECK' AND r.status = 'EMITTED' AND r."checkStatus" = 'PENDING'
            ${fiscalFilter('r', fm)}
            AND (${search} = '' OR r.number ILIKE ${like} OR r.reference ILIKE ${like} OR r.bank ILIKE ${like}
                 OR cu.name ILIKE ${like} OR (${amount}::numeric IS NOT NULL AND r.amount = ${amount}::numeric))
        ) t
        ORDER BY t."dueDate" ASC NULLS LAST, t."createdAt" DESC
        LIMIT 50
      `;
      res.json({ status: 'success', data: rows });
    } catch (error) { next(error); }
  };

  // ── Egresos ────────────────────────────────────────────────────

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = listSchema.parse(req.query);
      const like = `%${q.search ?? ''}%`;
      const where = Prisma.sql`
        e."companyId" = ${req.companyId}
        ${fiscalFilter('e', req.fiscalMode as string | undefined)}
        ${q.reasonId ? Prisma.sql`AND e."reasonId" = ${q.reasonId}` : Prisma.empty}
        ${q.status ? Prisma.sql`AND e.status = ${q.status}` : Prisma.empty}
        ${q.dateFrom ? Prisma.sql`AND e.date >= ${q.dateFrom}::date` : Prisma.empty}
        ${q.dateTo ? Prisma.sql`AND e.date <= ${q.dateTo}::date` : Prisma.empty}
        ${q.search ? Prisma.sql`AND (e."checkNumber" ILIKE ${like} OR e.bank ILIKE ${like} OR e.holder ILIKE ${like}
                                     OR e."reasonName" ILIKE ${like} OR e.notes ILIKE ${like} OR u.name ILIKE ${like})` : Prisma.empty}
      `;
      const [rows, [{ total }]] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT e.id, e.source, e."chequeId", e."reciboId", e."checkNumber", e.bank, e.amount::float AS amount, e.currency,
                 e."dueDate", e.holder, e."reasonId", e."reasonName", e.notes, to_char(e.date, 'YYYY-MM-DD') AS date,
                 e.status, e."createdAt", e."cancelledAt", e."cancelReason",
                 json_build_object('id', u.id, 'name', u.name) AS "user",
                 CASE WHEN cu.id IS NULL THEN NULL ELSE json_build_object('id', cu.id, 'name', cu.name) END AS "cancelledBy",
                 COALESCE(c.number, r.number) AS "sourceNumber"
          FROM "cheque_egresos" e
          JOIN "users" u ON u.id = e."userId"
          LEFT JOIN "users" cu ON cu.id = e."cancelledById"
          LEFT JOIN "cheques" c ON c.id = e."chequeId"
          LEFT JOIN "recibos" r ON r.id = e."reciboId"
          WHERE ${where}
          ORDER BY e.date DESC, e."createdAt" DESC
          LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}
        `,
        prisma.$queryRaw<{ total: number }[]>`
          SELECT COUNT(*)::int AS total FROM "cheque_egresos" e JOIN "users" u ON u.id = e."userId" WHERE ${where}
        `,
      ]);
      res.json({ status: 'success', data: rows, total, page: q.page, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
    } catch (error) { next(error); }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = egresoSchema.parse(req.body);
      const companyId = req.companyId!;
      const date = data.date ?? today();
      if (date > today()) throw new AppError('La fecha del egreso no puede ser futura', 400);

      const reason = await findReason(data.reasonId, companyId);
      if (!reason) throw new NotFoundError('Motivo');
      if (!reason.isActive) throw new ConflictError(`El motivo "${reason.name}" está desactivado`);

      const egresoId = randomUUID();
      let label = '';
      await prisma.$transaction(async (tx) => {
        // Bloquea el cheque: dos egresos (o un egreso y un endoso) simultáneos
        // no pueden sacar el mismo cheque de la cartera.
        let snap: { checkNumber: string | null; bank: string | null; amount: string; currency: string; dueDate: Date | null; holder: string | null; fiscalMode: string; number: string };
        if (data.source === 'CHEQUE') {
          const rows = await tx.$queryRaw<any[]>`
            SELECT c.number, c."checkNumber", c.bank, c.amount::text AS amount, c.currency, c."dueDate", c.status, c.type,
                   c."fiscalMode", COALESCE(NULLIF(c.issuer, ''), cu.name) AS holder
            FROM "cheques" c LEFT JOIN "customers" cu ON cu.id = c."customerId"
            WHERE c.id = ${data.id} AND c."companyId" = ${companyId}
            FOR UPDATE OF c
          `;
          const c = rows[0];
          if (!c) throw new NotFoundError('Cheque');
          if (c.type !== 'INGRESO' || c.status !== 'PENDING') throw new ConflictError('El cheque ya no está en cartera');
          snap = c;
          await tx.$executeRaw`UPDATE "cheques" SET status = 'EGRESADO', "updatedAt" = NOW() WHERE id = ${data.id}`;
        } else {
          const rows = await tx.$queryRaw<any[]>`
            SELECT r.number, r.reference AS "checkNumber", r.bank, r.amount::text AS amount, r.currency, r."checkDueDate" AS "dueDate",
                   r."checkStatus", r.status, r."paymentMethod", r."fiscalMode", cu.name AS holder
            FROM "recibos" r JOIN "customers" cu ON cu.id = r."customerId"
            WHERE r.id = ${data.id} AND r."companyId" = ${companyId}
            FOR UPDATE OF r
          `;
          const r = rows[0];
          if (!r || r.paymentMethod !== 'CHECK') throw new NotFoundError('Cheque');
          if (r.status !== 'EMITTED' || r.checkStatus !== 'PENDING') throw new ConflictError('El cheque ya no está en cartera');
          snap = r;
          await tx.$executeRaw`UPDATE "recibos" SET "checkStatus" = 'EGRESADO', "updatedAt" = NOW() WHERE id = ${data.id}`;
        }
        label = snap.checkNumber || snap.number;

        await tx.$executeRaw`
          INSERT INTO "cheque_egresos" (
            id, "companyId", source, "chequeId", "reciboId", "checkNumber", bank, amount, currency, "dueDate", holder,
            "reasonId", "reasonName", notes, date, "userId", "fiscalMode", status, "createdAt"
          ) VALUES (
            ${egresoId}, ${companyId}, ${data.source},
            ${data.source === 'CHEQUE' ? data.id : null}, ${data.source === 'RECIBO' ? data.id : null},
            ${snap.checkNumber}, ${snap.bank}, ${snap.amount}::numeric, ${snap.currency}, ${snap.dueDate}, ${snap.holder},
            ${reason.id}, ${reason.name}, ${data.notes || null}, ${date}::date, ${req.user!.userId}, ${snap.fiscalMode ?? 'FORMAL'},
            'ACTIVE', NOW()
          )
        `;
      });

      log(req, 'UPDATE', data.source === 'CHEQUE' ? 'Cheque' : 'Recibo', data.id, `Cheque ${label} egresado de cartera — ${reason.name}`);
      res.status(201).json({ status: 'success', data: await this.findOne(egresoId, companyId) });
    } catch (error) { next(error); }
  };

  /** Anula el egreso y el cheque vuelve a cartera (si no se movió después). */
  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = cancelSchema.parse(req.body ?? {});
      const companyId = req.companyId!;
      let label = '';
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<any[]>`
          SELECT id, source, "chequeId", "reciboId", status, "checkNumber"
          FROM "cheque_egresos" WHERE id = ${req.params.id} AND "companyId" = ${companyId}
          FOR UPDATE
        `;
        const e = rows[0];
        if (!e) throw new NotFoundError('Egreso');
        if (e.status !== 'ACTIVE') throw new ConflictError('El egreso ya está anulado');
        label = e.checkNumber ?? '';

        const back = e.source === 'CHEQUE'
          ? await tx.$executeRaw`UPDATE "cheques" SET status = 'PENDING', "updatedAt" = NOW() WHERE id = ${e.chequeId} AND status = 'EGRESADO'`
          : await tx.$executeRaw`UPDATE "recibos" SET "checkStatus" = 'PENDING', "updatedAt" = NOW() WHERE id = ${e.reciboId} AND "checkStatus" = 'EGRESADO'`;
        if (back === 0) throw new ConflictError('El cheque cambió de estado después del egreso: no se puede devolver a cartera');

        await tx.$executeRaw`
          UPDATE "cheque_egresos"
          SET status = 'CANCELLED', "cancelledAt" = NOW(), "cancelledById" = ${req.user!.userId}, "cancelReason" = ${reason || null}
          WHERE id = ${e.id}
        `;
      });
      log(req, 'UPDATE', 'ChequeEgreso', req.params.id, `Egreso del cheque ${label} anulado — vuelve a cartera`);
      res.json({ status: 'success', data: await this.findOne(req.params.id, companyId) });
    } catch (error) { next(error); }
  };

  private async findOne(id: string, companyId: string): Promise<any> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT e.id, e.source, e."chequeId", e."reciboId", e."checkNumber", e.bank, e.amount::float AS amount, e.currency,
             e."dueDate", e.holder, e."reasonId", e."reasonName", e.notes, to_char(e.date, 'YYYY-MM-DD') AS date,
             e.status, e."createdAt", e."cancelledAt", e."cancelReason",
             json_build_object('id', u.id, 'name', u.name) AS "user"
      FROM "cheque_egresos" e JOIN "users" u ON u.id = e."userId"
      WHERE e.id = ${id} AND e."companyId" = ${companyId}
    `;
    return rows[0] ?? null;
  }
}
