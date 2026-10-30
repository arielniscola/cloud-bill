import { Request } from 'express';
import { container } from 'tsyringe';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { ActivityAction } from '../../../domain/entities/ActivityLog';

/**
 * Registra una acción en el historial de actividad, sin esperar ni fallar: el
 * log nunca rompe la operación. Usuario y empresa salen del request.
 */
export function logActivity(
  req: Request,
  entry: { action: ActivityAction; entity: string; entityId: string; description: string; metadata?: Record<string, unknown> },
): void {
  const userId = req.user?.userId;
  if (!userId) return;
  container.resolve<IActivityLogRepository>('ActivityLogRepository')
    .create({ ...entry, userId, companyId: req.companyId ?? undefined })
    .catch(() => { /* log no crítico */ });
}

/**
 * Diferencias entre dos versiones de un registro, solo en los campos pedidos:
 * `{ campo: { from, to } }`. Compara por valor (Decimal/Date como string).
 * Es lo que muestra el historial de actividad como "antes → después".
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, { from: unknown; to: unknown }> {
  const norm = (v: unknown) => {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object' && 'toString' in (v as object)) return String(v);
    return v;
  };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    if (!(f in after) || after[f] === undefined) continue;
    const a = norm(before[f]);
    const b = norm(after[f]);
    const same = typeof a === 'number' || typeof b === 'number' || (!isNaN(Number(a)) && !isNaN(Number(b)) && a != null && b != null)
      ? Number(a) === Number(b)
      : a === b;
    if (!same) changes[f] = { from: a, to: b };
  }
  return changes;
}
