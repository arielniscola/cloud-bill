import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/auth.store';
import { useOfflineStore } from '../../stores/offline.store';
import { startConnectivityMonitor } from './connectivity';
import { getCacheAgeMinutes, syncCatalog } from './catalogCache';
import { countUnsent } from './outbox';
import { replayOutbox } from './replay';

/** Cada cuanto se refresca el catalogo con la app abierta. */
const REFRESH_MS = 10 * 60 * 1000;
/** Cada cuanto se recalcula la antiguedad mostrada en el banner. */
const AGE_TICK_MS = 60 * 1000;

/**
 * Mantiene viva la caché offline mientras haya sesion iniciada:
 * monitorea la conexion, baja el catalogo y refresca al reconectar.
 *
 * Se monta una sola vez, dentro del area autenticada.
 */
export function useOfflineSync(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const connection = useOfflineStore((s) => s.connection);
  const prevConnection = useRef(connection);
  const running = useRef(false);

  // Monitoreo de conectividad, atado al ciclo de vida de la sesion.
  useEffect(() => {
    if (!isAuthenticated) return;
    return startConnectivityMonitor();
  }, [isAuthenticated]);

  // Sync inicial + refresco periodico.
  useEffect(() => {
    if (!isAuthenticated) return;

    const run = async () => {
      if (running.current) return; // no encimar corridas
      if (useOfflineStore.getState().connection === 'offline') return;

      running.current = true;
      const { setSyncing, setSyncResult, setCacheAge } = useOfflineStore.getState();
      setSyncing(true);
      try {
        // Subir antes de bajar, por el mismo motivo que al reconectar: el
        // snapshot pisaria el stock local con uno que ignora lo pendiente.
        // Cubre tambien las ventas que quedaron de una sesion anterior.
        await replayOutbox();

        const result = await syncCatalog();
        setSyncResult({ lastSyncAt: result.syncedAt, error: result.error ?? null });
        setCacheAge(await getCacheAgeMinutes());
      } finally {
        running.current = false;
      }
    };

    void run();
    const id = setInterval(run, REFRESH_MS);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Al volver la conexion, refrescar enseguida: los precios pueden haber
  // cambiado justo mientras estabamos caidos.
  useEffect(() => {
    const was = prevConnection.current;
    prevConnection.current = connection;
    if (!isAuthenticated) return;
    if (was === 'offline' && connection === 'online') {
      void (async () => {
        // Primero SUBIR lo pendiente y despues bajar el catalogo: si se hace
        // al reves, el snapshot pisa el stock local con el del servidor, que
        // todavia no sabe nada de las ventas que estan por subir.
        const replay = await replayOutbox();
        if (replay.uploaded > 0) {
          toast.success(
            `${replay.uploaded} venta${replay.uploaded === 1 ? '' : 's'} subida${replay.uploaded === 1 ? '' : 's'} al servidor`
          );
        }
        if (replay.failed > 0) {
          toast.error(
            `${replay.failed} venta${replay.failed === 1 ? '' : 's'} no pudo subirse. Revisala en Ventas pendientes.`,
            { duration: 8000 }
          );
        }

        const r = await syncCatalog();
        useOfflineStore.getState().setSyncResult({
          lastSyncAt: r.syncedAt,
          error: r.error ?? null,
        });
        useOfflineStore.getState().setCacheAge(await getCacheAgeMinutes());
      })();
    }
  }, [connection, isAuthenticated]);

  // Refrescar la antiguedad mostrada y el contador de pendientes.
  useEffect(() => {
    if (!isAuthenticated) return;
    const tick = async () => {
      const store = useOfflineStore.getState();
      store.setCacheAge(await getCacheAgeMinutes());
      store.setPendingSales(await countUnsent());
    };
    void tick();
    const id = setInterval(tick, AGE_TICK_MS);
    return () => clearInterval(id);
  }, [isAuthenticated]);
}

export default useOfflineSync;
