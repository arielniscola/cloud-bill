import * as XLSX from 'xlsx';

// Convierte un archivo Excel (.xlsx/.xlsm/.xls) a un CSV con encabezados canónicos
// que el backend de importación ya entiende. Para productos aplica el mapeo de las
// columnas del archivo "FORMULARIO PRUEBA" (hoja "BASE DE DATOS").

export type ImportEntity = 'products' | 'customers' | 'suppliers' | 'bancos';

const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

// target canónico -> posibles encabezados (normalizados) en el archivo
const PRODUCT_FIELDS: { key: string; aliases: string[] }[] = [
  { key: 'sku',           aliases: ['codart', 'sku', 'codigo', 'codigoarticulo', 'codigodearticulo'] },
  { key: 'nombre',        aliases: ['desart', 'nombre', 'name', 'descripcioncorta'] },
  { key: 'costo',         aliases: ['costoars', 'costo', 'cost'] },
  { key: 'precio',        aliases: ['preciosivaars', 'precio', 'price', 'precioventa', 'preciosiva'] },
  { key: 'preciousd',     aliases: ['preciosivausd', 'preciousd', 'salepriceusd', 'precioventausd'] },
  { key: 'iva',           aliases: ['iva', 'taxrate', 'tasaiva', 'alicuota', 'alicuotaiva'] },
  { key: 'unidad',        aliases: ['medidakgltun', 'medida', 'unidad', 'unit'] },
  { key: 'codigobarras',  aliases: ['codigobarras', 'codigodebarras', 'barcode', 'ean'] },
  { key: 'rubro',         aliases: ['rubro'] },
  { key: 'superrubro',    aliases: ['superrubro', 'rubropadre'] },
  { key: 'proveedor',     aliases: ['proveedor', 'supplier'] },
  { key: 'descripcion',   aliases: ['descripcionlarga', 'descripcion', 'description'] },
  { key: 'notasinternas', aliases: ['codprov', 'codigoproveedor', 'notasinternas', 'internalnotes'] },
];

const PRODUCT_CANON_ORDER = [
  'sku', 'nombre', 'costo', 'precio', 'preciousd', 'iva',
  'unidad', 'codigobarras', 'rubro', 'superrubro', 'proveedor', 'descripcion', 'notasinternas',
];

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// Elige la hoja de datos: prioriza "BASE DE DATOS", luego la primera no vacía.
function pickSheetName(wb: XLSX.WorkBook): string {
  const preferred = wb.SheetNames.find((n) => norm(n) === norm('BASE DE DATOS'));
  const ordered = preferred
    ? [preferred, ...wb.SheetNames.filter((n) => n !== preferred)]
    : wb.SheetNames;
  for (const n of ordered) {
    const ws = wb.Sheets[n];
    if (ws && ws['!ref']) return n;
  }
  return wb.SheetNames[0];
}

export interface ExcelToCsvResult {
  csv: string;
  sheetName: string;
  rowCount: number;
}

export async function excelFileToCsv(file: File, entity: ImportEntity): Promise<ExcelToCsvResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = pickSheetName(wb);
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) throw new Error('La hoja seleccionada está vacía');

  // Clientes / proveedores: el archivo ya suele venir con encabezados simples → CSV directo.
  if (entity !== 'products') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const lines = csv.split('\n').filter((l) => l.trim()).length;
    return { csv, sheetName, rowCount: Math.max(lines - 1, 0) };
  }

  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (aoa.length < 2) throw new Error('La hoja no tiene filas de datos');

  const headerRow = (aoa[0] as unknown[]).map(norm);
  const idx: Record<string, number> = {};
  for (const f of PRODUCT_FIELDS) {
    const i = headerRow.findIndex((h) => f.aliases.includes(h));
    if (i >= 0) idx[f.key] = i;
  }
  if (idx.sku === undefined) {
    throw new Error(`No se encontró la columna de código (Cod art / SKU) en la hoja "${sheetName}"`);
  }

  const get = (row: unknown[], key: string): string =>
    idx[key] !== undefined ? String(row[idx[key]] ?? '').trim() : '';

  const out: string[] = [PRODUCT_CANON_ORDER.join(',')];
  let count = 0;
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[];
    const sku = get(row, 'sku');
    if (!sku) continue;

    let iva = toNum(get(row, 'iva'));
    if (iva !== null && iva > 0 && iva <= 1) iva = iva * 100; // fracción → %
    const costo = toNum(get(row, 'costo'));
    const precio = toNum(get(row, 'precio'));
    const usd = toNum(get(row, 'preciousd'));

    const rec: Record<string, string> = {
      sku,
      nombre:        get(row, 'nombre'),
      costo:         costo !== null ? String(round2(costo)) : '',
      precio:        precio !== null ? String(round2(precio)) : '',
      preciousd:     usd !== null && usd > 0 ? String(round2(usd)) : '',
      iva:           iva !== null ? String(round2(iva)) : '',
      unidad:        get(row, 'unidad').toUpperCase(),
      codigobarras:  get(row, 'codigobarras'),
      rubro:         get(row, 'rubro'),
      superrubro:    get(row, 'superrubro'),
      proveedor:     get(row, 'proveedor'),
      descripcion:   get(row, 'descripcion'),
      notasinternas: get(row, 'notasinternas'),
    };
    out.push(PRODUCT_CANON_ORDER.map((k) => csvEscape(rec[k])).join(','));
    count++;
  }

  if (count === 0) throw new Error('No se encontraron productos con código en la hoja');
  return { csv: out.join('\n'), sheetName, rowCount: count };
}
