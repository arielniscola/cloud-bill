/**
 * Validaciones del receptor que ARCA rechaza igual (10015 / 10243), hechas
 * antes de pedir el CAE para devolver un mensaje que diga qué corregir.
 */

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** CUIT/CUIL de 11 dígitos con dígito verificador (módulo 11) correcto. */
export function isValidCuit(raw: string | null | undefined): boolean {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  const sum = CUIT_WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod;
  // mod === 10 no tiene dígito válido: ARCA asigna otro prefijo (p. ej. 23).
  return expected !== 10 && expected === Number(digits[10]);
}

/** Clase del comprobante (A/B/C) a partir del tipo: FACTURA_B, NOTA_CREDITO_A… */
export function invoiceClass(type: string): 'A' | 'B' | 'C' | null {
  const letter = type.slice(-2);
  return letter === '_A' ? 'A' : letter === '_B' ? 'B' : letter === '_C' ? 'C' : null;
}

// Tabla FEParamGetCondicionIvaReceptor (RG 5616): RI y monotributo reciben
// A/M/C; exento y consumidor final, B/C. Desde la RG 5003 un RI le factura A
// al monotributista.
const CLASSES_BY_CONDITION: Record<string, Array<'A' | 'B' | 'C'>> = {
  RESPONSABLE_INSCRIPTO: ['A', 'C'],
  MONOTRIBUTISTA: ['A', 'C'],
  EXENTO: ['B', 'C'],
  CONSUMIDOR_FINAL: ['B', 'C'],
};

const CONDITION_LABEL: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTISTA: 'Monotributista',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
};

/** Devuelve el motivo por el que ARCA rechazaría al receptor, o null si está bien. */
export function receptorProblemForArca(
  type: string,
  customer: { taxId: string | null; taxCondition: string } | null | undefined
): string | null {
  if (!customer) return null;
  const condition = customer.taxCondition;
  const cls = invoiceClass(type);
  const allowed = CLASSES_BY_CONDITION[condition];
  if (cls && allowed && !allowed.includes(cls)) {
    const label = CONDITION_LABEL[condition] ?? condition;
    return `Un cliente ${label} no puede recibir un comprobante clase ${cls}: corresponde ${allowed.join(' o ')}. Cambiá el tipo de comprobante o la condición de IVA del cliente.`;
  }
  // Con condición distinta de Consumidor Final se informa el CUIT (DocTipo 80).
  if (condition !== 'CONSUMIDOR_FINAL' && !isValidCuit(customer.taxId)) {
    return `El CUIT del cliente (${customer.taxId || 'vacío'}) no es válido: el dígito verificador no coincide. Corregilo en la ficha del cliente.`;
  }
  return null;
}
