/**
 * Las 24 jurisdicciones argentinas con que arranca el catálogo de cada empresa.
 * `afipCode` = código de provincia del padrón de ARCA (`idProvincia`);
 * `jurisdictionCode` = código de jurisdicción del Convenio Multilateral (SIRCAR / SIFERE).
 * Los nombres coinciden con los que ya guardaban las percepciones IIBB.
 */
export const DEFAULT_PROVINCIAS: { name: string; afipCode: number; jurisdictionCode: string }[] = [
  { name: 'CABA',                afipCode: 0,  jurisdictionCode: '901' },
  { name: 'Buenos Aires',        afipCode: 1,  jurisdictionCode: '902' },
  { name: 'Catamarca',           afipCode: 2,  jurisdictionCode: '903' },
  { name: 'Córdoba',             afipCode: 3,  jurisdictionCode: '904' },
  { name: 'Corrientes',          afipCode: 4,  jurisdictionCode: '905' },
  { name: 'Chaco',               afipCode: 16, jurisdictionCode: '906' },
  { name: 'Chubut',              afipCode: 17, jurisdictionCode: '907' },
  { name: 'Entre Ríos',          afipCode: 5,  jurisdictionCode: '908' },
  { name: 'Formosa',             afipCode: 18, jurisdictionCode: '909' },
  { name: 'Jujuy',               afipCode: 6,  jurisdictionCode: '910' },
  { name: 'La Pampa',            afipCode: 21, jurisdictionCode: '911' },
  { name: 'La Rioja',            afipCode: 8,  jurisdictionCode: '912' },
  { name: 'Mendoza',             afipCode: 7,  jurisdictionCode: '913' },
  { name: 'Misiones',            afipCode: 19, jurisdictionCode: '914' },
  { name: 'Neuquén',             afipCode: 20, jurisdictionCode: '915' },
  { name: 'Río Negro',           afipCode: 22, jurisdictionCode: '916' },
  { name: 'Salta',               afipCode: 9,  jurisdictionCode: '917' },
  { name: 'San Juan',            afipCode: 10, jurisdictionCode: '918' },
  { name: 'San Luis',            afipCode: 11, jurisdictionCode: '919' },
  { name: 'Santa Cruz',          afipCode: 23, jurisdictionCode: '920' },
  { name: 'Santa Fe',            afipCode: 12, jurisdictionCode: '921' },
  { name: 'Santiago del Estero', afipCode: 13, jurisdictionCode: '922' },
  { name: 'Tierra del Fuego',    afipCode: 24, jurisdictionCode: '923' },
  { name: 'Tucumán',             afipCode: 14, jurisdictionCode: '924' },
];

/** Minúsculas, sin acentos ni signos: para comparar "CORDOBA" con "Córdoba". */
export const normalizeProvinciaName = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
