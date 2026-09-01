import { startOfDay, endOfDay } from '../../src/shared/utils/dateRange';

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
