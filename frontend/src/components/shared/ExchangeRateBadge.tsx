import { RefreshCw, AlertTriangle } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';
import type { UseExchangeRate } from '../../hooks/useExchangeRate';

/**
 * Muestra con qué cotización se están expresando los importes en pesos.
 * Es información obligatoria en las pantallas de deuda: el mismo saldo en USD
 * se ve distinto en pesos según el día.
 */
export function ExchangeRateBadge({ er, className = '' }: { er: UseExchangeRate; className?: string }) {
  const { rate, info, isLoading, isStale, refresh } = er;

  if (!rate) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        Sin cotización — los importes en dólares no se convierten
        <button onClick={refresh} className="underline hover:no-underline">reintentar</button>
      </span>
    );
  }

  const fetched = info?.fetchedAt ? new Date(info.fetchedAt) : null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${isStale ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-slate-400'} ${className}`}
      title={`${info?.source ?? ''}${fetched ? ` · ${fetched.toLocaleString('es-AR')}` : ''}`}
    >
      {isStale && <AlertTriangle className="w-3.5 h-3.5" />}
      Cotización USD ${formatNumber(rate, 2)}
      {isStale && fetched && ` (del ${fetched.toLocaleDateString('es-AR')})`}
      <button
        onClick={refresh}
        disabled={isLoading}
        className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50"
        title="Actualizar cotización"
      >
        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
      </button>
    </span>
  );
}

export default ExchangeRateBadge;
