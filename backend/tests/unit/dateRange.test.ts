import { startOfDay, endOfDay, startOfUtcDay, endOfUtcDay, todayIso } from '../../src/shared/utils/dateRange';

// Buenos Aires es UTC-3 todo el año: el día calendario 2026-08-24 va desde
// 2026-08-24T03:00Z hasta 2026-08-25T02:59:59.999Z.
describe('startOfDay / endOfDay', () => {
  it('ubica el inicio del día en la zona argentina, no en UTC', () => {
    expect(startOfDay('2026-08-24')!.toISOString()).toBe('2026-08-24T03:00:00.000Z');
  });

  it('ubica el fin del día al final del día argentino', () => {
    expect(endOfDay('2026-08-24')!.toISOString()).toBe('2026-08-25T02:59:59.999Z');
  });

  it('un comprobante emitido a la tarde entra en el filtro "hasta hoy"', () => {
    // 2026-08-24 16:30 hora argentina
    const emitida = new Date('2026-08-24T19:30:00.000Z');
    expect(emitida <= endOfDay('2026-08-24')!).toBe(true);
    // La medianoche UTC del mismo día lo dejaba afuera: eso era el bug.
    expect(emitida <= new Date('2026-08-24')).toBe(false);
  });

  it('un comprobante de la noche anterior NO entra en el filtro "desde"', () => {
    // 2026-08-23 22:00 hora argentina — era el otro lado del mismo error
    const anterior = new Date('2026-08-24T01:00:00.000Z');
    expect(anterior >= startOfDay('2026-08-24')!).toBe(false);
  });

  it('respeta un valor que ya trae hora', () => {
    const iso = '2026-08-24T15:00:00.000Z';
    expect(startOfDay(iso)!.toISOString()).toBe(iso);
    expect(endOfDay(iso)!.toISOString()).toBe(iso);
  });

  it('devuelve undefined para vacío o basura', () => {
    expect(startOfDay('')).toBeUndefined();
    expect(endOfDay('')).toBeUndefined();
    expect(endOfDay('no-es-fecha')).toBeUndefined();
  });
});

describe('startOfUtcDay / endOfUtcDay — fechas de comprobante sin hora', () => {
  it('cubre el día UTC completo', () => {
    expect(startOfUtcDay('2026-08-24')!.toISOString()).toBe('2026-08-24T00:00:00.000Z');
    expect(endOfUtcDay('2026-08-24')!.toISOString()).toBe('2026-08-24T23:59:59.999Z');
  });

  it('un comprobante fechado el 24 (medianoche UTC) entra en "desde el 24" y no en "hasta el 23"', () => {
    const fechado = new Date('2026-08-24T00:00:00.000Z');
    expect(fechado >= startOfUtcDay('2026-08-24')!).toBe(true);
    expect(fechado <= endOfUtcDay('2026-08-23')!).toBe(false);
    // Con los bordes argentinos quedaba al revés: eso es lo que se evita.
    expect(fechado >= startOfDay('2026-08-24')!).toBe(false);
  });

  it('devuelve undefined para vacío o basura', () => {
    expect(startOfUtcDay('')).toBeUndefined();
    expect(endOfUtcDay('no-es-fecha')).toBeUndefined();
  });
});

describe('todayIso', () => {
  it('da el día argentino, no el UTC', () => {
    // 2026-08-25 01:30 UTC todavía es 24 a las 22:30 en Buenos Aires.
    expect(todayIso(new Date('2026-08-25T01:30:00.000Z'))).toBe('2026-08-24');
    expect(todayIso(new Date('2026-08-25T03:00:00.000Z'))).toBe('2026-08-25');
  });
});
