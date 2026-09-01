import { useOfflineStore } from '../../stores/offline.store';

/**
 * Confirma la salida cuando quedan ventas sin subir.
 *
 * La cola SOBREVIVE al logout a proposito (clearCache no toca `outbox`), asi
 * que esto no evita una perdida de datos: evita que alguien se vaya creyendo
 * que ya subio todo, y que la proxima persona en usar la terminal cargue sobre
 * una cola ajena sin saberlo.
 *
 * Devuelve true si se puede continuar.
 */
export function confirmLogoutWithPendingSales(): boolean {
  const pending = useOfflineStore.getState().pendingSales;
  if (pending === 0) return true;

  return window.confirm(
    `Quedan ${pending} venta${pending === 1 ? '' : 's'} sin subir al servidor.\n\n` +
      'No se pierden: quedan guardadas en esta computadora y suben cuando ' +
      'vuelva la conexion. Pero hasta entonces solo existen aca.\n\n' +
      '¿Cerrar sesion igual?'
  );
}
