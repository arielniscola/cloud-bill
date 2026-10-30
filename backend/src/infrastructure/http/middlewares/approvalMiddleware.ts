import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { ConflictError } from '../../../shared/errors/AppError';
import { ApprovalAction, ApprovalEntityType } from '../../../shared/constants/approvalActions';
import { FiscalMode, JwtPayload } from '../../../shared/types';
import prisma from '../../database/prisma';
import { notifyApprovalRequested } from '../../services/ApprovalNotifier';

// Acciones protegidas (anular factura, remito, recibo, NC/ND, devolución, mov.
// de caja). Quien no es Dueño no las ejecuta: queda una solicitud PENDING con
// el request original, y cuando un Dueño la aprueba se re-ejecuta ese request
// contra los mismos handlers de la ruta. Así la lógica de cada anulación sigue
// viviendo en un solo lugar (su controller).

export interface ApprovalTarget {
  /** null = la ruta no está protegida en este caso (igual se respeta el bloqueo). */
  action: ApprovalAction | null;
  entityType: ApprovalEntityType;
  entityId: string;
  entityLabel: string | null;
}

/** Devuelve null si el documento no existe: el handler responde el 404. */
export type ApprovalResolver = (req: Request) => Promise<ApprovalTarget | null>;

interface StoredPayload {
  params: Record<string, string>;
  body: unknown;
  query: Record<string, unknown>;
  fiscalMode: FiscalMode | null;
}

const replayHandlers = new Map<string, RequestHandler[]>();

// ── Configuración por empresa ───────────────────────────────────────────────

const settingsCache = new Map<string, { disabled: string[]; expiresAt: number }>();
const SETTINGS_TTL_MS = 30_000;

export async function getDisabledActions(companyId: string): Promise<string[]> {
  const cached = settingsCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.disabled;

  const rows = await prisma.$queryRaw<{ disabledActions: string[] }[]>`
    SELECT "disabledActions" FROM "approval_settings" WHERE "companyId" = ${companyId} LIMIT 1
  `;
  const disabled = rows[0]?.disabledActions ?? [];
  settingsCache.set(companyId, { disabled, expiresAt: Date.now() + SETTINGS_TTL_MS });
  return disabled;
}

export function invalidateApprovalSettings(companyId: string): void {
  settingsCache.delete(companyId);
}

// ── Bloqueo mientras hay una solicitud abierta ──────────────────────────────

export async function findOpenRequest(companyId: string, entityType: string, entityId: string) {
  const rows = await prisma.$queryRaw<{ id: string; action: string; status: string }[]>`
    SELECT id, action, status FROM "approval_requests"
    WHERE "companyId" = ${companyId} AND "entityType" = ${entityType} AND "entityId" = ${entityId}
      AND status IN ('PENDING', 'EXECUTING')
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ── Empresas sin Dueño ──────────────────────────────────────────────────────
// Sin un Dueño activo no hay quién apruebe: el control queda apagado (la acción
// se ejecuta directo) y arranca solo cuando el SUPER_ADMIN asigna uno. Así subir
// esta función no deja a ninguna empresa sin poder anular.

export async function hasActiveOwner(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "users" WHERE "companyId" = ${companyId} AND role = 'OWNER' AND "isActive" = true
    ) AS ok
  `;
  return rows[0]?.ok === true;
}

/**
 * Si la empresa se quedó sin Dueño (se desactivó o cambió de rol el único),
 * sus solicitudes pendientes ya no las puede resolver nadie: se cierran como
 * rechazadas para que los comprobantes no queden bloqueados para siempre.
 */
async function releaseOrphanRequests(companyId: string): Promise<boolean> {
  if (await hasActiveOwner(companyId)) return false;
  await prisma.$executeRaw`
    UPDATE "approval_requests"
    SET status = 'REJECTED', "resolvedAt" = NOW(), "updatedAt" = NOW(),
        "resolutionComment" = 'Cerrada automáticamente: la empresa no tiene un Dueño activo que la apruebe.'
    WHERE "companyId" = ${companyId} AND status = 'PENDING'
  `;
  return true;
}

async function assertNoOpenRequest(companyId: string, entityType: string, entityId: string): Promise<void> {
  const open = await findOpenRequest(companyId, entityType, entityId);
  if (open?.status === 'PENDING' && (await releaseOrphanRequests(companyId))) return;
  if (open) {
    throw new ConflictError(
      'Este comprobante tiene una solicitud de aprobación pendiente. No se puede modificar hasta que el Dueño la resuelva.'
    );
  }
}

