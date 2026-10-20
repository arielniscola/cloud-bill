import { clsx } from 'clsx';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';

interface Props {
  mode?: string;
  className?: string;
}

/**
 * Shows a small FORMAL/INFORMAL badge. Only visible when viewMode is 'ALL'.
 */
export default function FiscalModeBadge({ mode, className }: Props) {
  const { viewMode } = useFiscalModeStore();

  // Only show badge in ALL mode
  if (viewMode !== 'ALL') return null;
  if (!mode) return null;

  const isInformal = mode === 'INFORMAL';

  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
      // `fiscal-badge-inf` además tiñe la fila que lo contiene en la vista "Todo" (index.css).
      isInformal
        ? 'fiscal-badge-inf bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      className,
    )}>
      {isInformal ? 'INF' : 'FOR'}
    </span>
  );
}
