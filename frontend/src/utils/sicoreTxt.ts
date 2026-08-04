/**
 * Archivo de importación de retenciones para SICORE (ARCA, ex AFIP).
 *
 * Es un TXT de ancho fijo, un renglón por retención practicada, de 198
 * caracteres. Se importa desde el aplicativo SICORE en el SIAp, sobre una
 * declaración jurada ya creada.
 *
 * Diseño de registro:
 *   pos    largo  campo
 *   1-2      2    Código de comprobante          (06 = orden de pago)
 *   3-12    10    Fecha de emisión del comprobante   dd/mm/aaaa
 *   13-28   16    Número del comprobante         numérico, sin guiones
 *   29-44   16    Importe del comprobante
 *   45-48    4    Código de impuesto             217 Ganancias / 767 IVA
 *   49-51    3    Código de régimen              según la actividad
 *   52       1    Código de operación            1 = retención
 *   53-66   14    Base de cálculo
 *   67-76   10    Fecha de emisión de la retención   dd/mm/aaaa
 *   77-78    2    Código de condición            01 = inscripto
 *   79       1    Retención a sujetos suspendidos    0 = no
 *   80-93   14    Importe de la retención
 *   94-99    6    Porcentaje de exclusión
 *   100-109 10    Fecha emisión del boletín      (solo con exclusión → en blanco)
 *   110-111  2    Tipo de documento del retenido     80 = CUIT
 *   112-131 20    Número de documento del retenido   CUIT sin guiones
 *   132-145 14    Número de certificado original     (solo anulaciones → ceros)
 *   146-175 30    Denominación del ordenante     ┐ solo para pagos por cuenta
 *   176      1    Acrecentamiento                │ de terceros: se generan en
 *   177-187 11    CUIT del país del retenido     │ blanco o cero.
 *   188-198 11    CUIT del ordenante             ┘
 *
 * Los importes van con coma decimal, alineados a la derecha y completados con
 * ceros. El separador decimal del aplicativo tiene que estar configurado en
 * "coma" (Herramientas → Configuración regional del SIAp) para que coincida.
 *
 * IIBB queda afuera: es un impuesto provincial y se declara por SIRCAR / ARBA /
 * AGIP, cada uno con su propio formato.
 */

import type { RetentionReportRow } from '../services/reports.service';

const COMPROBANTE_ORDEN_PAGO = '06';
const OPERACION_RETENCION    = '1';
const CONDICION_INSCRIPTO    = '01';
const TIPO_DOC_CUIT          = '80';

/** Tipos de retención que se declaran en SICORE (los provinciales no). */
export const SICORE_TYPES = ['GANANCIAS', 'IVA', 'SUSS', 'OTHER'];

export const isSicoreType = (type: string): boolean => SICORE_TYPES.includes(type);

/** Importe → "0000000001234,56" (largo fijo, coma decimal, ceros a la izquierda). */
function amountField(value: number, length: number): string {
  const fixed = Math.abs(value).toFixed(2).replace('.', ',');
  return fixed.length > length ? fixed.slice(-length) : fixed.padStart(length, '0');
}

/** "2026-08-02" → "02/08/2026". */
function dateField(iso: string): string {
  const [y, m, d] = iso.substring(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Deja solo dígitos y alinea a la derecha con ceros (números de comprobante, CUIT). */
function digitsField(value: string | null, length: number): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length > length ? digits.slice(-length) : digits.padStart(length, '0');
}

const blanks = (length: number) => ' '.repeat(length);
const zeros  = (length: number) => '0'.repeat(length);

export interface SicoreIssue {
  row:    RetentionReportRow;
  reason: string;
}

export interface SicoreBuildResult {
  /** Contenido del TXT (renglones de 198 caracteres separados por CRLF). */
  content: string;
  /** Retenciones incluidas. */
  included: RetentionReportRow[];
  /** Retenciones de régimen provincial: no se declaran en SICORE. */
  skipped: RetentionReportRow[];
  /** Retenciones que deberían ir pero les falta un dato obligatorio. */
  issues: SicoreIssue[];
}

/**
 * Arma el TXT. No excluye silenciosamente: lo que no entra vuelve en `skipped`
 * (provinciales) o en `issues` (falta un dato), para avisarle al usuario antes
 * de que suba un archivo incompleto.
 */
export function buildSicoreTxt(rows: RetentionReportRow[]): SicoreBuildResult {
  const included: RetentionReportRow[] = [];
  const skipped:  RetentionReportRow[] = [];
  const issues:   SicoreIssue[] = [];
  const lines: string[] = [];

  for (const row of rows) {
    if (!isSicoreType(row.type)) { skipped.push(row); continue; }

    if (!row.arcaRegimen)  { issues.push({ row, reason: 'sin código de régimen ARCA' }); continue; }
    if (!row.arcaImpuesto) { issues.push({ row, reason: 'sin código de impuesto ARCA' }); continue; }
    if (!row.supplierCuit || row.supplierCuit.replace(/\D/g, '').length !== 11) {
      issues.push({ row, reason: 'el proveedor no tiene CUIT válido' });
      continue;
    }

    const line =
      COMPROBANTE_ORDEN_PAGO +                        // 1-2
      dateField(row.date) +                           // 3-12
      digitsField(row.ordenPagoNumber, 16) +          // 13-28
      amountField(row.ordenPagoAmount, 16) +          // 29-44
      digitsField(row.arcaImpuesto, 4) +              // 45-48
      digitsField(row.arcaRegimen, 3) +               // 49-51
      OPERACION_RETENCION +                           // 52
      amountField(row.baseAmount, 14) +               // 53-66
      dateField(row.date) +                           // 67-76
      CONDICION_INSCRIPTO +                           // 77-78
      '0' +                                           // 79
      amountField(row.amount, 14) +                   // 80-93
      amountField(0, 6) +                             // 94-99
      blanks(10) +                                    // 100-109
      TIPO_DOC_CUIT +                                 // 110-111
      digitsField(row.supplierCuit, 20) +             // 112-131
      zeros(14) +                                     // 132-145
      blanks(30) +                                    // 146-175
      '0' +                                           // 176
      zeros(11) +                                     // 177-187
      zeros(11);                                      // 188-198

    lines.push(line);
    included.push(row);
  }

  return { content: lines.join('\r\n'), included, skipped, issues };
}

/** Dispara la descarga del TXT ya armado. */
export function downloadSicoreTxt(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
