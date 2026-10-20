import { useEffect } from 'react';
import { clsx } from 'clsx';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';

export default function FiscalModeTopBorder() {
  const { viewMode } = useFiscalModeStore();

  // El tinte del área de trabajo (index.css) cuelga de este atributo. Se quita
  // al desmontar para que el login y las pantallas fuera del layout no lo hereden.
  useEffect(() => {
    document.documentElement.dataset.fiscalView = viewMode;
    return () => { delete document.documentElement.dataset.fiscalView; };
  }, [viewMode]);

  return (
    <div
      className={clsx(
        'fixed top-0 left-0 right-0 z-[60] h-[3px] transition-colors duration-300',
        viewMode === 'FORMAL' && 'bg-indigo-500',
        viewMode === 'INFORMAL' && 'bg-rose-500 dark:bg-rose-400',
        viewMode === 'ALL' && 'bg-gradient-to-r from-indigo-500 via-slate-400 to-rose-500',
      )}
      aria-hidden="true"
    />
  );
}
