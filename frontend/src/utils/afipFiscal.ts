/**
 * Utilidades fiscales ARCA/AFIP compartidas por todos los formatos de impresión
 * (ticket 80mm, PDF A4). Antes la lógica del QR vivía duplicada dentro de
 * InvoiceDetailPage; acá queda una sola fuente de verdad.
 */
import type { Invoice, InvoiceType } from '../types/invoice.types';

/** Códigos de comprobante de ARCA (RG 1415, tabla de tipos). */
export const AFIP_CBTE_TYPE_CODES: Record<InvoiceType, number> = {
  FACTURA_A: 1,       NOTA_DEBITO_A: 2,  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,       NOTA_DEBITO_B: 7,  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,      NOTA_DEBITO_C: 12, NOTA_CREDITO_C: 13,
};

export function afipTypeCode(type: InvoiceType): number {
  return AFIP_CBTE_TYPE_CODES[type] ?? 6;
}

/** Letra del comprobante (A / B / C) — la que va en el recuadro del encabezado. */
export function invoiceLetter(type: InvoiceType): string {
  return type.slice(-1);
}

/** Nombre corto: FACTURA / NOTA DE CREDITO / NOTA DE DEBITO. */
export function invoiceTypeName(type: InvoiceType): string {
  if (type.startsWith('NOTA_CREDITO')) return 'NOTA DE CREDITO';
  if (type.startsWith('NOTA_DEBITO'))  return 'NOTA DE DEBITO';
  return 'FACTURA';
}

/**
 * Número con formato ARCA `0008-00035881` (4 dígitos de punto de venta +
 * 8 del comprobante). Cae al `number` interno si todavía no hay CAE.
 */
export function afipInvoiceNumber(invoice: Pick<Invoice, 'number' | 'afipPtVenta' | 'afipCbtNum'>): string {
  if (invoice.afipPtVenta && invoice.afipCbtNum) {
    return `${String(invoice.afipPtVenta).padStart(4, '0')}-${String(invoice.afipCbtNum).padStart(8, '0')}`;
  }
  return invoice.number;
}

// ─── QR de ARCA ────────────────────────────────────────────────────────────

/**
 * Arma la URL del QR de ARCA (RG 4892). El payload va en base64 dentro de `?p=`.
 * Devuelve null si al comprobante le falta el CAE o el CUIT del emisor.
 */
export function buildAfipQrUrl(
  invoice: Invoice,
  issuerCuit: string | null | undefined,
  fallbackSalePoint?: number | null,
): string | null {
  if (!invoice.cae || !issuerCuit) return null;

  const payload = {
    ver: 1,
    fecha: invoice.date.slice(0, 10),
    cuit: Number(issuerCuit.replace(/\D/g, '')),
    ptoVta: invoice.afipPtVenta ?? fallbackSalePoint ?? 0,
    tipoCmp: afipTypeCode(invoice.type),
    nroCmp: invoice.afipCbtNum ?? 0,
    importe: invoice.total,
    moneda: invoice.currency === 'USD' ? 'DOL' : 'PES',
    ctz: invoice.currency === 'USD' ? (invoice.exchangeRate ?? 1) : 1,
    tipoDocRec: invoice.customer?.taxId ? 80 : 99,
    nroDocRec: Number(invoice.customer?.taxId?.replace(/\D/g, '') || 0),
    tipoCodAut: 'E',
    codAut: Number(invoice.cae),
  };

  // btoa sólo maneja latin1; el payload es ASCII puro, pero encodeURIComponent
  // + unescape lo deja a salvo de cualquier acento que se cuele.
  const json = JSON.stringify(payload);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `https://www.afip.gob.ar/fe/qr/?p=${encoded}`;
}

// ─── Código de barras del CAE (Interleaved 2 of 5) ─────────────────────────

/**
 * Dígito verificador módulo 10 de ARCA:
 *   1. sumar los dígitos de posición IMPAR (1-based) y multiplicar por 3
 *   2. sumar los dígitos de posición PAR
 *   3. DV = (10 - (total % 10)) % 10
 */
export function mod10CheckDigit(digits: string): number {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) odd += d;  // posición 1-based impar
    else even += d;
  }
  const total = odd * 3 + even;
  return (10 - (total % 10)) % 10;
}

/**
 * Cadena de 40 dígitos del código de barras del CAE:
 *   CUIT(11) + tipoCbte(2) + ptoVta(4) + CAE(14) + vtoCAE(AAAAMMDD, 8) + DV(1)
 * Devuelve null si falta algún dato — el código nunca se imprime a medias.
 */
