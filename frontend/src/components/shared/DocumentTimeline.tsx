import { Card } from '../ui';
import { formatDate } from '../../utils/formatters';

export type TimelineTone = 'default' | 'success' | 'danger' | 'pending';

export interface TimelineEvent {
  date?: string | Date | null;
  title: string;
  detail?: string;
  tone?: TimelineTone;
}

const DOT: Record<TimelineTone, string> = {
  default: 'bg-indigo-500',
  success: 'bg-emerald-500',
  danger:  'bg-rose-500',
  pending: 'bg-amber-400 ring-4 ring-amber-100 dark:ring-amber-900/30',
};

/**
 * Línea de tiempo del documento: creada → emitida → CAE → cobros → saldo.
 * Presentacional — el llamador arma los eventos con los datos que ya tiene
 * (documento + recibos + activity logs).
 */
export function DocumentTimeline({ title = 'Historia', events }: {
  title?: string;
  events: TimelineEvent[];
}) {
  if (events.length === 0) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      <ol className="relative ml-2 border-l border-gray-200 dark:border-slate-700 space-y-4">
        {events.map((e, i) => (
          <li key={i} className="pl-4 relative">
            <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${DOT[e.tone ?? 'default']}`} />
            <div className="flex items-baseline justify-between gap-3">
              <p className={`text-sm ${e.tone === 'pending' ? 'font-semibold text-amber-700 dark:text-amber-400' : 'font-medium text-gray-800 dark:text-slate-200'}`}>
                {e.title}
              </p>
              {e.date && (
                <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{formatDate(e.date as string)}</span>
              )}
            </div>
            {e.detail && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{e.detail}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
