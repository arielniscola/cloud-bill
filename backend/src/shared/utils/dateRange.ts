/**
 * Bordes de día para los filtros "Desde / Hasta" de los listados.
 *
 * El front manda `YYYY-MM-DD` (un día calendario argentino, sin hora), pero las
 * columnas de fecha guardan un timestamp. `new Date('2026-08-24')` se parsea
 * como medianoche **UTC**, así que un `lte` contra ese valor descartaba TODO el
 * día pedido, y un `gte` se comía las últimas 3 horas del día anterior.
 *
 * `setHours(23, 59, 59, 999)` tampoco alcanza: opera en la zona del proceso, que
 * en un contenedor es UTC — el "fin del día" quedaba a las 20:59 de Buenos Aires.
 *
 * Por eso los bordes se calculan contra una zona explícita.
 */
const TZ = 'America/Argentina/Buenos_Aires';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Desfasaje de la zona respecto de UTC, en ms, para un instante dado (contempla DST). */
function tzOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;

  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    // Algunas versiones de ICU devuelven "24" para la medianoche con hour12:false.
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
    // formatToParts trunca al segundo. El desfasaje de una zona siempre es de
    // minutos enteros, así que los ms del instante se reponen tal cual — sin
    // esto el offset sale corrido y el fin del día cae 1 ms dentro del siguiente.
    instant.getUTCMilliseconds()
  );
  return asUtc - instant.getTime();
}

/** Instante UTC que corresponde a una hora de pared de la zona. */
function fromWallClock(y: number, m: number, d: number, h: number, min: number, s: number, ms: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min, s, ms);
  // Dos pasadas: la primera estima el offset, la segunda lo corrige si el
  // instante estimado cayó del otro lado de un cambio de huso.
  let utc = guess - tzOffsetMs(new Date(guess));
  utc = guess - tzOffsetMs(new Date(utc));
  return new Date(utc);
}

/**
 * Primer instante del día `YYYY-MM-DD` en la zona de la app.
 * Un valor que ya traiga hora se respeta tal cual.
 */
export function startOfDay(input: string): Date | undefined {
  if (!input) return undefined;
  if (!DATE_ONLY.test(input)) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const [y, m, d] = input.split('-').map(Number);
  return fromWallClock(y, m, d, 0, 0, 0, 0);
}

/**
 * Último instante del día `YYYY-MM-DD` en la zona de la app — el que hace que
 * un `lte` incluya el día pedido completo.
 * Un valor que ya traiga hora se respeta tal cual.
 */
export function endOfDay(input: string): Date | undefined {
  if (!input) return undefined;
  if (!DATE_ONLY.test(input)) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const [y, m, d] = input.split('-').map(Number);
  return fromWallClock(y, m, d, 23, 59, 59, 999);
}
