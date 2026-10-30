import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { container } from 'tsyringe';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { AppError, ConflictError, NotFoundError } from '../../../shared/errors/AppError';
import { APPROVAL_ACTIONS, APPROVAL_ACTION_LABELS } from '../../../shared/constants/approvalActions';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import {
  findOpenRequest,
  getDisabledActions,
  invalidateApprovalSettings,
  replayRequest,
} from '../middlewares/approvalMiddleware';
import { notifyApprovalResolved } from '../../services/ApprovalNotifier';

const resolveSchema = z.object({ comment: z.string().trim().max(500).optional() });

const openForEntitiesSchema = z.object({
  entityType: z.enum(['INVOICE', 'REMITO', 'PURCHASE_REMITO', 'RECIBO', 'CASH_MOVEMENT']),
  ids: z.string().max(20_000),
});

const updateSettingsSchema = z.object({
  disabledActions: z.array(z.enum(APPROVAL_ACTIONS)),
});

interface ApprovalRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  routeKey: string;
  payload: unknown;
  reason: string | null;
  status: string;
  autoApproved: boolean;
  requestedById: string | null;
  requestedByName: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  resolutionComment: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

const SELECT_ROWS = Prisma.sql`
  SELECT a.id, a.action, a."entityType", a."entityId", a."entityLabel", a."routeKey", a.payload,
         a.reason, a.status, a."autoApproved", a."requestedById", rq.name AS "requestedByName",
         a."resolvedById", rs.name AS "resolvedByName", a."resolvedAt", a."resolutionComment",
         a."errorMessage", a."createdAt"
  FROM "approval_requests" a
  LEFT JOIN "users" rq ON rq.id = a."requestedById"
  LEFT JOIN "users" rs ON rs.id = a."resolvedById"
`;

// El payload es el request original: el cliente no lo necesita, salvo la caja
// de un movimiento de caja (para armar el link al detalle).
function toDto({ payload, routeKey: _routeKey, ...row }: ApprovalRow) {
  const params = (payload as { params?: Record<string, string> } | null)?.params ?? {};
  return {
    ...row,
    actionLabel: APPROVAL_ACTION_LABELS[row.action as keyof typeof APPROVAL_ACTION_LABELS] ?? row.action,
    cashRegisterId: row.entityType === 'CASH_MOVEMENT' ? params.id ?? null : null,
  };
}

async function findRow(id: string, companyId: string): Promise<ApprovalRow | null> {
  const rows = await prisma.$queryRaw<ApprovalRow[]>`${SELECT_ROWS} WHERE a.id = ${id} AND a."companyId" = ${companyId} LIMIT 1`;
  return rows[0] ?? null;
}

export class ApprovalController {
  /** El Dueño ve las de toda la empresa; el resto, solo las que pidió. */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conds: Prisma.Sql[] = [Prisma.sql`a."companyId" = ${req.companyId}`];
      if (req.user!.role !== 'OWNER') conds.push(Prisma.sql`a."requestedById" = ${req.user!.userId}`);

