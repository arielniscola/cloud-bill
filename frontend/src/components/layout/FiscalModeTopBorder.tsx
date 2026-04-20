import { clsx } from 'clsx';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';

export default function FiscalModeTopBorder() {
  const { viewMode } = useFiscalModeStore();

  return (
    <div
      className={clsx(
        'fixed top-0 left-0 right-0 z-[60] h-[3px] transition-colors duration-300',
        viewMode === 'FORMAL' && 'bg-indigo-500',
        viewMode === 'INFORMAL' && 'bg-amber-500',
        viewMode === 'ALL' && 'bg-gradient-to-r from-indigo-500 via-slate-400 to-amber-500',
      )}
      aria-hidden="true"
    />
  );
}
