import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search, Percent, Receipt, Landmark, FileCode2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import {
  reportsService,
  type RetentionReportRow,
  type RetentionReportTotals,
  type RetentionReportByType,
  type RetentionsReportFilters,
} from '../../services/reports.service';
import { suppliersService } from '../../services/suppliers.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import { RETENTION_TYPE_OPTIONS, RETENTION_BASE_OPTIONS } from '../../utils/constants';
import { buildSicoreTxt, downloadSicoreTxt, isSicoreType } from '../../utils/sicoreTxt';

const today           = new Date().toISOString().substring(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10);

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);
const BASE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_BASE_OPTIONS.map((o) => [o.value, o.label]),
);

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los regímenes' },
  ...RETENTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

// Fila del Excel — el papel de trabajo del período
interface RetentionExcelRow {
  date:        string;
  certificate: string;
  supplier:    string;
  cuit:        string;
  ordenPago:   string;
  regime:      string;
  baseKind:    string;
  baseAmount:  number;
  percentage:  number;
  amount:      number;
  impuesto:    string;
  regimen:     string;
}

export default function RetentionsReportPage() {
  const navigate = useNavigate();
  const [params, setParams]   = useState<RetentionsReportFilters>({ dateFrom: firstDayOfMonth, dateTo: today });
  const [data, setData]       = useState<RetentionReportRow[]>([]);
  const [totals, setTotals]   = useState<RetentionReportTotals | null>(null);
  const [byType, setByType]   = useState<RetentionReportByType[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'Todos los proveedores' },
  ]);

  useEffect(() => {
    suppliersService
      .getAll({ limit: 500 })
      .then((res) => {
        setSupplierOptions([
          { value: '', label: 'Todos los proveedores' },
          ...res.data.map((s) => ({ value: s.id, label: s.name })),
        ]);
      })
      .catch(() => { /* silent — el filtro sigue usable sin opciones */ });
  }, []);

  const set = (k: keyof RetentionsReportFilters, v: string) =>
    setParams((p) => ({ ...p, [k]: v || undefined }));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await reportsService.retentions(params);
      setData(res.data);
      setTotals(res.totals);
      setByType(res.byType);
      setHasGenerated(true);
      if (res.data.length === 0) toast('Sin retenciones para los filtros seleccionados', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const period = `${params.dateFrom ?? ''}_${params.dateTo ?? ''}`;

  const handleExportExcel = () => {
    const rows: RetentionExcelRow[] = data.map((r) => ({
      date:        r.date,
      certificate: r.certificate ?? '—',
      supplier:    r.supplierName,
      cuit:        r.supplierCuit ?? '—',
      ordenPago:   r.ordenPagoNumber,
      regime:      TYPE_LABELS[r.type] ?? r.type,
      baseKind:    BASE_LABELS[r.baseKind] ?? r.baseKind,
      baseAmount:  r.baseAmount,
      percentage:  r.percentage,
      amount:      r.amount,
      impuesto:    r.arcaImpuesto ?? '',
      regimen:     r.arcaRegimen ?? '',
    }));

    exportToExcel<RetentionExcelRow>(
      `retenciones_${period}`,
      'Retenciones',
      [
        { header: 'Fecha',          key: 'date',        width: 12 },
        { header: 'Certificado',    key: 'certificate', width: 16 },
        { header: 'Proveedor',      key: 'supplier',    width: 30 },
        { header: 'CUIT',           key: 'cuit',        width: 14 },
        { header: 'Orden de pago',  key: 'ordenPago',   width: 16 },
        { header: 'Régimen',        key: 'regime',      width: 14 },
        { header: 'Base',           key: 'baseKind',    width: 10 },
        { header: 'Importe base',   key: 'baseAmount',  width: 14, format: 'currency' },
        { header: 'Alícuota %',     key: 'percentage',  width: 10, format: 'number' },
        { header: 'Retenido',       key: 'amount',      width: 14, format: 'currency' },
        { header: 'Cód. impuesto',  key: 'impuesto',    width: 12 },
        { header: 'Cód. régimen',   key: 'regimen',     width: 12 },
      ],
      rows,
      totals
        ? {
            date:       'TOTAL',
            baseAmount: totals.baseAmount,
            amount:     totals.amount,
          }
        : undefined,
    );
  };

  // Archivo de importación de SICORE. Solo los regímenes nacionales y con los
  // códigos ARCA cargados: si falta algo se avisa en vez de emitir un TXT que
  // el aplicativo va a rechazar.
  const handleExportSicore = () => {
    const { content, included, skipped, issues } = buildSicoreTxt(data);

    if (issues.length > 0) {
      const sample = issues.slice(0, 3)
        .map((i) => `${i.row.supplierName} (${i.row.certificate ?? i.row.ordenPagoNumber}): ${i.reason}`)
        .join(' · ');
      toast.error(
        `${issues.length} retencion${issues.length === 1 ? '' : 'es'} sin datos para SICORE — ${sample}` +
        `${issues.length > 3 ? '…' : ''}. Completá los códigos ARCA en la ficha del proveedor.`,
        { duration: 8000 },
      );
      return;
    }

    if (included.length === 0) {
      toast.error('No hay retenciones nacionales en el período. IIBB se declara por SIRCAR/ARBA/AGIP, no por SICORE.');
      return;
    }

    downloadSicoreTxt(content, `SICORE_RETENCIONES_${period.replace(/-/g, '')}.txt`);
    if (skipped.length > 0) {
      toast(
        `${included.length} retenciones exportadas. Se omitieron ${skipped.length} de IIBB: son provinciales (SIRCAR/ARBA/AGIP).`,
        { icon: 'ℹ️', duration: 7000 },
      );
    } else {
      toast.success(`${included.length} retenciones exportadas a SICORE`);
    }
  };

  const stats = useMemo(() => {
    if (!totals) return null;
    return [
      { label: 'Retenciones', value: String(totals.count),               icon: Receipt,  color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
      { label: 'Base total',  value: formatCurrency(totals.baseAmount),  icon: Landmark, color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
      { label: 'Retenido',    value: formatCurrency(totals.amount),      icon: Percent,  color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
    ];
  }, [totals]);

  // Filas que no podrían exportarse a SICORE — se avisa antes de intentarlo
  const incompleteCount = useMemo(
    () => data.filter((r) => isSicoreType(r.type) && (!r.arcaRegimen || !r.arcaImpuesto || !r.supplierCuit)).length,
    [data],
  );

  return (
    <div>
      <PageHeader
        title="Retenciones practicadas"
        subtitle={hasGenerated ? `${data.length} retenciones en el período` : 'Retenciones a proveedores por período, con exportación a SICORE'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Reportes
            </Button>
            {hasGenerated && data.length > 0 && (
              <>
                <Button variant="outline" onClick={handleExportExcel}>
                  <FileDown className="w-4 h-4 mr-2" /> Exportar Excel
                </Button>
                <Button variant="outline" onClick={handleExportSicore}>
                  <FileCode2 className="w-4 h-4 mr-2" /> Archivo SICORE
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Filtros */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Desde</label>
            <input
              type="date"
              value={params.dateFrom ?? ''}
              onChange={(e) => set('dateFrom', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Hasta</label>
            <input
              type="date"
              value={params.dateTo ?? ''}
              onChange={(e) => set('dateTo', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Proveedor</label>
            <Select value={params.supplierId ?? ''} onChange={(v) => set('supplierId', v)} options={supplierOptions} />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Régimen</label>
            <Select value={params.type ?? ''} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
          </div>
          <Button onClick={handleGenerate} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
        </div>
      </Card>

      {/* Totales */}
      {hasGenerated && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{s.label}</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{s.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtotales por régimen — es como se ingresa el impuesto */}
      {hasGenerated && byType.length > 0 && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
            Total por régimen
          </p>
          <div className="flex flex-wrap gap-2">
            {byType.map((t) => (
              <div key={t.type} className="px-3 py-2 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40">
                <p className="text-[11px] text-gray-400 dark:text-slate-500">
                  {TYPE_LABELS[t.type] ?? t.type} · {t.count}
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 tabular-nums">
                  {formatCurrency(t.amount)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Aviso de datos faltantes para SICORE */}
      {hasGenerated && incompleteCount > 0 && (
        <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            {incompleteCount} retención{incompleteCount === 1 ? '' : 'es'} de régimen nacional sin los datos que pide
            SICORE (código de impuesto, código de régimen o CUIT del proveedor). Completalos en la pestaña
            <strong> Retenciones</strong> de la ficha del proveedor para poder generar el archivo.
          </p>
        </div>
      )}

      {/* Detalle */}
      {hasGenerated && (
        <Card padding="none">
          {data.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">Sin resultados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    {['Fecha', 'Certificado', 'Proveedor', 'Orden de pago', 'Régimen', 'Base', 'Alíc.', 'Retenido', 'Cód. ARCA'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                  {data.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">{r.certificate ?? '—'}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{r.supplierName}</div>
                        <div className="font-mono text-xs text-gray-400 dark:text-slate-500">{r.supplierCuit ?? '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-slate-400 whitespace-nowrap">{r.ordenPagoNumber}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-800">
                          {TYPE_LABELS[r.type] ?? r.type}
                        </span>
                        {r.jurisdiction && <span className="ml-1.5 text-[11px] text-gray-400">{r.jurisdiction}</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                        {formatCurrency(r.baseAmount, r.currency)}
                        <span className="block text-[11px] text-gray-400 dark:text-slate-500">
                          s/{BASE_LABELS[r.baseKind] ?? r.baseKind}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 dark:text-slate-400 whitespace-nowrap tabular-nums">{r.percentage}%</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap tabular-nums">
                        {formatCurrency(r.amount, r.currency)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                        {isSicoreType(r.type)
                          ? (r.arcaImpuesto && r.arcaRegimen
                              ? <span className="text-gray-500 dark:text-slate-400">{r.arcaImpuesto}/{r.arcaRegimen}</span>
                              : <span className="text-amber-600 dark:text-amber-400">falta</span>)
                          : <span className="text-gray-300 dark:text-slate-600">provincial</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap tabular-nums">{formatCurrency(totals.baseAmount)}</td>
                      <td />
                      <td className="px-3 py-3 text-right font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap tabular-nums">{formatCurrency(totals.amount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
