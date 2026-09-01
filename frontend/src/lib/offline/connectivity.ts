import api from '../../services/api';
import { useOfflineStore } from '../../stores/offline.store';

/**
 * Deteccion de conectividad.
 *
 * `navigator.onLine` no alcanza: dice `true` con solo estar conectado a un
 * router, aunque el router no tenga internet — que es exactamente el caso que
 * nos importa. Por eso se confirma con un ping real al backend.
 *
 * Un `false` de navigator.onLine SI es confiable (no hay interfaz de red), asi
 * que ese camino corta sin pingear.
 */

const PING_TIMEOUT_MS = 5000;
const POLL_ONLINE_MS = 60_000; // creyendo que hay conexion, chequeo espaciado
const POLL_OFFLINE_MS = 15_000; // caidos, reintento seguido para volver rapido

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

export async function pingBackend(): Promise<boolean> {
  if (navigator.onLine === false) return false;
  try {
    await api.get('/health', {
      timeout: PING_TIMEOUT_MS,
      // Sin esto un proxy o el propio navegador pueden responder con la copia
      // cacheada y darnos un "online" falso.
      headers: { 'Cache-Control': 'no-cache' },
      params: { _t: Date.now() },
    });
    return true;
  } catch {
    return false;
  }
}

/** Chequea una vez y actualiza el store. Devuelve si hay conexion. */
export async function checkConnection(): Promise<boolean> {
  const { setConnection } = useOfflineStore.getState();
  const ok = await pingBackend();
  setConnection(ok ? 'online' : 'offline');
  return ok;
}

function scheduleNext() {
  if (stopped) return;
  const delay =
    useOfflineStore.getState().connection === 'offline' ? POLL_OFFLINE_MS : POLL_ONLINE_MS;
  timer = setTimeout(async () => {
    await checkConnection();
    scheduleNext();
  }, delay);
}

/** Arranca el monitoreo. Devuelve la funcion para detenerlo. */
export function startConnectivityMonitor(): () => void {
  if (!stopped) return stopConnectivityMonitor;
  stopped = false;

  const onOnline = () => void checkConnection();
  const onOffline = () => useOfflineStore.getState().setConnection('offline');
  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkConnection();
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);

  void checkConnection();
  scheduleNext();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    stopConnectivityMonitor();
  };
}

export function stopConnectivityMonitor(): void {
  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
