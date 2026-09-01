/**
 * Que se puede usar sin conexion.
 *
 * Fuente unica: la usan el Sidebar y el Navbar para atenuar lo que no anda, y
 * OfflineRouteGuard para que entrar por URL directa muestre una explicacion en
 * vez de una pantalla rota.
 *
 * La lista es CORTA a proposito. Casi todas las paginas listan contra la API;
 * solo estas dos leen de IndexedDB y funcionan de verdad sin red. Marcar de
 * mas seria peor que marcar de menos: el operador la toca, explota, y pierde
 * la confianza en el modo offline.
 */
const OFFLINE_READY = [
  '/ventas-pendientes',
  '/orden-pedidos/new',
] as const;

/** Quita el querystring: los items del nav pueden traerlo. */
function pathOf(href: string): string {
  const i = href.indexOf('?');
  return i >= 0 ? href.slice(0, i) : href;
}

export function isAvailableOffline(href: string): boolean {
  const path = pathOf(href);
  return OFFLINE_READY.some((r) => path === r || path.startsWith(`${r}/`));
}

/** Texto unico para el tooltip y la pantalla de bloqueo. */
export const OFFLINE_UNAVAILABLE_HINT =
  'No disponible sin conexión';
