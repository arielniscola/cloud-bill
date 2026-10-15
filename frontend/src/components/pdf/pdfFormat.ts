import { StyleSheet, Font } from '@react-pdf/renderer';
import { TAX_CONDITIONS, PAYMENT_METHODS } from '../../utils/constants';

// Línea visual "Clásico refinado" de los comprobantes A4 (factura, NN, remito,
// recibo, OP): tinta negra, filetes finos, una sola franja de acento bajo el
// encabezado, etiquetas en gris alineadas en columnas y números de comprobante
// en monoespaciada. Unidades en pt (A4 = 595 × 842).

// IBM Plex (OFL) servida desde /fonts/pdf. El test de render en Node fija
// `globalThis.__PDF_FONT_BASE__` con la ruta local de esos archivos.
const FONT_BASE: string = (globalThis as { __PDF_FONT_BASE__?: string }).__PDF_FONT_BASE__ ?? '/fonts/pdf/';

Font.register({
  family: 'Plex',
  fonts: [
    { src: `${FONT_BASE}ibm-plex-sans-latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${FONT_BASE}ibm-plex-sans-latin-500-normal.ttf`, fontWeight: 500 },
    { src: `${FONT_BASE}ibm-plex-sans-latin-600-normal.ttf`, fontWeight: 600 },
    { src: `${FONT_BASE}ibm-plex-sans-latin-700-normal.ttf`, fontWeight: 700 },
  ],
});
Font.register({
  family: 'PlexMono',
  fonts: [
    { src: `${FONT_BASE}ibm-plex-mono-latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${FONT_BASE}ibm-plex-mono-latin-500-normal.ttf`, fontWeight: 500 },
  ],
});

// Sin guiones de corte: react-pdf parte palabras ("SO-CIEDAD") por defecto.
Font.registerHyphenationCallback((word) => [word]);

export const INK = '#161616';
export const LABEL = '#555555';
export const SOFT = '#333333';
export const HAIR = '#e3e3e3';
export const PLACEHOLDER = '#9a9a9a';
export const ACCENT = '#3f8f1a';
/** Alias que usan las plantillas. */
export const DARK = INK;
export const GRAY = LABEL;

export const ps = StyleSheet.create({
  page: {
    fontFamily: 'Plex', fontSize: 9, lineHeight: 1.35, color: INK,
    paddingTop: 30, paddingHorizontal: 33, paddingBottom: 27,
  },
  row: { flexDirection: 'row' },
  label: { color: LABEL },
  bold: { fontWeight: 600 },
  mono: { fontFamily: 'PlexMono', fontSize: 8.25 },
  accentRule: { height: 2.25, backgroundColor: ACCENT, marginTop: 10 },
  watermark: {
    position: 'absolute', top: 330, left: 80, fontSize: 80, fontWeight: 700,
    color: '#e6e6e6', transform: 'rotate(-35deg)',
  },
  // Encabezado
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerSide: { flex: 1 },
  issuerName: { fontSize: 11.25, fontWeight: 700, letterSpacing: 0.15 },
  issuerLine: { color: SOFT },
  logo: { maxWidth: 150, maxHeight: 48, objectFit: 'contain', marginBottom: 7 },
  // Espacio fijo para el logo (factura, recibo, orden de pago), del tamaño del
  // de los modelos: el encabezado queda igual haya o no logo cargado.
  logoSlot: { width: 195, height: 70, marginBottom: 6, justifyContent: 'center', alignItems: 'flex-start' },
  logoInSlot: { maxWidth: 195, maxHeight: 70, objectFit: 'contain' },
  letterBox: {
    width: 45, height: 43.5, borderWidth: 1.1, borderColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  letter: { fontSize: 31, fontWeight: 500, lineHeight: 1 },
  letterCaption: { fontSize: 7.5, marginTop: 3, letterSpacing: 0.4, textAlign: 'center' },
  letterStem: { width: 1.1, height: 48, backgroundColor: INK, marginTop: 3 },
  docTitle: { fontSize: 15, fontWeight: 600, letterSpacing: 0.4, lineHeight: 1.2, marginBottom: 1.5 },
  docNumber: { fontFamily: 'PlexMono', fontSize: 11.25, marginTop: 1 },
  kicker: { fontSize: 7.5, letterSpacing: 1.1, color: LABEL, marginTop: 5 },
  // Pares etiqueta / valor
  kv: { flexDirection: 'row', marginBottom: 1.5 },
  // Tablas
  tableHead: {
    flexDirection: 'row', borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: INK,
    paddingVertical: 3.5, paddingHorizontal: 3,
  },
  th: { fontSize: 7.9, fontWeight: 600, letterSpacing: 0.45, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: HAIR },
  // Título de sección con filete debajo ("FORMA DE PAGO")
  sectionTitle: {
    fontSize: 7.9, fontWeight: 600, letterSpacing: 0.45, textTransform: 'uppercase',
    borderBottomWidth: 0.75, borderBottomColor: INK, paddingBottom: 2.5,
  },
  box: { borderWidth: 0.75, borderColor: INK },
  totalLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderTopWidth: 1.1, borderTopColor: INK, marginTop: 3, paddingTop: 4.5,
  },
  signLine: { width: 165, borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 4, alignItems: 'center' },
  // Pie fijo: con `top` y no `bottom`, porque con un espaciador flexGrow en la
  // página react-pdf calcula mal `bottom` y lo manda fuera de la hoja.
  footer: {
    position: 'absolute', left: 33, right: 33, top: 806, flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 0.75, borderTopColor: '#c8c8c8', paddingTop: 4,
  },
  footerText: { fontSize: 7.9, color: LABEL },
});

