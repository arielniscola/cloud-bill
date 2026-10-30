import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { container } from 'tsyringe';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { ConflictError, NotFoundError } from '../../../shared/errors/AppError';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';

// Motivos de retiros / ingresos de caja (Combustible, Viáticos…), por empresa.

const tidyName = (s: string): string => s.trim().replace(/\s+/g, ' ');

const createSchema = z.object({
  name: z.string().transform(tidyName).pipe(z.string().min(2, 'Ingresá el nombre').max(80)),
  type: z.enum(['OUT', 'IN', 'BOTH']).default('OUT'),
});
const updateSchema = z.object({
  name: z.string().transform(tidyName).pipe(z.string().min(2).max(80)).optional(),
  type: z.enum(['OUT', 'IN', 'BOTH']).optional(),
  isActive: z.boolean().optional(),
});

export interface CashMovementReasonRow {
  id: string;
  name: string;
  type: 'OUT' | 'IN' | 'BOTH';
  isActive: boolean;
  usageCount: number;
}

async function findOne(id: string, companyId: string): Promise<CashMovementReasonRow | null> {
  const rows = await prisma.$queryRaw<CashMovementReasonRow[]>`
    SELECT r.id, r.name, r.type, r."isActive",
           (SELECT COUNT(*)::int FROM "cash_movements" cm WHERE cm."reasonId" = r.id) AS "usageCount"
    FROM "cash_movement_reasons" r
    WHERE r.id = ${id} AND r."companyId" = ${companyId}
  `;
  return rows[0] ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return /cash_movement_reasons_company_name_key|23505/.test(String(error));
}

/**
 * Valida el motivo elegido al registrar un movimiento: de la empresa, activo y
 * del sentido correcto. Devuelve el nombre, que se guarda copiado en el movimiento.
 */
export async function resolveCashMovementReason(
  reasonId: string | null | undefined,
  companyId: string,
  type: 'IN' | 'OUT'
): Promise<{ id: string; name: string } | null> {
  if (!reasonId) return null;
  const reason = await findOne(reasonId, companyId);
  if (!reason) throw new NotFoundError('Motivo');
  if (!reason.isActive) throw new ConflictError(`El motivo "${reason.name}" está desactivado`);
  if (reason.type !== 'BOTH' && reason.type !== type) {
    throw new ConflictError(`El motivo "${reason.name}" es para ${reason.type === 'OUT' ? 'retiros' : 'ingresos'}`);
  }
  return { id: reason.id, name: reason.name };
}

export class CashMovementReasonController {
  /** `?all=true` incluye los desactivados (pantalla de configuración). */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const all = req.query.all === 'true';
      const rows = await prisma.$queryRaw<CashMovementReasonRow[]>`
        SELECT r.id, r.name, r.type, r."isActive",
               (SELECT COUNT(*)::int FROM "cash_movements" cm WHERE cm."reasonId" = r.id) AS "usageCount"
        FROM "cash_movement_reasons" r
        WHERE r."companyId" = ${req.companyId} AND (${all} OR r."isActive" = true)
        ORDER BY r."isActive" DESC, lower(r.name)
      `;
      res.json({ status: 'success', data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const id = randomUUID();
      try {
        await prisma.$executeRaw`
          INSERT INTO "cash_movement_reasons" (id, "companyId", name, type, "isActive", "createdAt", "updatedAt")
          VALUES (${id}, ${req.companyId}, ${data.name}, ${data.type}, true, NOW(), NOW())
        `;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(`Ya existe el motivo "${data.name}"`);
        throw error;
      }
      this.log(req, 'CREATE', id, `Motivo de caja "${data.name}" creado`);
      res.status(201).json({ status: 'success', data: await findOne(id, req.companyId!) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await findOne(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Motivo');
      const data = updateSchema.parse(req.body);
      try {
        await prisma.$executeRaw`
          UPDATE "cash_movement_reasons"
          SET name = ${data.name ?? existing.name}, type = ${data.type ?? existing.type},
              "isActive" = ${data.isActive ?? existing.isActive}, "updatedAt" = NOW()
          WHERE id = ${existing.id}
        `;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(`Ya existe el motivo "${data.name}"`);
        throw error;
      }
      this.log(req, 'UPDATE', existing.id, `Motivo de caja "${data.name ?? existing.name}" actualizado`);
      res.json({ status: 'success', data: await findOne(existing.id, req.companyId!) });
    } catch (error) {
      next(error);
    }
  }

  /** Si ya se usó, se desactiva (los movimientos lo siguen mostrando); si no, se borra. */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await findOne(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Motivo');
      if (existing.usageCount > 0) {
        await prisma.$executeRaw`UPDATE "cash_movement_reasons" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${existing.id}`;
        this.log(req, 'UPDATE', existing.id, `Motivo de caja "${existing.name}" desactivado`);
        res.json({ status: 'success', data: { deleted: false, deactivated: true } });
        return;
      }
      await prisma.$executeRaw`DELETE FROM "cash_movement_reasons" WHERE id = ${existing.id}`;
      this.log(req, 'DELETE', existing.id, `Motivo de caja "${existing.name}" eliminado`);
      res.json({ status: 'success', data: { deleted: true, deactivated: false } });
    } catch (error) {
      next(error);
    }
  }

  private log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    void activityLogRepo
      .create({ userId: req.user!.userId, action, entity: 'CashMovementReason', entityId, description })
      .catch(() => { /* el log no frena la operación */ });
  }
}
