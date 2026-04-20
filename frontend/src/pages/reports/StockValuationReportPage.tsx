import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { reportsService, type StockValuationRow, type StockValuationFilters } from '../../services/reports.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import api from '../../services/api';
import type { ApiResponse } from '../../types';

interface SimpleOption { value: string; label: string; }

export default function StockValuationReportPage() {
  const navigate = useNavigate();
  const [params, setParams]           = useState<StockValuationFilters>({});
  const [data, setData]               = useState<StockValuationRow[]>([]);
  const [totalCapital, setTotal]      = useState(0);
  const [loading, setLoading]         = useState(false);
  const [hasGenerated, setGenerated]  = useState(false);
  const [warehouses, setWarehouses]   = useState<SimpleOption[]>([]);
  const [categories, setCategories]   = useState<SimpleOption[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<ApiResponse<{ id: string; name: string }[]>>('/warehouses'),
      api.get<ApiResponse<{ id: string; name: string }[]>>('/categories'),
    ]).then(([wRes, cRes]) => {
      setWarehouses([{ value: '', label: 'Todos los depósitos' }, ...(wRes.data.data ?? []).map((w) => ({ value: w.id, label: w.name }))]);
      setCategories([{ value: '', label: 'Todas las categorías' }, ...(cRes.data.data ?? []).map((c) => ({ value: c.id, label: c.name }))]);
    }).catch(() => {});
  }, []);

  const set = (k: keyof StockValuationFilters, v: string) => setParams((p) => ({ ...p, [k]: v || undefined }));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await reportsService.stockValuation(params);
      setData(res.data);
      setTotal(res.totalCapital);
      setGenerated(true);
      if (res.data.length === 0) toast('Sin stock para los filtros seleccionados', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      `valorizacion_stock_${new Date().toISOString().substring(0, 10)}`,
      'Valorización',
      [
        { header: 'SKU',          key: 'sku',        width: 14 },
        { header: 'Producto',     key: 'name',       width: 30 },
        { header: 'Categoría',    key: 'category',   width: 18 },
        { header: 'Depósito',     key: 'warehouse',  width: 18 },
        { header: 'Cantidad',     key: 'quantity',   width: 10, format: 'number' },
        { header: 'Costo unit.',  key: 'unitCost',   width: 12, format: 'currency' },
        { header: 'Valor total',  key: 'totalValue', width: 14, format: 'currency' },
      ],
      data,
      { sku: 'TOTAL', name: '', category: '', warehouse: '', quantity: data.reduce((a, r) => a + r.quantity, 0), unitCost: '', totalValue: totalCapital } as any,
    );
  };

  return (
    <div>
      <PageHeader
        title="Valorización de stock"
        subtitle={hasGenerated ? `${data.length} ítems · capital total ${formatCurrency(totalCapital)}` : undefined}
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

      <Card className="mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Depósito</label>
            <Select value={params.warehouseId ?? ''} onChange={(v) => set('warehouseId', v)} options={warehouses} />
          </div>
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Categoría</label>
            <Select value={params.categoryId ?? ''} onChange={(v) => set('categoryId', v)} options={categories} />
          </div>
          <Button onClick={handleGenerate} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
        </div>
      </Card>

      {hasGenerated && (
        <>
          {/* Summary chip */}
          {data.length > 0 && (
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-800 rounded-xl">
                <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium">Capital inmovilizado</p>
                <p className="text-lg font-bold text-cyan-700 dark:text-cyan-300">{formatCurrency(totalCapital)}</p>
              </div>
              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-700/40 border border-gray-100 dark:border-slate-700 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Productos</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.length}</p>
              </div>
            </div>
          )}

          <Card padding="none">
            {data.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">Sin resultados</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                    <tr>
                      {['SKU', 'Producto', 'Categoría', 'Depósito', 'Cantidad', 'Costo unit.', 'Valor total'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {data.map((r) => (
                      <tr key={`${r.productId}-${r.warehouse}`} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.sku}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{r.name}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{r.category}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{r.warehouse}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">{r.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">{formatCurrency(r.unitCost)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(r.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total capital</td>
                      <td className="px-4 py-3 text-right font-bold text-cyan-600 dark:text-cyan-400">{formatCurrency(totalCapital)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
