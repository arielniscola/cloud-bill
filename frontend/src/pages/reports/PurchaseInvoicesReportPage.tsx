import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search, FileText, AlertCircle, CheckCircle2, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import {
  reportsService,
  type PurchaseInvoiceReportRow,
  type PurchaseInvoiceReportTotals,
  type PurchaseInvoicesReportFilters,
  type PurchaseInvoiceDateField,
} from '../../services/reports.service';
import { suppliersService } from '../../services/suppliers.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import { PAYMENT_METHODS } from '../../utils/constants';

const today          = new Date().toISOString().substring(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10);

const DATE_FIELD_OPTIONS = [
  { value: 'imputationDate', label: 'Imputación' },
  { value: 'date',           label: 'Fecha factura' },
  { value: 'dueDate',        label: 'Vencimiento' },
  { value: 'createdAt',      label: 'Alta' },
];

const STATUS_OPTIONS = [
  { value: '',               label: 'Todos los estados' },
  { value: 'PENDING',        label: 'Pendiente' },
  { value: 'PARTIALLY_PAID', label: 'Pago parcial' },
  { value: 'PAID',           label: 'Pagada' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Todos los métodos' },
  ...Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label })),
];

const STATUS_BADGE: Record<string, string> = {
  PENDING:        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PAID:           'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:        'Pendiente',
  PARTIALLY_PAID: 'Pago parcial',
  PAID:           'Pagada',
};

