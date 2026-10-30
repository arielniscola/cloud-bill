import { useState } from 'react';

export interface MonthlyMeasure {
  key: string;
  /** Texto del selector (p. ej. "Unidades"). */
  label: string;
  /** Lo que muestra el gráfico (p. ej. "Unidades vendidas por mes"). */
  caption: string;
  values: number[];
  format: (v: number) => string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};

/**
 * Una serie por mes en barras finas (extremo redondeado apoyado en la base,
 * 2px entre barras, tooltip por barra). Si hay más de una medida se elige con
 * un selector: dos magnitudes distintas nunca comparten eje.
 */
export function MonthlyBarChart({ months, measures, emptyText = 'Sin datos en el período' }: {
  /** 'YYYY-MM', en orden. */
  months: string[];
  measures: MonthlyMeasure[];
  emptyText?: string;
}) {
  const [active, setActive] = useState(measures[0]?.key);
  const [hover, setHover] = useState<number | null>(null);
  const measure = measures.find((m) => m.key === active) ?? measures[0];
  const values = measure.values.map((v) => Math.max(v, 0));
  const max = Math.max(...values, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-xs text-gray-500 dark:text-slate-400">{measure.caption}</p>
        {measures.length > 1 && (
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 p-0.5 text-xs">
            {measures.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(m.key)}
                className={`px-2.5 py-1 rounded-md ${m.key === measure.key ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-slate-400'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {max === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">{emptyText}</p>
      ) : (
        <div>
          <div
            className="flex items-end gap-[2px] h-36 border-b border-gray-200 dark:border-slate-700"
            role="img"
            aria-label={`${measure.caption}: ${months.map((m, i) => `${monthLabel(m)} ${measure.format(values[i])}`).join(', ')}`}
          >
            {months.map((m, i) => (
              <div
                key={m}
                className="relative flex-1 h-full flex items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full max-w-[28px] rounded-t ${hover === i ? 'bg-indigo-600 dark:bg-indigo-300' : 'bg-indigo-500 dark:bg-indigo-400'}`}
                  style={{ height: `${(values[i] / max) * 100}%`, minHeight: values[i] > 0 ? 2 : 0 }}
                />
                {hover === i && (
                  <div className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-md bg-gray-900 dark:bg-slate-100 px-2 py-1 text-xs text-white dark:text-slate-900 shadow">
                    <span className="font-medium">{monthLabel(m)}</span> · {measure.format(values[i])}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] mt-1">
            {months.map((m) => (
              <span key={m} className="flex-1 text-center text-[10px] text-gray-400 dark:text-slate-500">{monthLabel(m).split(' ')[0]}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
