// Importe en letras para los comprobantes impresos ("Son pesos: ...").

const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

/** 0..999 → letras ("uno" queda como tal; el apócope lo resuelve quien llama). */
function hundreds(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const rest = n % 100;
  let restText = '';
  if (rest < 30) restText = UNIDADES[rest];
  else {
    const d = Math.floor(rest / 10);
    const u = rest % 10;
    restText = u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  return [CENTENAS[c], restText].filter(Boolean).join(' ');
}

/** "uno" → "un" delante de "mil"/"millones"/el sustantivo ("veintiuno" → "veintiún"). */
function apocope(text: string): string {
  if (text.endsWith('veintiuno')) return text.slice(0, -'veintiuno'.length) + 'veintiún';
  if (text.endsWith('uno')) return text.slice(0, -1);
  return text;
}

/** Entero no negativo → letras. */
export function integerToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'cero';

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;

  if (millions > 0) {
    parts.push(millions === 1 ? 'un millón' : `${apocope(integerToWords(millions))} millones`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mil' : `${apocope(hundreds(thousands))} mil`);
  }
  if (units > 0) parts.push(hundreds(units));
  return parts.join(' ');
}

/**
 * Importe → "ciento treinta y seis mil pesos con cuarenta y seis centavos".
 * `currency` cambia el sustantivo (pesos / dólares estadounidenses).
 */
export function amountToWords(amount: number, currency: string = 'ARS'): string {
  const abs = Math.abs(Number(amount) || 0);
  const cents = Math.round(abs * 100);
  const integer = Math.floor(cents / 100);
  const decimals = cents % 100;

  const noun = currency === 'USD'
    ? (integer === 1 ? 'dólar estadounidense' : 'dólares estadounidenses')
    : (integer === 1 ? 'peso' : 'pesos');
  const intText = integer === 0 ? 'cero' : apocope(integerToWords(integer));
  // "un millón de pesos", "dos millones de pesos"
  const de = integer > 0 && integer % 1_000_000 === 0 ? ' de' : '';

  let text = `${intText}${de} ${noun}`;
  if (decimals > 0) text += ` con ${apocope(integerToWords(decimals))} ${decimals === 1 ? 'centavo' : 'centavos'}`;
  return text;
}
