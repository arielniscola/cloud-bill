import { useState, useRef, useCallback } from 'react';
import { Upload, Download, X, CheckCircle, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Button } from '../ui';
import importService, { type ImportResult } from '../../services/import.service';
import { excelFileToCsv } from '../../utils/importExcel';

// ── Templates ──────────────────────────────────────────────────────────────

const TEMPLATES: Record<Entity, { filename: string; headers: string[]; example: string[] }> = {
  products: {
    filename: 'template_productos.csv',
    headers: ['sku', 'nombre', 'costo', 'precio', 'preciousd', 'iva', 'unidad', 'descripcion', 'codigobarras', 'rubro', 'superrubro', 'marca'],
    example: ['PROD-001', 'Producto de ejemplo', '100', '150', '12.5', '21', 'UN', 'Descripción opcional', '', 'Hortaliza Hibrida', 'Semilla', 'MarcaX'],
  },
  customers: {
    filename: 'template_clientes.csv',
    headers: ['nombre', 'cuit', 'condicioniva', 'condicionventa', 'email', 'telefono', 'direccion', 'ciudad', 'provincia', 'codigopostal'],
    example: ['Juan Pérez', '20-12345678-9', 'RI', 'CONTADO', 'juan@mail.com', '1112345678', 'Av. Corrientes 1234', 'Buenos Aires', 'CABA', '1043'],
  },
  suppliers: {
    filename: 'template_proveedores.csv',
    headers: ['nombre', 'cuit', 'condicioniva', 'email', 'telefono', 'direccion', 'ciudad', 'notas'],
    example: ['Proveedor SA', '30-12345678-9', 'RI', 'proveedor@mail.com', '1112345678', 'Av. Industrial 500', 'Córdoba', ''],
  },
};

const CONDITION_HINTS: Record<Entity, React.ReactNode> = {
  products: (
    <ul className="space-y-1 text-xs text-gray-500 dark:text-slate-400">
      <li>Acepta <span className="font-medium">Excel (.xlsx/.xlsm)</span> — lee la hoja "BASE DE DATOS"</li>
      <li><span className="font-medium">sku, nombre, costo, precio</span> — requeridos</li>
      <li><span className="font-medium">preciousd</span> — precio de venta en USD (opcional)</li>
      <li><span className="font-medium">iva</span> — % o fracción (21 o 0.21). Default: 21</li>
      <li><span className="font-medium">rubro / superrubro / marca</span> — deben existir (no se crean)</li>
      <li>Si el SKU ya existe → <span className="italic">actualiza</span> el producto</li>
    </ul>
  ),
  customers: (
    <ul className="space-y-1 text-xs text-gray-500 dark:text-slate-400">
      <li><span className="font-medium">nombre</span> — requerido</li>
      <li><span className="font-medium">condicioniva</span> — RI · Monotributista · Exento · CF (default: CF)</li>
      <li><span className="font-medium">condicionventa</span> — CONTADO o CC (default: CONTADO)</li>
      <li>Si el CUIT ya existe → <span className="italic">actualiza</span> el cliente</li>
    </ul>
  ),
  suppliers: (
    <ul className="space-y-1 text-xs text-gray-500 dark:text-slate-400">
      <li><span className="font-medium">nombre</span> — requerido</li>
      <li><span className="font-medium">condicioniva</span> — RI · Monotributista · Exento · CF (default: CF)</li>
      <li><span className="font-medium">cuit, email, telefono, direccion, ciudad, notas</span> — opcionales</li>
      <li>Si el CUIT ya existe → <span className="italic">actualiza</span> el proveedor</li>
    </ul>
  ),
};

const ENTITY_LABELS: Record<Entity, string> = {
  products:  'Productos',
  customers: 'Clientes',
  suppliers: 'Proveedores',
};

type Entity = 'products' | 'customers' | 'suppliers';

interface Props {
  entity: Entity;
  onClose: () => void;
  onSuccess: (imported: number) => void;
}

