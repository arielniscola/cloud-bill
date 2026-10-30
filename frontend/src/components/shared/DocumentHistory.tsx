import { useEffect, useState } from 'react';
import { DocumentTimeline, type TimelineEvent } from './DocumentTimeline';
import { activityLogsService } from '../../services';
import { activityEvents, sortTimeline, hasCreateLog } from '../../utils/documentTimeline';
import type { ActivityLog } from '../../types';

interface Props {
  /** Id del documento: se buscan sus registros en el historial de actividad. */
  entityId: string;
  /** Alta del documento, por si el historial no la registró (documentos viejos o plan sin historial). */
  created?: { date: string | Date; user?: string | null; title?: string };
  /** Eventos que salen del documento mismo (cobros, entregas, imputaciones…). */
  extra?: TimelineEvent[];
  /** Estado final sin fecha (lo que falta: saldo pendiente, entrega pendiente…). */
  final?: TimelineEvent[];
  /** Renombra o descarta (null) registros puntuales del historial. */
  mapLog?: (log: ActivityLog) => string | null | undefined;
  /** Cambiarlo vuelve a leer el historial (después de cobrar, anular…). */
  reloadKey?: unknown;
  title?: string;
}

/**
 * Historia del documento: quién lo creó, modificó, cobró o anuló y cuándo.
 * Junta el historial de actividad con los eventos propios del documento.
 */
export function DocumentHistory({ entityId, created, extra = [], final = [], mapLog, reloadKey, title }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    activityLogsService.getForDocument(entityId)
      .then((data) => { if (!cancelled) setLogs(data); })
      .catch(() => { if (!cancelled) setLogs([]); });
    return () => { cancelled = true; };
  }, [entityId, reloadKey]);

  const events: TimelineEvent[] = [
    ...(created && !hasCreateLog(logs)
      ? [{ date: created.date, withTime: true, title: created.title ?? 'Creado', user: created.user ?? null }]
      : []),
    ...activityEvents(logs, mapLog),
    ...extra,
  ];

  return <DocumentTimeline title={title} events={[...sortTimeline(events), ...final]} />;
}
