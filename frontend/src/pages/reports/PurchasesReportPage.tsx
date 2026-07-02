import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { reportsService, type PurchaseBySupplierRow, type PurchasesReportFilters } from '../../services/reports.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';

const today          = new Date().toISOString().substring(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10);

const STATUS_OPTIONS = [
  { value: '',               label: 'Todos los estados' },
  { value: 'PENDING',        label: 'Pendiente' },
  { value: 'PARTIALLY_PAID', label: 'Pago parcial' },
  { value: 'PAID',           label: 'Pagada' },
];

export default function PurchasesReportPage() {
  const navigate = useNavigate();
  const [params, setParams]         = useState<PurchasesReportFilters>({ dateFrom: firstDayOfMonth, dateTo: today });
  const [data, setData]             = useState<PurchaseBySupplierRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [hasGenerated, setGenerated] = useState(false);

  const set = (k: keyof PurchasesReportFilters, v: string) => setParams((p) => ({ ...p, [k]: v || undefined }));

  const totals = {
    purchaseCount: data.reduce((a, r) => a + r.purchaseCount, 0),
    subtotal:      data.reduce((a, r) => a + r.subtotal, 0),
    taxAmount:     data.reduce((a, r) => a + r.taxAmount, 0),
    total:         data.reduce((a, r) => a + r.total, 0),
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await reportsService.purchasesBySupplier(params);
      setData(res.data);
      setGenerated(true);
      if (res.data.length === 0) toast('Sin resultados para los filtros seleccionados', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      `compras_por_proveedor_${params.dateFrom}_${params.dateTo}`,
      'Compras por proveedor',
      [
        { header: 'Proveedor',     key: 'supplierName',  width: 28 },
        { header: 'CUIT',          key: 'supplierCuit',  width: 16 },
        { header: 'N° facturas',   key: 'purchaseCount', width: 12 },
        { header: 'Subtotal',      key: 'subtotal',      width: 14, format: 'currency' },
        { header: 'IVA',           key: 'taxAmount',     width: 14, format: 'currency' },
        { header: 'Total',         key: 'total',         width: 14, format: 'currency' },
      ],
      data,
      { supplierName: 'TOTAL', supplierCuit: '', purchaseCount: totals.purchaseCount, subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total },
    );
  };

  return (
    <div>
      <PageHeader
        title="Compras por proveedor"
        subtitle={hasGenerated ? `${data.length} proveedores` : undefined}
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
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Desde</label>
            <input type="date" value={params.dateFrom ?? ''} onChange={(e) => set('dateFrom', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Hasta</label>
            <input type="date" value={params.dateTo ?? ''} onChange={(e) => set('dateTo', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Estado</label>
            <Select value={params.status ?? ''} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
          </div>
          <Button onClick={handleGenerate} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
        </div>
      </Card>

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
                    {['Proveedor', 'CUIT', 'N° facturas', 'Subtotal', 'IVA', 'Total'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                  {data.map((r) => (
                    <tr key={r.supplierId} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.supplierName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.supplierCuit}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300 text-center">{r.purchaseCount}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300 text-right">{formatCurrency(r.subtotal)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300 text-right">{formatCurrency(r.taxAmount)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-right">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{totals.purchaseCount}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(totals.subtotal)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(totals.taxAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
