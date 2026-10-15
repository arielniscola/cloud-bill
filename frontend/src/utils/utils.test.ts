import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { parseChequeNumber, joinChequeNumber, formatChequeNumber } from './chequeNumber';
import { integerToWords, amountToWords } from './numberToWords';
import { mod10CheckDigit } from './afipFiscal';
import { formatCuit } from './formatters';
import { apiErrorMessage } from './apiError';

describe('número de cheque (banco-sucursal-nro)', () => {
  it('parte y vuelve a unir los tres tramos', () => {
    expect(parseChequeNumber('011-0345-00012345')).toEqual({ banco: '011', sucursal: '0345', numero: '00012345' });
    expect(joinChequeNumber({ banco: '011', sucursal: '0345', numero: '00012345' })).toBe('011-0345-00012345');
  });

  it('acepta los valores viejos que solo tenían el número', () => {
    expect(parseChequeNumber('12345')).toEqual({ banco: '', sucursal: '', numero: '12345' });
    expect(joinChequeNumber({ banco: '', sucursal: '', numero: '12345' })).toBe('12345');
  });

  it('muestra una raya cuando no hay número', () => {
    expect(formatChequeNumber(null)).toBe('—');
    expect(formatChequeNumber('  ')).toBe('—');
  });
});

describe('importe en letras', () => {
  it('escribe enteros', () => {
    expect(integerToWords(0)).toBe('cero');
    expect(integerToWords(21)).toBe('veintiuno');
    expect(integerToWords(1000)).toBe('mil');
    expect(integerToWords(136000)).toBe('ciento treinta y seis mil');
  });

  it('arma el importe con moneda y centavos', () => {
    expect(amountToWords(136000.46)).toBe('ciento treinta y seis mil pesos con cuarenta y seis centavos');
    expect(amountToWords(1)).toBe('un peso');
    expect(amountToWords(1_000_000)).toBe('un millón de pesos');
    expect(amountToWords(21, 'USD')).toBe('veintiún dólares estadounidenses');
  });

  it('no pierde un centavo por el redondeo binario', () => {
    expect(amountToWords(0.29)).toBe('cero pesos con veintinueve centavos');
  });
});

describe('dígito verificador de ARCA (módulo 10)', () => {
  it('calcula el dígito sobre impares × 3 + pares', () => {
    // impares 1+3+5 = 9 → 27; pares 2+4 = 6; total 33 → DV 7
    expect(mod10CheckDigit('12345')).toBe(7);
    // total múltiplo de 10 → DV 0
    expect(mod10CheckDigit('0000')).toBe(0);
  });
});

describe('formatCuit', () => {
  it('formatea 11 dígitos y deja pasar lo demás', () => {
    expect(formatCuit('20123456789')).toBe('20-12345678-9');
    expect(formatCuit('20-12345678-9')).toBe('20-12345678-9');
    expect(formatCuit('12345678')).toBe('12345678');
    expect(formatCuit(null)).toBe('');
  });
});

describe('apiErrorMessage', () => {
  const axiosError = (data: unknown) =>
    new AxiosError('fallo', 'ERR_BAD_REQUEST', undefined, undefined, { data, status: 400 } as never);

  it('devuelve el mensaje que mandó la API', () => {
    expect(apiErrorMessage(axiosError({ status: 'error', message: 'Stock insuficiente' }))).toBe('Stock insuficiente');
  });

  it('devuelve undefined si el error no vino de la API', () => {
    expect(apiErrorMessage(new Error('otro'))).toBeUndefined();
    expect(apiErrorMessage(axiosError({}))).toBeUndefined();
    expect(apiErrorMessage(axiosError('<html>'))).toBeUndefined();
    expect(apiErrorMessage(null)).toBeUndefined();
  });
});
