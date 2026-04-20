import * as XLSX from 'xlsx';

export interface ExcelColumn<T> {
  header: string;
  key: keyof T;
  /** Approx column width in characters */
  width?: number;
  /** Format applied before export */
  format?: 'currency' | 'number' | 'percent' | 'date';
}

/**
 * Generates and downloads an .xlsx file from an array of objects.
 * Column headers are written in row 1; data starts at row 2.
 */
export function exportToExcel<T extends Record<string, unknown>>(
  filename: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  data: T[],
  totals?: Partial<Record<keyof T, number | string>>,
): void {
  const headerRow = columns.map((c) => c.header);

  const dataRows = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      if (val === null || val === undefined) return '';
      if (col.format === 'currency' || col.format === 'number' || col.format === 'percent') {
        return typeof val === 'string' ? parseFloat(val) || 0 : Number(val);
      }
      return val;
    }),
  );

  const aoa: unknown[][] = [headerRow, ...dataRows];

  if (totals) {
    const totalRow = columns.map((col) => {
      const v = totals[col.key];
      return v !== undefined ? v : '';
    });
    aoa.push(totalRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = columns.map((col) => ({ wch: col.width ?? Math.max(col.header.length + 2, 12) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
