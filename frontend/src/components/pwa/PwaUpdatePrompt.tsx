import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useServiceWorker } from '../../lib/pwa/useServiceWorker';

/**
 * Avisos del service worker:
 *  - "listo sin conexion" la primera vez que termina de cachearse (toast breve)
 *  - "hay una version nueva" como tarjeta persistente, que el usuario aplica
 *    cuando quiere (nunca automatico: puede haber una venta a medio cargar)
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh,
    offlineReady,
    applyUpdate,
    dismissUpdate,
    dismissOfflineReady,
  } = useServiceWorker();

  useEffect(() => {
    if (!offlineReady) return;
    toast.success('Cloud Bill ya funciona sin conexion', {
      icon: <WifiOff size={18} className="text-emerald-500" />,
      duration: 4000,
    });
    dismissOfflineReady();
  }, [offlineReady, dismissOfflineReady]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-[60] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
          <RefreshCw size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
            Hay una version nueva
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
            Se aplica al recargar. Guarda lo que tengas abierto antes de
            continuar.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={dismissUpdate} className="btn btn-secondary px-3 py-1.5 text-xs">
          Despues
        </button>
        <button type="button" onClick={applyUpdate} className="btn btn-primary px-3 py-1.5 text-xs">
          Actualizar
        </button>
      </div>
    </div>
  );
}

export default PwaUpdatePrompt;
