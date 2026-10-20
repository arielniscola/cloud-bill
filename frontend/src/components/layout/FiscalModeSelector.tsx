import { clsx } from 'clsx';
import { Shield, ShieldOff, Eye } from 'lucide-react';
import { useFiscalModeStore, type FiscalModeView } from '../../stores/fiscalMode.store';

const OPTIONS: { value: FiscalModeView; label: string; icon: React.ElementType }[] = [
  { value: 'FORMAL',   label: 'Formal',   icon: Shield },
  { value: 'INFORMAL', label: 'Informal', icon: ShieldOff },
  { value: 'ALL',      label: 'Todo',     icon: Eye },
];

export default function FiscalModeSelector() {
  const { viewMode, setViewMode } = useFiscalModeStore();

  const isInformal = viewMode === 'INFORMAL';
  const isAll = viewMode === 'ALL';

  return (
    <div
      className={clsx(
        'flex items-center rounded-lg border p-0.5 gap-0.5 transition-all duration-200',
        isInformal && 'border-rose-400 bg-rose-500/25 shadow-[0_0_0_2px_rgba(244,63,94,0.25)] ring-1 ring-rose-400/60',
        isAll && 'border-white/40 bg-white/15',
        !isInformal && !isAll && 'border-white/20 bg-white/5',
      )}
      title={`Modo fiscal: ${viewMode} (Ctrl+M para cambiar)`}
    >
      {OPTIONS.map((opt) => {
        const active = viewMode === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            onClick={() => setViewMode(opt.value)}
            title={opt.label}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150',
              active
                ? opt.value === 'INFORMAL'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : opt.value === 'ALL'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'bg-white/20 text-white shadow-sm'
                : 'text-white/50 hover:text-white/80 hover:bg-white/10',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className={clsx(
              active ? 'inline' : 'hidden sm:inline',
            )}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
