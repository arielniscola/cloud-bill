/**
 * Generador del Libro de IVA Digital — COMPRAS (ARCA / ex-AFIP).
 *
 * Produce los dos archivos de texto de ancho fijo que se importan en el
 * servicio "Portal IVA":
 *   - REGISTROS DE COMPRAS (cabecera)        → 325 posiciones por línea
 *   - ALÍCUOTAS DE COMPRAS  (detalle de IVA) →  84 posiciones por línea
 *
 * Los importes van sin separadores, con 2 decimales implícitos y rellenados
 * con ceros a la izquierda. El tipo de cambio lleva 6 decimales. Las NC/ND se
 * informan con su código de comprobante (el signo lo da el tipo, los importes
 * van siempre en valor absoluto).
 */

export interface IvaDigitalAlicuota {
  rate: number; // % de IVA (0, 2.5, 5, 10.5, 21, 27)
  neto: number; // base imponible (absoluto)
  iva: number;  // impuesto liquidado (absoluto)
}

export interface IvaDigitalCompraRow {
  fecha: Date;
  tipoComprobante: string; // FACTURA_A | NOTA_CREDITO_B | ...
  numero: string;          // "0001-00012345"
  cuitProveedor: string;
  denominacion: string;
  totalOperacion: number;     // total del comprobante (absoluto)
  noGravado: number;          // conceptos que no integran el neto gravado
  exento: number;             // operaciones exentas
  percepcionIva: number;
  percepcionNacional: number; // otras percepciones de impuestos nacionales
  percepcionIIBB: number;
  percepcionMunicipal: number;
  impuestosInternos: number;
  moneda: string;             // ARS | USD
  tipoCambio: number;
  creditoFiscal: number;      // crédito fiscal computable (suma de IVA, absoluto)
  otrosTributos: number;
  alicuotas: IvaDigitalAlicuota[];
}

// Código de comprobante ARCA según tipo interno.
const COMPROBANTE_CODE: Record<string, number> = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
};

// Código de alícuota de IVA ARCA.
const ALICUOTA_CODE: Record<string, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

const MONEDA_CODE: Record<string, string> = {
  ARS: 'PES',
  USD: 'DOL',
};

/** Importe → entero de centavos, valor absoluto, padded a `len`. */
function money(value: number, len: number): string {
  const cents = Math.round(Math.abs(value || 0) * 100);
  return String(cents).padStart(len, '0').slice(-len);
}

/** Entero con padding de ceros a la izquierda. */
function int(value: number, len: number): string {
  return String(Math.max(0, Math.trunc(value || 0))).padStart(len, '0').slice(-len);
}

/** Texto alfanumérico: sin acentos, mayúsculas, padded a la derecha con espacios. */
function text(value: string, len: number): string {
  const clean = (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, ' ')
    .slice(0, len);
  return clean.padEnd(len, ' ');
}

/** Solo dígitos, padded a la izquierda con ceros. */
function digits(value: string, len: number): string {
  return (value || '').replace(/\D/g, '').padStart(len, '0').slice(-len);
}

/** Tipo de cambio con 6 decimales implícitos (10 posiciones). */
function exchange(value: number): string {
  const v = Math.round((value || 1) * 1_000_000);
  return String(v).padStart(10, '0').slice(-10);
}

function comprobanteCode(tipo: string): number {
  return COMPROBANTE_CODE[tipo] ?? 1;
}

function alicuotaCode(rate: number): number {
  // Normaliza p.ej. 10.50 → "10.5"
  const key = String(Number(rate));
  return ALICUOTA_CODE[key] ?? 5;
}

/** Separa "PV-Numero" → { pv, nro } (solo dígitos). */
function splitNumero(numero: string): { pv: string; nro: string } {
  const parts = (numero || '').split('-');
  if (parts.length >= 2) {
    return { pv: parts[0], nro: parts.slice(1).join('') };
  }
  return { pv: '', nro: numero || '' };
}

