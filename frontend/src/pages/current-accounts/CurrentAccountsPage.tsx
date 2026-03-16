import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { customersService, currentAccountsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Customer, CurrentAccount, TaxCondition } from '../../types';

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

// ── Tax condition config ─────────────────────────────────────────
const TAX_BADGE: Record<TaxCondition, { label: string; className: string }> = {
  RESPONSABLE_INSCRIPTO: { label: 'Resp. Inscripto', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  MONOTRIBUTISTA:        { label: 'Monotributista',  className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  EXENTO:                { label: 'Exento',           className: 'text-gray-600 bg-gray-100 border-gray-200' },
  CONSUMIDOR_FINAL:      { label: 'Cons. Final',      className: 'text-amber-700 bg-amber-50 border-amber-200' },
};

export default function CurrentAccountsPage() {
  const navigate = useNavigate();
  const [customers,       setCustomers]       = useState<Customer[]>([]);
  const [accountsWithDebt,setAccountsWithDebt]= useState<CurrentAccount[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(DEFAULT_PAGE_SIZE);
  const [total,      setTotal]      = useState(0);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await customersService.getAll({ page, limit, search });
      setCustomers(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Error al cargar clientes');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Load accounts with debt for balance column
  useEffect(() => {
    currentAccountsService.getAllWithDebt()
      .then(setAccountsWithDebt)
      .catch(() => {});
  }, []);

  // Find account by customer+currency
  const getAccount = (customerId: string, currency: 'ARS' | 'USD') =>
    accountsWithDebt.find((a) => a.customerId === customerId && a.currency === currency);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: (c) => {
        const color = avatarColor(c.name);
        const tax   = TAX_BADGE[c.taxCondition];
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${color.bg} ${color.text}`}>
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">{c.name}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tax.className}`}>
                  {tax.label}
                </span>
              </div>
              {c.email && (
                <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">{c.email}</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'taxId',
      header: 'CUIT/CUIL',
      render: (c) => c.taxId
        ? <span className="font-mono text-xs text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded">{c.taxId}</span>
        : <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>,
    },
    {
      key: 'balanceARS',
      header: 'Saldo ARS',
      render: (c) => {
        const acc = getAccount(c.id, 'ARS');
        if (!acc || acc.balance === 0) return <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>;
        const owes = acc.balance > 0;
        return (
          <span className={`text-sm font-semibold tabular-nums ${owes ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {owes ? '' : '+'}{formatCurrency(Math.abs(acc.balance), 'ARS')}
          </span>
        );
      },
    },
    {
      key: 'balanceUSD',
      header: 'Saldo USD',
      render: (c) => {
        const acc = getAccount(c.id, 'USD');
        if (!acc || acc.balance === 0) return <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>;
        const owes = acc.balance > 0;
        return (
          <span className={`text-sm font-semibold tabular-nums ${owes ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {owes ? '' : '+'}{formatCurrency(Math.abs(acc.balance), 'USD')}
          </span>
        );
      },
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (c) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
          {c.isActive ? 'Activo' : 'Inactivo'}
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
        title="Cuentas corrientes"
        subtitle={`${total} ${total === 1 ? 'cliente' : 'clientes'}`}
      />

      <Card padding="none">
        <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Buscar cliente…"
            className="w-64"
          />
        </div>

        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          keyExtractor={(c) => c.id}
          onRowClick={(c) => navigate(`/current-accounts/${c.id}`)}
          emptyMessage={search ? 'Sin resultados para la búsqueda' : 'No hay clientes registrados'}
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
