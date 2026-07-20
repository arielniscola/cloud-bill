import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Users, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { reportsService, type AgingEntityRow } from '../../services/reports.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';

const BUCKETS: Array<{ key: keyof AgingEntityRow; label: string }> = [
  { key: 'notDue',  label: 'A vencer' },
  { key: 'd0_30',   label: '0–30 días' },
  { key: 'd31_60',  label: '31–60 días' },
  { key: 'd61_90',  label: '61–90 días' },
  { key: 'd90plus', label: '+90 días' },
];

function sumBucket(rows: AgingEntityRow[], key: keyof AgingEntityRow): number {
  return rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
}

function AgingTable({ rows, entityLabel, linkPrefix }: {
  rows: AgingEntityRow[];
  entityLabel: string;
  linkPrefix?: string;
}) {
  const navigate = useNavigate();
  const total = sumBucket(rows, 'total');

  if (rows.length === 0) {
    return <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-10">Sin comprobantes pendientes</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">{entityLabel}</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Comp.</th>
            {BUCKETS.map((b) => (
              <th key={b.key} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{b.label}</th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {rows.map((r) => (
            <tr
              key={r.entityId}
              className={`hover:bg-gray-50 dark:hover:bg-slate-700/20 ${linkPrefix ? 'cursor-pointer' : ''}`}
              onClick={linkPrefix ? () => navigate(`${linkPrefix}${r.entityId}`) : undefined}
            >
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.name}</td>
              <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-slate-400">{r.docCount}</td>
              {BUCKETS.map((b) => {
                const v = Number(r[b.key] ?? 0);
                const overdue90 = b.key === 'd90plus' && v > 0;
                const overdue60 = b.key === 'd61_90' && v > 0;
                return (
                  <td
                    key={b.key}
                    className={`px-4 py-3 text-right tabular-nums ${
                      overdue90 ? 'font-bold text-rose-600 dark:text-rose-400'
                      : overdue60 ? 'font-semibold text-amber-600 dark:text-amber-400'
                      : v > 0 ? 'text-gray-700 dark:text-slate-200'
                      : 'text-gray-300 dark:text-slate-600'
                    }`}
                  >
                    {v > 0 ? formatCurrency(v) : '—'}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
          <tr>
            <td className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total</td>
            <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-slate-400">{rows.reduce((a, r) => a + r.docCount, 0)}</td>
            {BUCKETS.map((b) => (
              <td key={b.key} className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200 tabular-nums">
                {formatCurrency(sumBucket(rows, b.key))}
              </td>
            ))}
            <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function CcAgingReportPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<AgingEntityRow[]>([]);
  const [suppliers, setSuppliers] = useState<AgingEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');

  useEffect(() => {
    reportsService.ccAging()
      .then((res) => {
        setCustomers(res.customers);
        setSuppliers(res.suppliers);
      })
      .catch(() => toast.error('Error al generar el reporte'))
      .finally(() => setLoading(false));
  }, []);

  const rows = tab === 'customers' ? customers : suppliers;

  const handleExport = () => {
    exportToExcel(
      `aging_${tab === 'customers' ? 'clientes' : 'proveedores'}_${new Date().toISOString().substring(0, 10)}`,
      'Deuda por antigüedad',
      [
        { header: tab === 'customers' ? 'Cliente' : 'Proveedor', key: 'name', width: 28 },
        { header: 'Comprobantes', key: 'docCount', width: 12 },
        { header: 'A vencer',   key: 'notDue',  width: 14, format: 'currency' },
        { header: '0-30 días',  key: 'd0_30',   width: 14, format: 'currency' },
        { header: '31-60 días', key: 'd31_60',  width: 14, format: 'currency' },
        { header: '61-90 días', key: 'd61_90',  width: 14, format: 'currency' },
        { header: '+90 días',   key: 'd90plus', width: 14, format: 'currency' },
        { header: 'Total',      key: 'total',   width: 14, format: 'currency' },
      ],
      rows,
    );
  };

  return (
    <div>
      <PageHeader
        title="Deuda por antigüedad"
        subtitle="Comprobantes impagos de cuenta corriente, por antigüedad del vencimiento"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Reportes
            </Button>
            {rows.length > 0 && (
              <Button variant="outline" onClick={handleExport}>
                <FileDown className="w-4 h-4 mr-2" /> Exportar Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs clientes / proveedores */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {([
          { key: 'customers', label: `Clientes (${customers.length})`, icon: <Users className="w-4 h-4" /> },
          { key: 'suppliers', label: `Proveedores (${suppliers.length})`, icon: <Truck className="w-4 h-4" /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <Card padding="none">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
          </div>
        ) : (
          <AgingTable
            rows={rows}
            entityLabel={tab === 'customers' ? 'Cliente' : 'Proveedor'}
            linkPrefix={tab === 'customers' ? '/current-accounts?customerId=' : undefined}
          />
        )}
      </Card>
    </div>
  );
}