export default function PurchaseInvoicesReportPage() {
  const navigate = useNavigate();
  const [params, setParams]       = useState<PurchaseInvoicesReportFilters>({ dateFrom: firstDayOfMonth, dateTo: today, dateField: 'imputationDate' });
  const [data, setData]           = useState<PurchaseInvoiceReportRow[]>([]);
  const [totals, setTotals]       = useState<PurchaseInvoiceReportTotals | null>(null);
  const [loading, setLoading]     = useState(false);
  const [hasGenerated, setHasGen] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<{ value: string; label: string }[]>([{ value: '', label: 'Todos los proveedores' }]);

  useEffect(() => {
    suppliersService
      .getAll({ limit: 500 })
      .then((res) => {
        setSupplierOptions([
          { value: '', label: 'Todos los proveedores' },
          ...res.data.map((s) => ({ value: s.id, label: s.name })),
        ]);
      })
      .catch(() => { /* silent — filter still usable without options */ });
  }, []);

  const set = (k: keyof PurchaseInvoicesReportFilters, v: string) =>
    setParams((p) => ({ ...p, [k]: v || undefined }));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await reportsService.purchaseInvoices(params);
      setData(res.data);
      setTotals(res.totals);
      setHasGen(true);
      if (res.data.length === 0) toast('Sin facturas para los filtros seleccionados', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      `facturas_compras_${params.dateFrom ?? ''}_${params.dateTo ?? ''}`,
      'Facturas de compras',
      [
        { header: 'Fecha imputación', key: 'imputationDate', width: 14 },
        { header: 'N° factura',       key: 'number',         width: 18 },
        { header: 'Compra',           key: 'purchaseNumber', width: 16 },
        { header: 'Proveedor',        key: 'supplierName',   width: 28 },
        { header: 'CUIT',             key: 'supplierCuit',   width: 14 },
        { header: 'Tipo',             key: 'type',           width: 12 },
        { header: 'Subtotal',         key: 'subtotal',       width: 14, format: 'currency' },
        { header: 'IVA',              key: 'taxAmount',      width: 14, format: 'currency' },
        { header: 'Retenciones',      key: 'retenciones',    width: 14, format: 'currency' },
        { header: 'Total',            key: 'amount',         width: 14, format: 'currency' },
        { header: 'Neto',             key: 'net',            width: 14, format: 'currency' },
        { header: 'Método pago',      key: 'paymentMethod',  width: 16 },
        { header: 'Vencimiento',      key: 'dueDate',        width: 14 },
        { header: 'Estado',           key: 'status',         width: 12 },
      ],
      data,
      totals
        ? {
            imputationDate: 'TOTAL',
            number:        '',
            purchaseNumber:'',
            supplierName:  '',
            supplierCuit:  '',
            type:          '',
            subtotal:      totals.subtotal,
            taxAmount:     totals.taxAmount,
            retenciones:   totals.retenciones,
            amount:        totals.amount,
            net:           totals.net,
            paymentMethod: '',
            dueDate:       '',
            status:        '',
          }
        : undefined,
    );
  };

  const stats = useMemo(() => {
    if (!totals) return null;
    return [
      { label: 'Facturas',     value: String(totals.count),                icon: FileText,    color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
      { label: 'Total bruto',  value: formatCurrency(totals.amount),       icon: Receipt,     color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
      { label: 'IVA',          value: formatCurrency(totals.taxAmount),    icon: Receipt,     color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
      { label: 'Retenciones',  value: formatCurrency(totals.retenciones),  icon: Receipt,     color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
      { label: 'Neto pagado',  value: formatCurrency(totals.paid),         icon: CheckCircle2,color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
      { label: 'Neto pendiente', value: formatCurrency(totals.pending),    icon: AlertCircle, color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
    ];
  }, [totals]);

  return (
    <div>
      <PageHeader
        title="Facturas de compras"
        subtitle={hasGenerated ? `${data.length} facturas` : 'Reporte consultivo de facturas de proveedor'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Reportes
            </Button>
            {hasGenerated && data.length > 0 && (
              <Button variant="outline" onClick={handleExport}>
                <FileDown className="w-4 h-4 mr-2" /> Exportar Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Filtrar por fecha de</label>
            <Select
              value={params.dateField ?? 'imputationDate'}
              onChange={(v) => set('dateField', v as PurchaseInvoiceDateField)}
              options={DATE_FIELD_OPTIONS}
            />
          </div>
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
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Estado</label>
            <Select value={params.status ?? ''} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Método de pago</label>
            <Select value={params.paymentMethod ?? ''} onChange={(v) => set('paymentMethod', v)} options={PAYMENT_METHOD_OPTIONS} />
          </div>
          <Button onClick={handleGenerate} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
        </div>
      </Card>

      {/* Stats */}
      {hasGenerated && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
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

      {/* Results */}
      {hasGenerated && (
        <Card padding="none">
          {data.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">Sin resultados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    {['Fecha', 'N° factura', 'Compra', 'Proveedor', 'Tipo', 'Subtotal', 'IVA', 'Retenc.', 'Total', 'Método', 'Vto.', 'Estado'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                  {data.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300 whitespace-nowrap">{r.imputationDate ?? r.invoiceDate ?? '—'}</td>
                      <td className="px-3 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{r.number}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {r.purchaseId && r.purchaseNumber ? (
                          <Link to={`/purchases/${r.purchaseId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline font-mono text-xs">
                            {r.purchaseNumber}
                          </Link>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">
                        <div className="font-medium text-gray-900 dark:text-white">{r.supplierName}</div>
                        <div className="font-mono text-xs text-gray-400 dark:text-slate-500">{r.supplierCuit}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-500 dark:text-slate-400 text-xs whitespace-nowrap">{r.type}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300 text-right whitespace-nowrap">{formatCurrency(r.subtotal)}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300 text-right whitespace-nowrap">{formatCurrency(r.taxAmount)}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300 text-right whitespace-nowrap">{r.retenciones > 0 ? formatCurrency(r.retenciones) : '—'}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-3 text-gray-500 dark:text-slate-400 text-xs whitespace-nowrap">
                        {PAYMENT_METHODS[r.paymentMethod as keyof typeof PAYMENT_METHODS] ?? r.paymentMethod}
                      </td>
                      <td className="px-3 py-3 text-gray-500 dark:text-slate-400 text-xs whitespace-nowrap">{r.dueDate ?? '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-800'}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatCurrency(totals.subtotal)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatCurrency(totals.taxAmount)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatCurrency(totals.retenciones)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{formatCurrency(totals.amount)}</td>
                      <td colSpan={3} />
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
