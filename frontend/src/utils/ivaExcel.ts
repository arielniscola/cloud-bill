import * as XLSX from 'xlsx';
import type { IvaComprasRow, IvaVentasRow } from '../types';

// ── Mapeo de tipos de comprobante ───────────────────────────────────────────
const TYPE_ABBR: Record<string, string> = {
  FACTURA_A: 'FA', FACTURA_B: 'FB', FACTURA_C: 'FC',
  NOTA_CREDITO_A: 'NCA', NOTA_CREDITO_B: 'NCB', NOTA_CREDITO_C: 'NCC',
  NOTA_DEBITO_A: 'NDA', NOTA_DEBITO_B: 'NDB', NOTA_DEBITO_C: 'NDC',
};
const TYPE_FULL: Record<string, string> = {
  FACTURA_A: 'FACTURA A', FACTURA_B: 'FACTURA B', FACTURA_C: 'FACTURA C',
  NOTA_CREDITO_A: 'NOTA DE CREDITO A', NOTA_CREDITO_B: 'NOTA DE CREDITO B', NOTA_CREDITO_C: 'NOTA DE CREDITO C',
  NOTA_DEBITO_A: 'NOTA DE DEBITO A', NOTA_DEBITO_B: 'NOTA DE DEBITO B', NOTA_DEBITO_C: 'NOTA DE DEBITO C',
};
const abbr = (t: string) => TYPE_ABBR[t] ?? t;
const full = (t: string) => TYPE_FULL[t] ?? t;

const CURRENCY_FMT = '"$"#,##0.00';
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-AR');

// Aplica formato moneda a toda celda numérica de la hoja (las alícuotas van como texto).
function applyCurrencyFormat(ws: XLSX.WorkSheet) {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = CURRENCY_FMT;
    }
  }
}

