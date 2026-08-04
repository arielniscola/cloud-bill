import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { suppliersService, ordenPagosService } from '../../services';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import type { Supplier, TaxCondition } from '../../types';

// ── Avatar helpers ───────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
];
function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, c) => c.charCodeAt(0) + acc, 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const TAX_BADGE: Record<TaxCondition, { label: string; className: string }> = {
  RESPONSABLE_INSCRIPTO: { label: 'Resp. Inscripto', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  MONOTRIBUTISTA:        { label: 'Monotributista',  className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  EXENTO:                { label: 'Exento',           className: 'text-gray-600 bg-gray-100 border-gray-200' },
  CONSUMIDOR_FINAL:      { label: 'Cons. Final',      className: 'text-amber-700 bg-amber-50 border-amber-200' },
};

export default function SupplierAccountsPage() {
  const navigate = useNavigate();
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<Record<string, Record<string, number>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await suppliersService.getAll({ page, limit, search });
      setSuppliers(res.data);
      setTotal(res.total);

      // Fetch balance for each supplier (por moneda)
      const balanceMap: Record<string, Record<string, number>> = {};
      await Promise.all(
        res.data.map(async (s: Supplier) => {
          try {
            const account = await ordenPagosService.getSupplierAccount(s.id, { page: 1, limit: 1 });
            balanceMap[s.id] = account.balance;
          } catch {
            balanceMap[s.id] = {};
          }
        })
      );
      setBalances(balanceMap);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, fiscalMode]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Proveedor',
      render: (s) => {
        const color = avatarColor(s.name);
        const tax = TAX_BADGE[s.taxCondition];
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${color.bg} ${color.text}`}>
              {s.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">{s.name}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tax.className}`}>
                  {tax.label}
                </span>
              </div>
              {s.email && (
                <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">{s.email}</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'cuit',
      header: 'CUIT',
      render: (s) => s.cuit
        ? <span className="font-mono text-xs text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded">{formatCuit(s.cuit)}</span>
        : <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>,
    },
    {
      key: 'balance',
      header: 'Saldo',
      render: (s) => {
        const byCurrency = balances[s.id] ?? {};
        const entries = Object.entries(byCurrency).filter(([, v]) => Math.abs(v) > 0.005);
        if (entries.length === 0) return <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {entries.map(([currency, balance]) => {
              const weOwe = balance > 0;
              return (
                <span key={currency} className={`text-sm font-semibold tabular-nums ${weOwe ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {weOwe ? '' : '+'}{formatCurrency(Math.abs(balance), currency)}
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (s) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
          {s.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: () => (
        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors duration-150" />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cuentas corrientes proveedores"
        subtitle={`${total} ${total === 1 ? 'proveedor' : 'proveedores'}`}
      />

      <Card padding="none">
        <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Buscar proveedor…"
            className="w-64"
          />
        </div>

        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          keyExtractor={(s) => s.id}
          onRowClick={(s) => navigate(`/supplier-accounts/${s.id}`)}
          emptyMessage={search ? 'Sin resultados para la búsqueda' : 'No hay proveedores registrados'}
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (l) => { setLimit(l); setPage(1); },
          }}
        />
      </Card>
    </div>
  );
}
