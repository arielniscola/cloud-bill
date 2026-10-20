import { isValidCuit, receptorProblemForArca } from '../../src/shared/utils/arcaReceptor';

describe('arcaReceptor: receptor que ARCA aceptaría', () => {
  it('valida el dígito verificador del CUIT', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('30-71234567-1')).toBe(true);
    expect(isValidCuit('20363104333')).toBe(false); // prefijo 20 sin dígito posible
    expect(isValidCuit('23363104339')).toBe(true);
    expect(isValidCuit('2036310433')).toBe(false);
    expect(isValidCuit(null)).toBe(false);
  });

  it('rechaza Factura B a un monotributista o RI', () => {
    const msg = receptorProblemForArca('FACTURA_B', { taxId: '20123456786', taxCondition: 'MONOTRIBUTISTA' });
    expect(msg).toMatch(/clase B/);
    expect(receptorProblemForArca('NOTA_CREDITO_B', { taxId: '20123456786', taxCondition: 'RESPONSABLE_INSCRIPTO' })).toMatch(/clase B/);
  });

  it('rechaza Factura A a consumidor final o exento', () => {
    expect(receptorProblemForArca('FACTURA_A', { taxId: null, taxCondition: 'CONSUMIDOR_FINAL' })).toMatch(/clase A/);
    expect(receptorProblemForArca('FACTURA_A', { taxId: '20123456786', taxCondition: 'EXENTO' })).toMatch(/clase A/);
  });

  it('pide CUIT válido cuando el receptor no es consumidor final', () => {
    expect(receptorProblemForArca('FACTURA_A', { taxId: '20363104333', taxCondition: 'MONOTRIBUTISTA' })).toMatch(/CUIT/);
  });

  it('acepta combinaciones correctas', () => {
    expect(receptorProblemForArca('FACTURA_A', { taxId: '20123456786', taxCondition: 'MONOTRIBUTISTA' })).toBeNull();
    expect(receptorProblemForArca('FACTURA_B', { taxId: null, taxCondition: 'CONSUMIDOR_FINAL' })).toBeNull();
    expect(receptorProblemForArca('FACTURA_C', { taxId: '20123456786', taxCondition: 'RESPONSABLE_INSCRIPTO' })).toBeNull();
  });
});
