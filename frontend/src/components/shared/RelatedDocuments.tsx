import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '../ui';

export interface RelatedDoc {
  label: string;
  detail?: string;
  to: string;
  badge?: string;
}

export interface RelatedDocGroup {
  title: string;
  docs: RelatedDoc[];
}

/**
 * Panel "Documentos relacionados": hace navegable la cadena
 * presupuesto → orden → factura → remito → recibo desde cualquier detalle.
 * Presentacional — el llamador arma los grupos con los vínculos que tenga.
 */
export function RelatedDocuments({ groups }: { groups: RelatedDocGroup[] }) {
  const visible = groups.filter((g) => g.docs.length > 0);
  if (visible.length === 0) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Documentos relacionados</h3>
      <div className="space-y-3">
        {visible.map((g) => (
          <div key={g.title}>
            <p className="text-xs font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">{g.title}</p>
            <ul className="space-y-1">
              {g.docs.map((d) => (
                <li key={d.to + d.label}>
                  <Link
                    to={d.to}
                    className="group flex items-center justify-between gap-2 px-2.5 py-1.5 -mx-1 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 truncate">{d.label}</span>
                      {d.badge && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 uppercase">{d.badge}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
                      {d.detail}
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
