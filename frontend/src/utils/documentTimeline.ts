import type { TimelineEvent, TimelineTone } from '../components/shared/DocumentTimeline';
import type { ActivityAction, ActivityLog } from '../types';

const TONE: Partial<Record<ActivityAction, TimelineTone>> = {
  PAYMENT: 'success',
  CANCEL:  'danger',
  DELETE:  'danger',
};

/** "Total: 121 → 242 · Notas: — → corregida", de `metadata.changes`. */
function describeChanges(metadata: ActivityLog['metadata']): string | undefined {
  const changes = metadata?.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (!changes) return undefined;
  const parts = Object.entries(changes).map(([f, c]) => `${f}: ${c.from ?? '—'} → ${c.to ?? '—'}`);
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * Eventos de la línea de tiempo a partir del historial de actividad del
 * documento: cada registro con su usuario y la hora exacta. `title` permite
 * renombrar o descartar (devolviendo null) registros puntuales.
 */
export function activityEvents(
  logs: ActivityLog[],
  title?: (log: ActivityLog) => string | null | undefined,
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const log of logs) {
    const t = title ? title(log) : undefined;
    if (t === null) continue;
    out.push({
      date: log.createdAt,
      withTime: true,
      title: t ?? log.description,
      detail: t ? log.description : describeChanges(log.metadata),
      tone: TONE[log.action] ?? 'default',
      user: log.user?.name ?? null,
    });
  }
  return out;
}

/** Ordena por fecha los eventos fechados y deja al final los de estado (sin fecha). */
export function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  const dated = events.filter((e) => e.date).sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());
  return [...dated, ...events.filter((e) => !e.date)];
}

/** true si el historial ya trae el alta (para no duplicarla con la fecha de creación). */
export const hasCreateLog = (logs: ActivityLog[]) => logs.some((l) => l.action === 'CREATE');