/** Para las demás mutaciones del documento (editar, emitir, entregar…). */
export function blockIfPendingApproval(entityType: ApprovalEntityType, param = 'id'): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertNoOpenRequest(req.companyId!, entityType, req.params[param]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// ── Gate ────────────────────────────────────────────────────────────────────

function readReason(req: Request): string {
  // Va en un header (URL-encoded por los acentos) para no tocar el body que
  // validan los handlers, y porque las rutas DELETE no llevan body.
  const raw = req.headers['x-approval-reason'];
  if (typeof raw !== 'string') return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

async function insertRequest(
  req: Request,
  routeKey: string,
  target: ApprovalTarget,
  status: 'PENDING' | 'APPROVED',
  reason: string
) {
  const payload: StoredPayload = {
    params: { ...req.params },
    body: req.body ?? {},
    query: { ...(req.query as Record<string, unknown>) },
    fiscalMode: req.fiscalMode ?? null,
  };
  const auto = status === 'APPROVED';
  const userId = req.user!.userId;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "approval_requests" (
      id, "companyId", action, "entityType", "entityId", "entityLabel", "routeKey", payload,
      reason, status, "autoApproved", "requestedById", "resolvedById", "resolvedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${req.companyId}, ${target.action}, ${target.entityType}, ${target.entityId},
      ${target.entityLabel}, ${routeKey}, ${JSON.stringify(payload)}::jsonb,
      ${reason || null}, ${status}, ${auto}, ${userId},
      ${auto ? userId : null}, ${auto ? new Date() : null}, NOW(), NOW()
    )
    RETURNING id
  `;
  return rows[0];
}

function approvalGate(routeKey: string, resolve: ApprovalResolver): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = await resolve(req);
      if (!target) return next();

      await assertNoOpenRequest(req.companyId!, target.entityType, target.entityId);

      if (!target.action) return next();
      const disabled = await getDisabledActions(req.companyId!);
      if (disabled.includes(target.action)) return next();
      if (req.user!.role !== 'OWNER' && !(await hasActiveOwner(req.companyId!))) return next();

      const reason = readReason(req);

      // El Dueño ejecuta directo, pero queda en el historial como autoaprobada.
      if (req.user!.role === 'OWNER') {
        res.on('finish', () => {
          if (res.statusCode >= 400) return;
          insertRequest(req, routeKey, target, 'APPROVED', reason).catch((err) =>
            console.error(`[Approvals] No se pudo registrar la acción ${target.action} del Dueño:`, err)
          );
        });
        return next();
      }

      if (!reason) {
        // 428: el cliente abre el modal de "Solicitar aprobación" y reintenta con el motivo.
        res.status(428).json({
          status: 'error',
          code: 'APPROVAL_REQUIRED',
          message: 'Esta acción requiere la aprobación del Dueño de la empresa.',
          data: { action: target.action, entityLabel: target.entityLabel },
        });
        return;
      }

      try {
        const created = await insertRequest(req, routeKey, target, 'PENDING', reason);
        notifyApprovalRequested({
          requestId: created.id,
          companyId: req.companyId!,
          requestedById: req.user!.userId,
          action: target.action,
          entityLabel: target.entityLabel,
          reason,
        });
        res.status(202).json({
          status: 'success',
          pendingApproval: true,
          message: 'Solicitud enviada. La acción se ejecutará cuando el Dueño la apruebe.',
          data: { id: created.id, action: target.action, entityLabel: target.entityLabel },
        });
      } catch (error) {
        // Dos pedidos simultáneos: el índice único parcial deja pasar uno solo.
        if (/approval_requests_one_open_per_entity|23505/.test(String(error))) {
          throw new ConflictError('Ya hay una solicitud de aprobación pendiente para este comprobante.');
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Envuelve los handlers de una ruta protegida. Los registra bajo `routeKey`
 * para poder re-ejecutarlos al aprobar la solicitud.
 *
 *   router.post('/:id/cancel', requireRoles(...), ...withApproval('invoices.cancel', resolver, ctrl.cancel));
 */
export function withApproval(
  routeKey: string,
  resolve: ApprovalResolver,
  ...handlers: RequestHandler[]
): RequestHandler[] {
  replayHandlers.set(routeKey, handlers);
  return [approvalGate(routeKey, resolve), ...handlers];
}

// ── Re-ejecución al aprobar ─────────────────────────────────────────────────

export interface ReplayResult {
  ok: boolean;
  statusCode: number;
  body: unknown;
  errorMessage?: string;
}

/**
 * Corre los handlers de la ruta con el request guardado, como si lo hubiera
 * mandado `executor` (el Dueño que aprueba). La respuesta se captura en vez de
 * enviarse.
 */
export function replayRequest(
  routeKey: string,
  rawPayload: unknown,
  executor: JwtPayload,
  companyId: string
): Promise<ReplayResult> {
  const handlers = replayHandlers.get(routeKey);
  if (!handlers) {
    return Promise.resolve({ ok: false, statusCode: 500, body: null, errorMessage: `Acción desconocida: ${routeKey}` });
  }
  const payload = rawPayload as StoredPayload;

  return new Promise<ReplayResult>((resolvePromise) => {
    let settled = false;
    const settle = (result: ReplayResult) => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };
    const fail = (error: unknown) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      const message = error instanceof Error ? error.message : String(error);
      settle({ ok: false, statusCode, body: null, errorMessage: message });
    };

    const req = {
      method: 'POST',
      params: { ...payload.params },
      body: payload.body ?? {},
      query: { ...payload.query },
      headers: {},
      user: executor,
      companyId,
      fiscalMode: payload.fiscalMode ?? undefined,
      get: () => undefined,
      header: () => undefined,
    } as unknown as Request;

    const captured = { statusCode: 200 };
    const finish = (body: unknown) => {
      const ok = captured.statusCode < 400;
      const message = (body as { message?: string } | null)?.message;
      settle({ ok, statusCode: captured.statusCode, body, errorMessage: ok ? undefined : message ?? 'Error al ejecutar la acción' });
    };
    const res = {
      locals: {},
      headersSent: false,
      get statusCode() { return captured.statusCode; },
      status(code: number) { captured.statusCode = code; return res; },
      json(body: unknown) { finish(body); return res; },
      send(body?: unknown) { finish(body ?? null); return res; },
      end() { finish(null); return res; },
      setHeader() { return res; },
      set() { return res; },
      on() { return res; },
    } as unknown as Response;

    let index = 0;
    const runNext = (error?: unknown): void => {
      if (error) return fail(error);
      const handler = handlers[index++];
      if (!handler) return fail(new Error('La acción no devolvió respuesta'));
      try {
        const out = handler(req, res, runNext) as unknown;
        if (out && typeof (out as Promise<unknown>).then === 'function') {
          (out as Promise<unknown>).catch(fail);
        }
      } catch (err) {
        fail(err);
      }
    };
    runNext();
  });
}
