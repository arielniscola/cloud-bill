import { arcaDayOf, isBeforeToday, isTooOldForArca, sortForArcaBatch } from '../../src/shared/utils/arcaBatch';

describe('arcaBatch: reglas de fecha y orden para emitir pendientes', () => {
  // 19/10/2026 10:00 en Buenos Aires (UTC-3)
  const now = new Date('2026-10-19T13:00:00Z');

  it('el día declarado es el argentino, no el UTC', () => {
    // 22:30 del 18 en Buenos Aires = 01:30 del 19 en UTC
    expect(arcaDayOf(new Date('2026-10-19T01:30:00Z'))).toBe('2026-10-18');
  });

  it('acepta hasta 5 días hacia atrás', () => {
    expect(isTooOldForArca(new Date('2026-10-14T15:00:00Z'), now)).toBe(false); // 5 días
    expect(isTooOldForArca(new Date('2026-10-13T15:00:00Z'), now)).toBe(true); // 6 días
  });

  it('distingue hoy de días anteriores', () => {
    expect(isBeforeToday(new Date('2026-10-19T03:30:00Z'), now)).toBe(false); // 00:30 del 19
    expect(isBeforeToday(new Date('2026-10-19T02:30:00Z'), now)).toBe(true); // 23:30 del 18
  });

  it('ordena por día, facturas antes que notas, y por orden de carga', () => {
    const rows = [
      { id: 'nc-hoy', type: 'NOTA_CREDITO_B', date: '2026-10-19T12:00:00Z', createdAt: '2026-10-19T12:00:00Z' },
      { id: 'fb-hoy-2', type: 'FACTURA_B', date: '2026-10-19T14:00:00Z', createdAt: '2026-10-19T14:00:00Z' },
      { id: 'fb-ayer', type: 'FACTURA_B', date: '2026-10-18T20:00:00Z', createdAt: '2026-10-18T20:00:00Z' },
      { id: 'fb-hoy-1', type: 'FACTURA_B', date: '2026-10-19T13:00:00Z', createdAt: '2026-10-19T13:00:00Z' },
    ];
    expect(sortForArcaBatch(rows).map((r) => r.id)).toEqual(['fb-ayer', 'fb-hoy-1', 'fb-hoy-2', 'nc-hoy']);
  });
});