function fechaAfip(d: Date): string {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Una línea del archivo de COMPROBANTES (325 posiciones). */
function buildCbteLine(row: IvaDigitalCompraRow): string {
  const { pv, nro } = splitNumero(row.numero);
  const tieneAlicuotas = row.alicuotas.length > 0;
  const codOperacion = tieneAlicuotas ? '0' : 'N';

  const line =
    fechaAfip(row.fecha) +                          // 1-8   Fecha
    int(comprobanteCode(row.tipoComprobante), 3) +  // 9-11  Tipo
    digits(pv, 5) +                                 // 12-16 Punto de venta
    digits(nro, 20) +                               // 17-36 Número
    ' '.repeat(16) +                                // 37-52 Despacho de importación
    '80' +                                          // 53-54 Cód. documento (80=CUIT)
    digits(row.cuitProveedor, 20) +                 // 55-74 Identificación del vendedor
    text(row.denominacion, 30) +                    // 75-104 Denominación
    money(row.totalOperacion, 15) +                 // 105-119 Importe total
    money(row.noGravado, 15) +                      // 120-134 No gravado
    money(row.exento, 15) +                         // 135-149 Exento
    money(row.percepcionIva, 15) +                  // 150-164 Perc./pagos a cta. IVA
    money(row.percepcionNacional, 15) +             // 165-179 Perc. otros imp. nacionales
    money(row.percepcionIIBB, 15) +                 // 180-194 Perc. IIBB
    money(row.percepcionMunicipal, 15) +            // 195-209 Perc. municipales
    money(row.impuestosInternos, 15) +              // 210-224 Impuestos internos
    (MONEDA_CODE[row.moneda] ?? 'PES') +            // 225-227 Moneda
    exchange(row.tipoCambio) +                      // 228-237 Tipo de cambio
    int(row.alicuotas.length, 1) +                  // 238 Cantidad de alícuotas
    codOperacion +                                  // 239 Código de operación
    money(row.creditoFiscal, 15) +                  // 240-254 Crédito fiscal computable
    money(row.otrosTributos, 15) +                  // 255-269 Otros tributos
    '0'.repeat(11) +                                // 270-280 CUIT emisor/corredor
    ' '.repeat(30) +                                // 281-310 Denominación emisor/corredor
    money(0, 15);                                   // 311-325 IVA comisión

  return line;
}

/** Líneas del archivo de ALÍCUOTAS (84 posiciones) — una por alícuota. */
function buildAlicuotaLines(row: IvaDigitalCompraRow): string[] {
  const { pv, nro } = splitNumero(row.numero);
  return row.alicuotas.map((a) =>
    int(comprobanteCode(row.tipoComprobante), 3) + // 1-3   Tipo
    digits(pv, 5) +                                // 4-8   Punto de venta
    digits(nro, 20) +                              // 9-28  Número
    '80' +                                         // 29-30 Cód. documento
    digits(row.cuitProveedor, 20) +               // 31-50 Identificación del vendedor
    money(a.neto, 15) +                            // 51-65 Neto gravado
    int(alicuotaCode(a.rate), 4) +                // 66-69 Alícuota
    money(a.iva, 15)                               // 70-84 Impuesto liquidado
  );
}

export interface IvaDigitalFiles {
  cbte: string;
  alicuotas: string;
}

/** Genera ambos archivos a partir de las filas del período. */
export function buildIvaDigitalCompras(rows: IvaDigitalCompraRow[]): IvaDigitalFiles {
  const cbteLines: string[] = [];
  const alicLines: string[] = [];

  for (const row of rows) {
    cbteLines.push(buildCbteLine(row));
    alicLines.push(...buildAlicuotaLines(row));
  }

  return {
    cbte: cbteLines.join('\r\n'),
    alicuotas: alicLines.join('\r\n'),
  };
}
