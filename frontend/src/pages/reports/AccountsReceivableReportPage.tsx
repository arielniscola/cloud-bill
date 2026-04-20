import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { reportsService, type AccountsReceivableRow, type AccountsReceivableFilters } from '../../services/reports.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';

const CURRENCY_OPTIONS = [
  { value: '',    label: 'Todas las monedas' },
  { value: 'ARS', label: 'ARS — Pesos' },
  { value: 'USD', label: 'USD — Dólares' },
];

export default function AccountsReceivableReportPage() {
  const navigate = useNavigate();
  const [params, setParams]          = useState<AccountsReceivableFilters>({});
  const [data, setData]              = useState<AccountsReceivableRow[]>([]);
  const [totalBalance, setTotal]     = useState(0);
  const [loading, setLoading]        = useState(false);
  const [hasGenerated, setGenerated] = useState(false);
  const [minBalance, setMinBalance]  = useState('');

  const set = (k: keyof AccountsReceivableFilters, v: string | number | undefined) =>
    setParams((p) => ({ ...p, [k]: v }));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const p: AccountsReceivableFilters = { ...params };
      if (minBalance) p.minBalance = parseFloat(minBalance);
      const res = await reportsService.accountsReceivable(p);
      setData(res.data);
      setTotal(res.totalBalance);
      setGenerated(true);
      if (res.data.length === 0) toast('Sin cuentas con saldo pendiente', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      `cuentas_a_cobrar_${new Date().toISOString().substring(0, 10)}`,
      'Cuentas a cobrar',
      [
        { header: 'Cliente',       key: 'customerName', width: 28 },
        { header: 'CUIT / CUIL',   key: 'taxId',        width: 16 },
        { header: 'Email',         key: 'email',        width: 24 },
        { header: 'Teléfono',      key: 'phone',        width: 14 },
        { header: 'Moneda',        key: 'currency',     width: 8  },
        { header: 'Saldo',         key: 'balance',      width: 14, format: 'currency' },
        { header: 'Límite crédito',key: 'creditLimit',  width: 14, format: 'currency' },
      ],
      data,
      { customerName: 'TOTAL', taxId: '', email: '', phone: '', currency: '', balance: totalBalance, creditLimit: '' } as any,
    );
  };

  return (
    <div>
      <PageHeader
        title="Cuentas a cobrar"
        subtitle={hasGenerated ? `${data.length} clientes con saldo · total ${formatCurrency(totalBalance)}` : undefined}
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
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Moneda</label>
            <Select value={params.currency ?? ''} onChange={(v) => set('currency', v || undefined)} options={CURRENCY_OPTIONS} />
          </div>
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Saldo mínimo</label>
            <input
              type="number" min="0" placeholder="0.01"
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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
              <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl">
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Total a cobrar</p>
                <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{formatCurrency(totalBalance)}</p>
              </div>
              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-700/40 border border-gray-100 dark:border-slate-700 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Clientes deudores</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.length}</p>
              </div>
            </div>
          )}

          <Card padding="none">
            {data.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">Sin cuentas con saldo pendiente</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                    <tr>
                      {['Cliente', 'CUIT / CUIL', 'Email', 'Teléfono', 'Moneda', 'Saldo', 'Límite crédito'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {data.map((r) => (
                      <tr key={r.customerId} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.customerName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.taxId}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{r.email}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{r.phone}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{r.currency}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">{formatCurrency(r.balance)}</td>
                        <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">
                          {r.creditLimit != null ? formatCurrency(r.creditLimit) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">{formatCurrency(totalBalance)}</td>
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