export function buildCaeBarcodeDigits(
  invoice: Invoice,
  issuerCuit: string | null | undefined,
  fallbackSalePoint?: number | null,
): string | null {
  const cuit = (issuerCuit ?? '').replace(/\D/g, '');
  const cae = (invoice.cae ?? '').replace(/\D/g, '');
  const ptoVta = invoice.afipPtVenta ?? fallbackSalePoint ?? 0;
  if (cuit.length !== 11 || cae.length !== 14 || !ptoVta || !invoice.caeExpiry) return null;

  const exp = new Date(invoice.caeExpiry);
  if (Number.isNaN(exp.getTime())) return null;
  const vto =
    `${exp.getFullYear()}` +
    `${String(exp.getMonth() + 1).padStart(2, '0')}` +
    `${String(exp.getDate()).padStart(2, '0')}`;

  const base =
    cuit +
    String(afipTypeCode(invoice.type)).padStart(2, '0') +
    String(ptoVta).padStart(4, '0') +
    cae +
    vto;

  return base + String(mod10CheckDigit(base));
}

/**
 * Patrones Interleaved 2 of 5: '0' = barra/espacio angosto, '1' = ancho.
 * Cada dígito son 5 módulos, de los cuales 2 son anchos.
 */
const ITF_PATTERNS = [
  '00110', '10001', '01001', '11000', '00101',
  '10100', '01100', '00011', '10010', '01010',
];

export interface ItfModule {
  /** true = barra negra, false = espacio blanco */
  bar: boolean;
  /** true = ancho (ratio 3:1), false = angosto */
  wide: boolean;
}

/**
 * Codifica una cadena de dígitos en Interleaved 2 of 5.
 * Requiere cantidad PAR de dígitos: los impares van en las barras y los pares
 * en los espacios, intercalados de a dos.
 */
export function encodeItf(digits: string): ItfModule[] {
  if (!/^\d+$/.test(digits)) throw new Error('ITF: sólo se aceptan dígitos');
  const data = digits.length % 2 === 0 ? digits : '0' + digits;

  const modules: ItfModule[] = [
    // Start: barra-espacio-barra-espacio, todos angostos
    { bar: true, wide: false }, { bar: false, wide: false },
    { bar: true, wide: false }, { bar: false, wide: false },
  ];

  for (let i = 0; i < data.length; i += 2) {
    const barPattern   = ITF_PATTERNS[Number(data[i])];
    const spacePattern = ITF_PATTERNS[Number(data[i + 1])];
    for (let j = 0; j < 5; j++) {
      modules.push({ bar: true,  wide: barPattern[j] === '1' });
      modules.push({ bar: false, wide: spacePattern[j] === '1' });
    }
  }

  // Stop: barra ancha, espacio angosto, barra angosta
  modules.push({ bar: true, wide: true });
  modules.push({ bar: false, wide: false });
  modules.push({ bar: true, wide: false });

  return modules;
}

// ─── Régimen de Transparencia Fiscal al Consumidor (Ley 27.743 / RG 5614) ──

export interface FiscalTransparency {
  /** ¿Corresponde imprimir el recuadro? */
  applies: boolean;
  /** ¿Se informa el importe de IVA contenido, o sólo la leyenda? */
  showAmount: boolean;
  /** IVA contenido en el total. */
  ivaContenido: number;
}

/**
 * Los comprobantes clase B y C (y sus NC/ND) emitidos a consumidor final deben
 * llevar la leyenda del Régimen de Transparencia Fiscal.
 *  - Clase B: se informa "I.V.A. Contenido $ X" (el IVA que ya está en el total).
 *  - Clase C: el emisor no discrimina IVA (monotributo/exento) → sólo la leyenda.
 *  - Clase A: no corresponde, el IVA ya va discriminado.
 * Los comprobantes informales (sin validez fiscal) quedan afuera.
 */
export function fiscalTransparency(invoice: Invoice): FiscalTransparency {
  const letter = invoiceLetter(invoice.type);
  if (invoice.fiscalMode === 'INFORMAL' || letter === 'A') {
    return { applies: false, showAmount: false, ivaContenido: 0 };
  }
  if (letter === 'C') {
    return { applies: true, showAmount: false, ivaContenido: 0 };
  }
  return { applies: true, showAmount: true, ivaContenido: Number(invoice.taxAmount) || 0 };
}

export const FISCAL_TRANSPARENCY_LEGEND = 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)';
