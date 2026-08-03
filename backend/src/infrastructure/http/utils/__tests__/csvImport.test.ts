import { detectDelimiter, parseRow, parseCsv, parseNumber } from '../csvImport';

describe('detectDelimiter', () => {
  it('usa coma por defecto', () => {
    expect(detectDelimiter('sku,nombre,costo')).toBe(',');
  });

  it('detecta punto y coma (export de Excel en es-AR)', () => {
    expect(detectDelimiter('sku;nombre;costo')).toBe(';');
  });

  it('detecta tabulador', () => {
    expect(detectDelimiter('sku\tnombre\tcosto')).toBe('\t');
  });
});

describe('parseRow', () => {
  it('respeta las comas dentro de un campo entrecomillado', () => {
    expect(parseRow('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('des-duplica las comillas escapadas', () => {
    expect(parseRow('a,"di ""hola""",b', ',')).toEqual(['a', 'di "hola"', 'b']);
  });

  // Una comilla en medio del texto son pulgadas, no un delimitador de campo:
  // con un parser estricto se tragaría el resto de la línea.
  it('trata como literal una comilla que no abre el campo', () => {
    expect(parseRow('HE001,Serrucho 12" p/poda,3947.55', ',')).toEqual([
      'HE001', 'Serrucho 12" p/poda', '3947.55',
    ]);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1234.56', 1234.56],
    ['1234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['84', 84],
    ['', NaN],
  ])('parsea %s', (input, expected) => {
    const got = parseNumber(input);
    if (Number.isNaN(expected)) expect(got).toBeNaN();
    else expect(got).toBe(expected);
  });
});

describe('parseCsv', () => {
  const header = 'sku,nombre,costo,precio';

  it('mapea los valores por encabezado normalizado', () => {
    const { rows, malformed } = parseCsv(`${header}\nP1,Lampara,100,150`);
    expect(malformed.size).toBe(0);
    expect(rows).toEqual([{ sku: 'P1', nombre: 'Lampara', costo: '100', precio: '150' }]);
  });

  it('completa vacías las columnas que faltan al final', () => {
    const { rows, malformed } = parseCsv(`${header}\nP1,Lampara,100`);
    expect(malformed.size).toBe(0);
    expect(rows[0].precio).toBe('');
  });

  // Antes estas filas se importaban desalineadas y en silencio: el importe
  // partido corría todas las columnas y guardaba, por ejemplo, un IVA erróneo.
  it('marca la fila cuando sobran campos por coma decimal sin comillas', () => {
    const { rows, malformed } = parseCsv(`${header}\nP1,Lampara,100,150,75`);
    expect(rows).toHaveLength(1);
    expect(malformed.get(0)).toMatch(/5 campos y el encabezado 4/);
  });

  it('marca la fila que quedó entera en un solo campo', () => {
    const { malformed } = parseCsv(`${header}\n"P1,Lampara,100,150"`);
    expect(malformed.get(0)).toMatch(/un solo campo/);
  });

  it('respeta el punto y coma como delimitador', () => {
    const { rows, malformed } = parseCsv('sku;nombre;costo\nP1;Lampara;1.234,56');
    expect(malformed.size).toBe(0);
    expect(parseNumber(rows[0].costo)).toBe(1234.56);
  });
});