// ── Libro IVA Compras ───────────────────────────────────────────────────────
function buildComprobantesCompras(rows: IvaComprasRow[]): XLSX.WorkSheet {
  const aoa: any[][] = [];
  aoa.push(['Fecha', 'TC.', 'Número', 'Proveedor', 'CUIT', 'Neto', 'Exento', 'Iva', 'P. Iva', 'P. I. Br.', 'Total']);
  for (const r of rows) {
    aoa.push([
      fmtDate(r.fecha), abbr(r.tipo), r.numero, r.proveedor, r.cuitProveedor,
      r.neto || '', r.exento || '', r.iva || '', r.percepcionIva || '', r.percepcionIIBB || '', r.total,
    ]);
  }

  // Bloque 1: Totales de IVA Discriminados (por tipo de comprobante + alícuota)
  aoa.push([]);
  aoa.push(['Totales de IVA Discriminados', '', '', '', 'Neto', 'Porcentaje IVA', 'Total IVA']);
  const byType = new Map<string, Map<number, { neto: number; iva: number }>>();
  for (const r of rows) {
    const m = byType.get(r.tipo) ?? new Map();
    for (const a of r.alicuotas) {
      const cur = m.get(a.rate) ?? { neto: 0, iva: 0 };
      cur.neto += a.neto; cur.iva += a.iva;
      m.set(a.rate, cur);
    }
    byType.set(r.tipo, m);
  }
  for (const [tipo, m] of byType) {
    for (const [rate, v] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
      aoa.push([full(tipo), '', '', '', v.neto, String(rate), v.iva]);
    }
  }

  // Bloque 2: Totales por Alícuota (general)
  aoa.push([]);
  aoa.push(['Totales por Alícuota', '', '', '', 'Neto', 'Porcentaje IVA', 'Total IVA']);
  const byRate = new Map<number, { neto: number; iva: number }>();
  for (const r of rows) {
    for (const a of r.alicuotas) {
      const cur = byRate.get(a.rate) ?? { neto: 0, iva: 0 };
      cur.neto += a.neto; cur.iva += a.iva;
      byRate.set(a.rate, cur);
    }
  }
  for (const [rate, v] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    aoa.push([`Alícuota ${rate}%`, '', '', '', v.neto, String(rate), v.iva]);
  }

  // Totales generales
  const sum = (f: (r: IvaComprasRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  aoa.push([]);
  aoa.push(['TOTALES', '', '', '', sum((r) => r.neto), sum((r) => r.exento), sum((r) => r.iva),
    sum((r) => r.percepcionIva), sum((r) => r.percepcionIIBB), sum((r) => r.total)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 18 }, { wch: 38 }, { wch: 15 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 16 }];
  applyCurrencyFormat(ws);
  return ws;
}

function buildItemsCompras(rows: IvaComprasRow[]): XLSX.WorkSheet {
  const aoa: any[][] = [['F.Comp.', 'T. Comp.', 'N.Comp.', 'Proveedor', 'Cuit', 'Artículo', 'Super Rubro', 'P. Total']];
  for (const r of rows) {
    for (const it of r.items) {
      aoa.push([fmtDate(r.fecha), abbr(r.tipo), r.numero, r.proveedor, r.cuitProveedor, it.description, it.superRubro || 'OTROS', it.total]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 38 }, { wch: 15 }, { wch: 48 }, { wch: 16 }, { wch: 16 }];
  applyCurrencyFormat(ws);
  return ws;
}

// ── Libro IVA Ventas ────────────────────────────────────────────────────────
function buildComprobantesVentas(rows: IvaVentasRow[]): XLSX.WorkSheet {
  const aoa: any[][] = [];
  aoa.push(['Fecha', 'TC.', 'Número', 'Cliente', 'CUIT', 'Neto', 'Exento', 'Iva', 'Total']);
  for (const r of rows) {
    aoa.push([fmtDate(r.fecha), abbr(r.tipo), r.numero, r.cliente, r.cuitCliente, r.neto || '', r.exento || '', r.iva || '', r.total]);
  }

  aoa.push([]);
  aoa.push(['Totales de IVA Discriminados', '', '', '', 'Neto', 'Porcentaje IVA', 'Total IVA']);
  const byType = new Map<string, Map<number, { neto: number; iva: number }>>();
  for (const r of rows) {
    const m = byType.get(r.tipo) ?? new Map();
    for (const a of r.alicuotas) {
      const cur = m.get(a.rate) ?? { neto: 0, iva: 0 };
      cur.neto += a.neto; cur.iva += a.iva;
      m.set(a.rate, cur);
    }
    byType.set(r.tipo, m);
  }
  for (const [tipo, m] of byType) {
    for (const [rate, v] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
      aoa.push([full(tipo), '', '', '', v.neto, String(rate), v.iva]);
    }
  }

  aoa.push([]);
  aoa.push(['Totales por Alícuota', '', '', '', 'Neto', 'Porcentaje IVA', 'Total IVA']);
  const byRate = new Map<number, { neto: number; iva: number }>();
  for (const r of rows) {
    for (const a of r.alicuotas) {
      const cur = byRate.get(a.rate) ?? { neto: 0, iva: 0 };
      cur.neto += a.neto; cur.iva += a.iva;
      byRate.set(a.rate, cur);
    }
  }
  for (const [rate, v] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    aoa.push([`Alícuota ${rate}%`, '', '', '', v.neto, String(rate), v.iva]);
  }

  const sum = (f: (r: IvaVentasRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  aoa.push([]);
  aoa.push(['TOTALES', '', '', '', sum((r) => r.neto), sum((r) => r.exento), sum((r) => r.iva), sum((r) => r.total)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 18 }, { wch: 38 }, { wch: 15 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  applyCurrencyFormat(ws);
  return ws;
}

function buildItemsVentas(rows: IvaVentasRow[]): XLSX.WorkSheet {
  const aoa: any[][] = [['F.Comp.', 'T. Comp.', 'N.Comp.', 'Cliente', 'Cuit', 'Artículo', 'Super Rubro', 'P. Total']];
  for (const r of rows) {
    for (const it of r.items) {
      aoa.push([fmtDate(r.fecha), abbr(r.tipo), r.numero, r.cliente, r.cuitCliente, it.description, it.superRubro || 'OTROS', it.total]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 38 }, { wch: 15 }, { wch: 48 }, { wch: 16 }, { wch: 16 }];
  applyCurrencyFormat(ws);
  return ws;
}

// ── API pública ─────────────────────────────────────────────────────────────
export function exportIvaComprasExcel(rows: IvaComprasRow[], year: number, month: number) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildComprobantesCompras(rows), 'COMPROBANTES');
  XLSX.utils.book_append_sheet(wb, buildItemsCompras(rows), 'RUBRO');
  XLSX.writeFile(wb, `IVA_COMPRAS_${MONTHS[month - 1].toUpperCase()}${year}.xlsx`);
}

export function exportIvaVentasExcel(rows: IvaVentasRow[], year: number, month: number) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildComprobantesVentas(rows), 'COMPROBANTES');
  XLSX.utils.book_append_sheet(wb, buildItemsVentas(rows), 'RUBRO');
  XLSX.writeFile(wb, `IVA_VENTAS_${MONTHS[month - 1].toUpperCase()}${year}.xlsx`);
}
