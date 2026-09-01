import { Decimal } from '@prisma/client/runtime/library';
import { buildIvaAlicuotas } from '../../src/infrastructure/services/AfipService';

const D = (n: string | number) => new Decimal(n);
const item = (taxRate: number, subtotal: string, taxAmount: string) => ({
  taxRate: D(taxRate),
  subtotal: D(subtotal),
  taxAmount: D(taxAmount),
});

/**
 * ARCA rechaza el comprobante si `sum(BaseImp) !== ImpNeto` o
 * `sum(Importe) !== ImpIVA`, así que eso se verifica en cada caso.
 */
const expectCuadra = (alic: Array<{ BaseImp: number; Importe: number }>, impNeto: number, impIva: number) => {
  expect(alic.reduce((s, a) => s + a.BaseImp, 0)).toBeCloseTo(impNeto, 10);
  expect(alic.reduce((s, a) => s + a.Importe, 0)).toBeCloseTo(impIva, 10);
};

describe('buildIvaAlicuotas', () => {
  it('declara un solo tramo al 21% (Id 5)', () => {
    const alic = buildIvaAlicuotas([item(21, '1000.00', '210.00')], 1000, 210);
    expect(alic).toEqual([{ Id: 5, BaseImp: 1000, Importe: 210 }]);
  });

  it('declara 10,5% como Id 4, no como 21%', () => {
    const alic = buildIvaAlicuotas([item(10.5, '1000.00', '105.00')], 1000, 105);
    expect(alic).toEqual([{ Id: 4, BaseImp: 1000, Importe: 105 }]);
  });

  it('parte una factura mixta en un tramo por alícuota', () => {
    const alic = buildIvaAlicuotas(
      [item(21, '1000.00', '210.00'), item(10.5, '500.00', '52.50')],
      1500,
      262.5
    );
    expect(alic).toEqual([
      { Id: 5, BaseImp: 1000, Importe: 210 },
      { Id: 4, BaseImp: 500, Importe: 52.5 },
    ]);
    expectCuadra(alic, 1500, 262.5);
  });

  it('agrupa varios ítems de la misma alícuota en un único tramo', () => {
    const alic = buildIvaAlicuotas(
      [item(21, '100.00', '21.00'), item(21, '200.00', '42.00'), item(27, '50.00', '13.50')],
      350,
      76.5
    );
    expect(alic).toEqual([
      { Id: 5, BaseImp: 300, Importe: 63 },
      { Id: 6, BaseImp: 50, Importe: 13.5 },
    ]);
  });

  it('imputa el residuo de redondeo al tramo de mayor base', () => {
    // Los ítems suman 999.99 / 175.00, pero la factura guardó 1000.00 / 175.01.
    const alic = buildIvaAlicuotas(
      [item(21, '333.33', '70.00'), item(21, '333.33', '70.00'), item(10.5, '333.33', '35.00')],
      1000,
      175.01
    );
    expectCuadra(alic, 1000, 175.01);
    expect(alic[0].Id).toBe(5); // el de mayor base absorbe el centavo
  });

  it('emite el tramo 0% (Id 3) aunque el IVA dé cero', () => {
    const alic = buildIvaAlicuotas([item(0, '1000.00', '0.00')], 1000, 0);
    expect(alic).toEqual([{ Id: 3, BaseImp: 1000, Importe: 0 }]);
  });

  it('trata 21, 21.0 y 21.00 como la misma alícuota', () => {
    const alic = buildIvaAlicuotas(
      [item(21, '100.00', '21.00'), item(21.0, '100.00', '21.00')],
      200,
      42
    );
    expect(alic).toHaveLength(1);
  });

  it('corta la emisión ante una alícuota que ARCA no admite', () => {
    expect(() => buildIvaAlicuotas([item(17, '1000.00', '170.00')], 1000, 170)).toThrow(
      /Alícuota de IVA no admitida/
    );
  });
});
