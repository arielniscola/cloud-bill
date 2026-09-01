import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registra el service worker y expone su estado.
 *
 * El registro es en modo 'prompt': cuando hay una version nueva NO se recarga
 * sola, porque una recarga en medio de una venta pierde el formulario. El
 * usuario decide cuando aplicarla.
 */
export function useServiceWorker() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      // Buscar actualizaciones cada hora mientras la pestaña siga abierta.
      // Sin esto, una PWA instalada puede quedar meses en la misma version.
      setInterval(
        () => {
          if (navigator.onLine) registration.update().catch(() => {});
        },
        60 * 60 * 1000
      );
    },
    onRegisterError(error) {
      console.error('[PWA] fallo el registro del service worker', error);
    },
  });

  return {
    /** Hay una version nueva descargada esperando activarse. */
    needRefresh,
    /** La app quedo cacheada y ya funciona sin conexion. */
    offlineReady,
    /** Activa la version nueva y recarga. */
    applyUpdate: () => updateServiceWorker(true),
    dismissUpdate: () => setNeedRefresh(false),
    dismissOfflineReady: () => setOfflineReady(false),
  };
}

export default useServiceWorker;