// ── CSV preview ────────────────────────────────────────────────────────────
function parsePreview(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(Boolean).slice(0, 6);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

function downloadTemplate(entity: Entity) {
  const t = TEMPLATES[entity];
  const csv = [t.headers.join(','), t.example.join(',')].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = t.filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Component ──────────────────────────────────────────────────────────────
export default function CsvImportModal({ entity, onClose, onSuccess }: Props) {
  const [dragging, setDragging]     = useState(false);
  const [csvText, setCsvText]       = useState<string | null>(null);
  const [fileName, setFileName]     = useState('');
  const [preview, setPreview]       = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [isImporting, setImporting] = useState(false);
  const [result, setResult]         = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    const isExcel = /\.(xlsx|xlsm|xls)$/.test(lower);
    const isCsv   = /\.(csv|txt)$/.test(lower);
    if (!isExcel && !isCsv) {
      toast.error('Se aceptan archivos CSV o Excel (.xlsx / .xlsm)');
      return;
    }
    try {
      let text: string;
      if (isExcel) {
        const { csv, sheetName, rowCount } = await excelFileToCsv(file, entity);
        text = csv;
        toast.success(`Hoja "${sheetName}" — ${rowCount} ${rowCount === 1 ? 'fila' : 'filas'}`);
      } else {
        text = await file.text();
      }
      setCsvText(text);
      setFileName(file.name);
      setPreview(parsePreview(text));
      setResult(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo leer el archivo';
      toast.error(msg);
    }
  }, [entity]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!csvText) return;
    setImporting(true);
    try {
      const res = entity === 'products'
        ? await importService.importProducts(csvText)
        : entity === 'customers'
        ? await importService.importCustomers(csvText)
        : await importService.importSuppliers(csvText);
      setResult(res);
      if (res.imported > 0) {
        toast.success(`${res.imported} ${ENTITY_LABELS[entity].toLowerCase()} importado${res.imported !== 1 ? 's' : ''}`);
        onSuccess(res.imported);
      }
      if (res.skipped > 0 && res.imported === 0) {
        toast.error('No se pudo importar ningún registro');
      }
    } catch {
      toast.error('Error al importar');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Importar {ENTITY_LABELS[entity]}
            </h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Cargá un archivo CSV para importar en lote
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Template + hints */}
          <div className="flex gap-4">
            <div className="flex-1 bg-gray-50 dark:bg-slate-700/40 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2">Columnas del CSV</p>
              {CONDITION_HINTS[entity]}
            </div>
            <div className="flex flex-col justify-center">
              <button
                onClick={() => downloadTemplate(entity)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Descargar plantilla
              </button>
            </div>
          </div>

          {/* Drop zone */}
          {!result && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={clsx(
                'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150',
                dragging
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : csvText
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
                  : 'border-gray-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-gray-50 dark:hover:bg-slate-700/30'
              )}
            >
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xlsm,.xls" onChange={onFileChange} className="hidden" />
              {csvText ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{fileName}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    {(preview?.rows.length ?? 0)} filas cargadas (vista previa) · Click para cambiar
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-300">
                    Arrastrá tu archivo aquí o hacé click
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">CSV o Excel (.xlsx / .xlsm)</p>
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          {csvText && preview && !result && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Vista previa (primeras filas)
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-slate-700/50">
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {preview.rows.slice(0, 4).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700 dark:text-slate-300 whitespace-nowrap max-w-[140px] truncate">{cell || <span className="text-gray-300 dark:text-slate-600">—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              {/* Summary chips */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{result.imported} importados</span>
                </div>
                {result.skipped > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{result.skipped} con errores</span>
                  </div>
                )}
                <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{result.total} filas procesadas</span>
              </div>

              {/* Error list */}
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-amber-100 dark:border-amber-900/40 overflow-hidden">
                  <button
                    onClick={() => setShowErrors((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-xs font-semibold text-amber-700 dark:text-amber-400"
                  >
                    <span>Ver errores ({result.errors.length})</span>
                    {showErrors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showErrors && (
                    <ul className="divide-y divide-amber-50 dark:divide-amber-900/20 max-h-40 overflow-y-auto">
                      {result.errors.map((e, i) => (
                        <li key={i} className="px-4 py-2 text-xs flex gap-3">
                          <span className="text-gray-400 dark:text-slate-500 w-14 flex-shrink-0">Fila {e.row}</span>
                          <span className="text-amber-700 dark:text-amber-400">{e.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          {result ? (
            <Button onClick={onClose}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleImport} disabled={!csvText} isLoading={isImporting}>
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
