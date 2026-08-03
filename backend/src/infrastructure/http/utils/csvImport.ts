// Parseo de los CSV de importación (productos, clientes, proveedores, bancos).
// Vive aparte del controller para poder testearse sin base de datos.

// Excel exporta con ";" cuando la configuración regional usa coma decimal
// (es-AR), así que el delimitador no se puede asumir. Se elige el candidato
// que más veces aparece en el encabezado.
export function detectDelimiter(headerLine: string): string {
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t']) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

// Tolerante a comillas sin escapar: una comilla solo abre un campo entrecomillado
// si es el primer carácter del campo. En el medio del texto se toma como literal,
// que es el caso de las medidas en pulgadas (`Serrucho Wembley 12" p/poda`). Con
// un parser estricto esa comilla se traga el resto de la línea y la fila se pierde.
export function parseRow(line: string, delim: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let atFieldStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes) {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else if (atFieldStart) {
        inQuotes = true;
      } else {
        current += ch;
      }
      atFieldStart = false;
    } else if (ch === delim && !inQuotes) {
      result.push(current);
      current = '';
      atFieldStart = true;
    } else {
      current += ch;
      atFieldStart = false;
    }
  }
  result.push(current);
  return result;
}

export interface ParsedCsv {
  rows: Array<Record<string, string>>;
  // índice de fila (0-based, sin contar el encabezado) -> problema estructural.
  // Se reporta como error en vez de importarse: una fila con campos de más
  // desalinea todas las columnas y guardaría datos incorrectos en silencio.
  malformed: Map<number, string>;
}

export function parseCsv(raw: string): ParsedCsv {
  // Strip UTF-8 BOM
  const text = raw.replace(/^﻿/, '');
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return { rows: [], malformed: new Map() };
  const delim = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delim).map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const rows: Array<Record<string, string>> = [];
  const malformed = new Map<number, string>();
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i], delim);
    if (values.every((v) => !v.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });
    // Que falten columnas al final es inofensivo (se completan vacías); que
    // sobren significa que hay delimitadores dentro de los datos.
    if (values.length > headers.length) {
      malformed.set(rows.length,
        `La fila tiene ${values.length} campos y el encabezado ${headers.length}. ` +
        'Suele pasar cuando los importes usan coma decimal sin comillas (ej. 1234,56). ' +
        'Guardá los números con punto decimal o entrecomillados.');
    } else if (values.length === 1 && headers.length > 1) {
      // La fila entera quedó en un solo campo: o está envuelta en comillas de
      // punta a punta, o usa otro delimitador que el del encabezado.
      malformed.set(rows.length,
        'La fila quedó en un solo campo: está entrecomillada de punta a punta o ' +
        `usa un delimitador distinto al del encabezado (${JSON.stringify(delim)}).`);
    }
    rows.push(row);
  }
  return { rows, malformed };
}

export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k];
  return '';
}

// Acepta "1234.56", "1234,56" y "1.234,56": el separador decimal es el símbolo
// que aparece más a la derecha; el otro se trata como separador de miles.
export function parseNumber(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  if (lastComma < 0) return parseFloat(s);
  if (lastDot < 0)   return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return lastComma > lastDot
    ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
    : parseFloat(s.replace(/,/g, ''));
}
