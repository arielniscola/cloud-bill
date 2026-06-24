import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { reportsService, type ProfitabilityRow, type ProfitabilityFilters } from '../../services/reports.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import api from '../../services/api';
import type { ApiResponse } from '../../types';

interface SimpleOption { value: string; label: string; }

function MarginBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = pct < 10 ? 'bg-red-400' : pct < 25 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`text-xs font-semibold ${pct < 10 ? 'text-red-600 dark:text-red-400' : pct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function ProfitabilityReportPage() {
  const navigate = useNavigate();
  const [params, setParams]           = useState<ProfitabilityFilters>({});
  const [data, setData]               = useState<ProfitabilityRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [hasGenerated, setGenerated]  = useState(false);
  const [rubros, setRubros]   = useState<SimpleOption[]>([]);
  const [brands, setBrands]           = useState<SimpleOption[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<ApiResponse<{ id: string; name: string }[]>>('/rubros'),
      api.get<ApiResponse<{ id: string; name: string }[]>>('/brands'),
    ]).then(([catRes, brandRes]) => {
      setRubros([{ value: '', label: 'Todos los rubros' }, ...(catRes.data.data ?? []).map((c) => ({ value: c.id, label: c.name }))]);
      setBrands([{ value: '', label: 'Todas las marcas' }, ...(brandRes.data.data ?? []).map((b) => ({ value: b.id, label: b.name }))]);
    }).catch(() => {});
  }, []);

  const set = (k: keyof ProfitabilityFilters, v: string) => setParams((p) => ({ ...p, [k]: v || undefined }));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await reportsService.profitability(params);
      setData(res);
      setGenerated(true);
      if (res.length === 0) toast('Sin resultados para los filtros seleccionados', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      'rentabilidad_productos',
      'Rentabilidad',
      [
        { header: 'SKU',        key: 'sku',       width: 14 },
        { header: 'Producto',   key: 'name',      width: 30 },
        { header: 'Rubro',  key: 'rubro',  width: 18 },
        { header: 'Marca',      key: 'brand',     width: 16 },
        { header: 'Costo',      key: 'cost',      width: 12, format: 'currency' },
        { header: 'Precio',     key: 'price',     width: 12, format: 'currency' },
        { header: 'Margen $',   key: 'margin',    width: 12, format: 'currency' },
        { header: 'Margen %',   key: 'marginPct', width: 10, format: 'percent' },
      ],
      data,
    );
  };

  const avgMargin = data.length > 0 ? data.reduce((a, r) => a + r.marginPct, 0) / data.length : 0;

  return (
    <div>
      <PageHeader
        title="Rentabilidad de productos"
        subtitle={hasGenerated ? `${data.length} productos · margen promedio ${avgMargin.toFixed(1)}%` : undefined}
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
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Rubro</label>
            <Select value={params.rubroId ?? ''} onChange={(v) => set('rubroId', v)} options={rubros} />
          </div>
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Marca</label>
            <Select value={params.brandId ?? ''} onChange={(v) => set('brandId', v)} options={brands} />
          </div>
          <Button onClick={handleGenerate} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
        </div>
      </Card>

      {hasGenerated && (
        <Card padding="none">
          {data.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">Sin resultados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    {['SKU', 'Producto', 'Rubro', 'Marca', 'Costo', 'Precio', 'Margen $', 'Margen %'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                  {data.map((r) => (
                    <tr key={r.productId} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[220px] truncate">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-300 text-xs">{r.rubro}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-300 text-xs">{r.brand}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300 text-right">{formatCurrency(r.cost)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300 text-right">{formatCurrency(r.price)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{formatCurrency(r.margin)}</td>
                      <td className="px-4 py-3"><MarginBar pct={r.marginPct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
