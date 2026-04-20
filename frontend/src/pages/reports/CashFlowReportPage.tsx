import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { reportsService, type CashFlowRow, type CashFlowFilters } from '../../services/reports.service';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import api from '../../services/api';
import type { ApiResponse } from '../../types';

const today          = new Date().toISOString().substring(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10);

const METHOD_STYLE: Record<string, string> = {
  Efectivo:      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  Transferencia: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  Cheque:        'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  Tarjeta:       'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400',
};

export default function CashFlowReportPage() {
  const navigate = useNavigate();
  const [params, setParams]          = useState<CashFlowFilters>({ dateFrom: firstDayOfMonth, dateTo: today });
  const [data, setData]              = useState<CashFlowRow[]>([]);
  const [totalAmount, setTotal]      = useState(0);
  const [loading, setLoading]        = useState(false);
  const [hasGenerated, setGenerated] = useState(false);
  const [cashRegisters, setCashRegisters] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    api.get<ApiResponse<{ id: string; name: string }[]>>('/cash-registers')
      .then((res) => {
        setCashRegisters([
          { value: '', label: 'Todas las cajas' },
          ...(res.data.data ?? []).map((c) => ({ value: c.id, label: c.name })),
        ]);
      }).catch(() => {});
  }, []);

  const set = (k: keyof CashFlowFilters, v: string) => setParams((p) => ({ ...p, [k]: v || undefined }));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await reportsService.cashFlow(params);
      setData(res.data);
      setTotal(res.totalAmount);
      setGenerated(true);
      if (res.data.length === 0) toast('Sin cobros para el período seleccionado', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      `flujo_cobros_${params.dateFrom}_${params.dateTo}`,
      'Flujo de cobros',
      [
        { header: 'N° Recibo',     key: 'number',        width: 18 },
        { header: 'Fecha',         key: 'date',          width: 12 },
        { header: 'Cliente',       key: 'customerName',  width: 28 },
        { header: 'Caja',          key: 'cashRegister',  width: 18 },
        { header: 'Método',        key: 'paymentMethod', width: 16 },
        { header: 'Moneda',        key: 'currency',      width: 8  },
        { header: 'Importe',       key: 'amount',        width: 14, format: 'currency' },
        { header: 'Recargo',       key: 'surchargeAmount', width: 10, format: 'currency' },
        { header: 'Referencia',    key: 'reference',     width: 18 },
      ],
      data,
      { number: 'TOTAL', date: '', customerName: '', cashRegister: '', paymentMethod: '', currency: '', amount: totalAmount, surchargeAmount: '', reference: '' } as any,
    );
  };

  // Method totals for summary
  const byMethod: Record<string, number> = {};
  for (const r of data) byMethod[r.paymentMethod] = (byMethod[r.paymentMethod] ?? 0) + r.amount;

  return (
    <div>
      <PageHeader
        title="Flujo de cobros"
        subtitle={hasGenerated ? `${data.length} recibos · total ${formatCurrency(totalAmount)}` : undefined}
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
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Caja</label>
            <Select value={params.cashRegisterId ?? ''} onChange={(v) => set('cashRegisterId', v)} options={cashRegisters} />
          </div>
          <Button onClick={handleGenerate} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
        </div>
      </Card>

      {hasGenerated && (
        <>
          {data.length > 0 && (
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="px-4 py-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-xl">
                <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">Total cobrado</p>
                <p className="text-lg font-bold text-violet-700 dark:text-violet-300">{formatCurrency(totalAmount)}</p>
              </div>
              {Object.entries(byMethod).map(([method, amt]) => (
                <div key={method} className="px-4 py-2 bg-gray-50 dark:bg-slate-700/40 border border-gray-100 dark:border-slate-700 rounded-xl">
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{method}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(amt)}</p>
                </div>
              ))}
            </div>
          )}

          <Card padding="none">
            {data.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">Sin cobros para el período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                    <tr>
                      {['N° Recibo', 'Fecha', 'Cliente', 'Caja', 'Método', 'Moneda', 'Importe', 'Referencia'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {data.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.number}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">{r.customerName}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{r.cashRegister}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${METHOD_STYLE[r.paymentMethod] ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-slate-400">{r.currency}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(r.amount)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500">{r.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-violet-600 dark:text-violet-400">{formatCurrency(totalAmount)}</td>
                      <td />
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
