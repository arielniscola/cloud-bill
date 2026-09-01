import { useOfflineStore } from '../stores/offline.store';

export interface OnlineStatus {
  /** true = el backend responde (y por lo tanto puede hablar con ARCA) */
  isInternetOnline: boolean;
  /** true = el backend responde al /health */
  isBackendOnline: boolean;
  /** true = todo funciona */
  isFullyOnline: boolean;
  /** true = trabajando contra la cache local */
  isLocalOnly: boolean;
}

/**
 * Adaptador sobre el store de conectividad.
 *
 * Antes este hook tenia su propio poller contra `/health` con una URL relativa.
 * Eso funcionaba solo en la instalacion local: en la nube el `/health` relativo
 * pega contra el frontend, que por el fallback del SPA devuelve 200 con el
 * index.html — o sea, reportaba "backend online" siempre, incluso caido.
 *
 * Ahora la unica fuente de verdad es connectivity.ts, que pingea el backend
 * real a traves de la baseURL de axios. Este hook queda como compatibilidad
 * para los gates de ARCA que ya lo usaban.
 */
export function useOnlineStatus(): OnlineStatus {
  const connection = useOfflineStore((s) => s.connection);
  const online = connection === 'online';

  return {
    isInternetOnline: online,
    isBackendOnline: online,
    isFullyOnline: online,
    isLocalOnly: !online,
  };
}

export default useOnlineStatus;