      const status = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
      if (status !== 'ALL') conds.push(Prisma.sql`a.status = ${status}`);

      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const rows = await prisma.$queryRaw<ApprovalRow[]>`
        ${SELECT_ROWS} WHERE ${Prisma.join(conds, ' AND ')}
        ORDER BY a."createdAt" DESC LIMIT ${limit}
      `;
      res.json({ status: 'success', data: rows.map(toDto) });
    } catch (error) {
      next(error);
    }
  }

  /** Para el badge de la barra: pendientes a resolver (Dueño) o propias (resto). */
  async pendingCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mine = req.user!.role !== 'OWNER';
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "approval_requests"
        WHERE "companyId" = ${req.companyId} AND status = 'PENDING'
          ${mine ? Prisma.sql`AND "requestedById" = ${req.user!.userId}` : Prisma.empty}
      `;
      res.json({ status: 'success', data: { count: Number(rows[0]?.count ?? 0) } });
    } catch (error) {
      next(error);
    }
  }

  /** Solicitud abierta de un documento (para el aviso en su detalle). */
  async findOpenForEntity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const open = await findOpenRequest(req.companyId!, req.params.entityType, req.params.entityId);
      const row = open ? await findRow(open.id, req.companyId!) : null;
      res.json({ status: 'success', data: row ? toDto(row) : null });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Solicitudes abiertas de varios documentos de un tipo, para marcar las filas
   * de un listado (p. ej. los movimientos de una caja). Las de cualquier
   * usuario: el documento queda bloqueado lo haya pedido quien lo haya pedido.
   */
  async findOpenForEntities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entityType, ids } = openForEntitiesSchema.parse(req.query);
      const entityIds = ids.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500);
      if (!entityIds.length) {
        res.json({ status: 'success', data: [] });
        return;
      }
      const rows = await prisma.$queryRaw<ApprovalRow[]>`
        ${SELECT_ROWS}
        WHERE a."companyId" = ${req.companyId} AND a."entityType" = ${entityType}
          AND a."entityId" = ANY(${entityIds}::text[]) AND a.status IN ('PENDING', 'EXECUTING')
      `;
      res.json({ status: 'success', data: rows.map(toDto) });
    } catch (error) {
      next(error);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { comment } = resolveSchema.parse(req.body ?? {});
      const companyId = req.companyId!;

      // Tomar la solicitud de forma atómica: dos Dueños aprobando a la vez no
      // pueden ejecutar la acción dos veces.
      const claimed = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "approval_requests"
        SET status = 'EXECUTING', "resolvedById" = ${req.user!.userId}, "updatedAt" = NOW()
        WHERE id = ${req.params.id} AND "companyId" = ${companyId} AND status = 'PENDING'
        RETURNING id
      `;
      if (!claimed[0]) {
        const existing = await findRow(req.params.id, companyId);
        if (!existing) throw new NotFoundError('Solicitud');
        throw new ConflictError('La solicitud ya fue resuelta.');
      }

      const row = (await findRow(req.params.id, companyId))!;
      const result = await replayRequest(row.routeKey, row.payload, req.user!, companyId);

      await prisma.$executeRaw`
        UPDATE "approval_requests"
        SET status = ${result.ok ? 'APPROVED' : 'FAILED'}, "resolvedAt" = NOW(),
            "resolutionComment" = ${comment || null}, "errorMessage" = ${result.ok ? null : result.errorMessage ?? null},
            "updatedAt" = NOW()
        WHERE id = ${row.id}
      `;

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'ApprovalRequest',
        entityId: row.id,
        description: result.ok
          ? `Aprobó: ${toDto(row).actionLabel} — ${row.entityLabel ?? ''}`
          : `Aprobó pero falló: ${toDto(row).actionLabel} — ${row.entityLabel ?? ''} (${result.errorMessage})`,
      });

      notifyApprovalResolved({
        requestId: row.id,
        requestedById: row.requestedById,
        resolvedById: req.user!.userId,
        action: row.action,
        entityLabel: row.entityLabel,
        status: result.ok ? 'APPROVED' : 'FAILED',
        comment,
        errorMessage: result.errorMessage,
      });

      const updated = (await findRow(row.id, companyId))!;
      res.json({ status: 'success', data: toDto(updated) });
    } catch (error) {
      next(error);
    }
  }

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { comment } = resolveSchema.parse(req.body ?? {});
      const companyId = req.companyId!;
      const updated = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "approval_requests"
        SET status = 'REJECTED', "resolvedById" = ${req.user!.userId}, "resolvedAt" = NOW(),
            "resolutionComment" = ${comment || null}, "updatedAt" = NOW()
        WHERE id = ${req.params.id} AND "companyId" = ${companyId} AND status = 'PENDING'
        RETURNING id
      `;
      if (!updated[0]) {
        const existing = await findRow(req.params.id, companyId);
        if (!existing) throw new NotFoundError('Solicitud');
        throw new ConflictError('La solicitud ya fue resuelta.');
      }
      const row = (await findRow(req.params.id, companyId))!;

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'ApprovalRequest',
        entityId: row.id,
        description: `Rechazó: ${toDto(row).actionLabel} — ${row.entityLabel ?? ''}`,
      });

      notifyApprovalResolved({
        requestId: row.id,
        requestedById: row.requestedById,
        resolvedById: req.user!.userId,
        action: row.action,
        entityLabel: row.entityLabel,
        status: 'REJECTED',
        comment,
      });

      res.json({ status: 'success', data: toDto(row) });
    } catch (error) {
      next(error);
    }
  }

  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const disabled = await getDisabledActions(req.companyId!);
      res.json({
        status: 'success',
        data: APPROVAL_ACTIONS.map((key) => ({ key, label: APPROVAL_ACTION_LABELS[key], enabled: !disabled.includes(key) })),
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { disabledActions } = updateSettingsSchema.parse(req.body);
      if (!req.companyId) throw new AppError('Sin empresa activa', 400);
      await prisma.$executeRaw`
        INSERT INTO "approval_settings" ("companyId", "disabledActions", "updatedAt")
        VALUES (${req.companyId}, ${disabledActions}::text[], NOW())
        ON CONFLICT ("companyId") DO UPDATE SET "disabledActions" = EXCLUDED."disabledActions", "updatedAt" = NOW()
      `;
      invalidateApprovalSettings(req.companyId);
      await this.getSettings(req, res, next);
    } catch (error) {
      next(error);
    }
  }
}