// ─── Formatos ──────────────────────────────────────────────────────────────

export function fmtMoney(value: number | string | null | undefined, currency: string = 'ARS'): string {
  const n = Number(value) || 0;
  const sym = currency === 'USD' ? 'U$S ' : '$ ';
  return `${sym}${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Importe sin símbolo de moneda (columnas de tablas). */
export function fmtNum(value: number | string | null | undefined): string {
  return (Number(value) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtQty(value: number | string): string {
  return (Number(value) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  // 'YYYY-MM-DD' (sin hora): se toma tal cual, sin pasar por zona horaria.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Fecha de impresión (hoy, en hora local). */
export function todayText(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function fmtCuit(cuit: string | null | undefined): string {
  if (!cuit) return '';
  const c = cuit.replace(/\D/g, '');
  if (c.length === 11) return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  return cuit;
}

export function fmtCode(code: number | null | undefined, pad = 5): string {
  return code ? String(code).padStart(pad, '0') : '';
}

export function taxConditionText(raw: string | null | undefined): string {
  if (!raw) return '';
  return ((TAX_CONDITIONS as Record<string, string>)[raw] ?? raw.replace(/_/g, ' ')).toUpperCase();
}

/** Condición IVA en mayúscula inicial ("Responsable Inscripto"). */
export function taxConditionTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return (TAX_CONDITIONS as Record<string, string>)[raw] ?? raw.replace(/_/g, ' ');
}

/** Condición de venta en mayúscula inicial ("Contado", "Cuenta corriente", "30 días"). */
export function saleConditionTitle(saleCondition?: string | null, paymentTerms?: string | null): string {
  if (paymentTerms) return paymentTerms.charAt(0).toUpperCase() + paymentTerms.slice(1);
  return saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta corriente' : 'Contado';
}

/** Abreviatura de condición IVA usada en el modelo NN (RI / MT / EX / CF). */
export function taxConditionShort(raw: string | null | undefined): string {
  switch (raw) {
    case 'RESPONSABLE_INSCRIPTO': return 'RI';
    case 'MONOTRIBUTISTA': return 'MT';
    case 'EXENTO': return 'EX';
    case 'CONSUMIDOR_FINAL': return 'CF';
    default: return raw ?? '';
  }
}

export function saleConditionText(saleCondition?: string | null, paymentTerms?: string | null): string {
  if (paymentTerms) return paymentTerms.toUpperCase();
  return saleCondition === 'CUENTA_CORRIENTE' ? 'CUENTA CORRIENTE' : 'CONTADO';
}

export function paymentMethodText(method: string | null | undefined): string {
  if (!method) return '';
  return ((PAYMENT_METHODS as Record<string, string>)[method] ?? method).toUpperCase();
}

/** Tipo de comprobante abreviado para las tablas de "comprobantes cancelados". */
export function docTypeShort(type: string | null | undefined): string {
  if (!type) return '';
  const letter = /_(A|B|C|M|E)$/.exec(type)?.[1] ?? '';
  if (type.startsWith('FACTURA')) return `FAC ${letter}`.trim();
  if (type.startsWith('NOTA_CREDITO')) return `NC ${letter}`.trim();
  if (type.startsWith('NOTA_DEBITO')) return `ND ${letter}`.trim();
  return type;
}

/** "UN" → "UNIDADES" como en el modelo de remito; el resto se muestra tal cual. */
export function unitText(unit: string | null | undefined): string {
  const u = (unit ?? 'UN').toUpperCase();
  if (u === 'UN' || u === 'U' || u === 'UNIDAD') return 'UNIDADES';
  return u;
}
