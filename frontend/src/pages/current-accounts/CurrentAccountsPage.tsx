import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { customersService, currentAccountsService } from '../../services';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import type {
  Customer, CurrentAccount, TaxCondition, Currency,
  CurrentAccountAging, CurrentAccountStats,
} from '../../types';

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

// ── Filtros de cartera ───────────────────────────────────────────
// "Todos" recorre el catálogo de clientes (paginado por el servidor); el resto
// trabaja sobre las cuentas con saldo, que llegan completas en una sola carga.
type Filter = 'debt' | 'overdue' | 'credit' | 'current' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'debt',    label: 'Con deuda' },
  { key: 'overdue', label: 'Vencidos' },
  { key: 'credit',  label: 'A favor' },
  { key: 'current', label: 'Al día' },
  { key: 'all',     label: 'Todos' },
];

type Sort = 'oldest' | 'amount' | 'name';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'oldest', label: 'Deuda más antigua' },
  { key: 'amount', label: 'Mayor saldo' },
  { key: 'name',   label: 'Alfabético' },
];

/** Fila de la tabla: el cliente con su cuenta y su antigüedad, si las tiene. */
type Row = {
  customer: Customer;
  account?: CurrentAccount;
  aging?: CurrentAccountAging;
};

// ── Barra de antigüedad (a vencer / 0-30 / 31-60 / +60) ──────────
function AgingBar({ aging }: { aging: CurrentAccountAging }) {
  const late = aging.d61_90 + aging.d90plus;
  const segments = [
    { value: aging.notDue,  className: 'bg-emerald-400' },
    { value: aging.d0_30,   className: 'bg-amber-400' },
    { value: aging.d31_60,  className: 'bg-orange-400' },
    { value: late,          className: 'bg-red-500' },
  ];
  return (
    <div className="flex gap-0.5 w-[120px]">
      {segments.map((s, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full ${s.value > 0 ? s.className : 'bg-gray-100 dark:bg-slate-700'}`}
          style={{ flexGrow: s.value > 0 ? s.value : 1 }}
        />
      ))}
    </div>
  );
}

/** Badge de días de atraso del comprobante más viejo. */
function OverdueBadge({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800">
        al día
      </span>
    );
  }
  const cls = days > 60
    ? 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800'
    : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800';
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{days} días</span>;
}

// ── Tarjeta de indicador ─────────────────────────────────────────
function StatCard({
  label, value, valueClass, hint, children,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm p-4">
      <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${valueClass ?? 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

export default function CurrentAccountsPage() {
  const navigate = useNavigate();
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [accounts,   setAccounts]   = useState<CurrentAccount[]>([]);
  const [stats,      setStats]      = useState<CurrentAccountStats | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<Filter>('debt');
  const [sort,       setSort]       = useState<Sort>('oldest');
  const [currency,   setCurrency]   = useState<Currency>('ARS');
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(DEFAULT_PAGE_SIZE);
  const [total,      setTotal]      = useState(0);

  // Catálogo completo de clientes: solo hace falta en el filtro "Todos".
  const fetchCustomers = useCallback(async () => {
    if (filter !== 'all') return;
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
  }, [page, limit, search, filter]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      currentAccountsService.getAllWithDebt(true),
      currentAccountsService.getStats(currency).catch(() => null),
    ])
      .then(([accs, st]) => { setAccounts(accs); setStats(st); })
      .catch(() => toast.error('Error al cargar las cuentas'))
      .finally(() => setIsLoading(false));
  }, [fiscalMode, currency]);

  useEffect(() => { setPage(1); }, [filter, currency, sort]);

  const agingByCustomer = useMemo(() => {
    const map = new Map<string, CurrentAccountAging>();
    for (const a of stats?.aging ?? []) map.set(a.entityId, a);
    return map;
  }, [stats]);

  // Cuenta por cliente+moneda. En modo "Todos" puede haber una fila FORMAL y
  // otra INFORMAL con saldo para la misma moneda — se suman.
  const accountFor = useCallback((customerId: string, cur: Currency): CurrentAccount | undefined => {
    const matches = accounts.filter((a) => a.customerId === customerId && a.currency === cur);
    if (matches.length <= 1) return matches[0];
    return { ...matches[0], balance: matches.reduce((s, a) => s + Number(a.balance), 0), creditLimit: null };
  }, [accounts]);

  // ── Indicadores ───────────────────────────────────────────────
  const receivable = useMemo(() => {
    const sum = (cur: Currency) => accounts
      .filter((a) => a.currency === cur && Number(a.balance) > 0)
      .reduce((s, a) => s + Number(a.balance), 0);
    return { ARS: sum('ARS'), USD: sum('USD') };
  }, [accounts]);

  const overdue = useMemo(() => {
    const rows = stats?.aging ?? [];
    const amount = rows.reduce((s, a) => s + a.d31_60 + a.d61_90 + a.d90plus, 0);
    const count = rows.filter((a) => a.d31_60 + a.d61_90 + a.d90plus > 0).length;
    const totalAging = rows.reduce((s, a) => s + a.total, 0);
    return { amount, count, pct: totalAging > 0 ? Math.round((amount / totalAging) * 100) : 0 };
  }, [stats]);

  const agingTotals = useMemo(() => {
    const rows = stats?.aging ?? [];
    const acc = { notDue: 0, d0_30: 0, d31_60: 0, late: 0 };
    for (const a of rows) {
      acc.notDue += a.notDue;
      acc.d0_30  += a.d0_30;
      acc.d31_60 += a.d31_60;
      acc.late   += a.d61_90 + a.d90plus;
    }
    return acc;
  }, [stats]);

  const collected = useMemo(() => {
    const row = stats?.collectedThisMonth.find((c) => c.currency === currency);
    return { total: row?.total ?? 0, count: row?.count ?? 0 };
  }, [stats, currency]);

  const overLimit = useMemo(
    () => accounts.filter((a) => a.creditLimit != null && Number(a.balance) > Number(a.creditLimit)),
    [accounts]
  );

  // ── Filas ─────────────────────────────────────────────────────
  const localRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows: Row[] = accounts
      .filter((a) => a.currency === currency && a.customer)
      .map((a) => ({
        customer: a.customer as Customer,
        account: a,
        aging: agingByCustomer.get(a.customerId),
      }));

    // Una cuenta FORMAL y otra INFORMAL del mismo cliente se muestran juntas.
    const merged = new Map<string, Row>();
    for (const r of rows) {
      const prev = merged.get(r.customer.id);
      if (!prev) merged.set(r.customer.id, r);
      else merged.set(r.customer.id, {
        ...prev,
        account: { ...prev.account!, balance: Number(prev.account!.balance) + Number(r.account!.balance), creditLimit: null },
      });
    }
    rows = Array.from(merged.values());

    rows = rows.filter((r) => {
      const balance = Number(r.account?.balance ?? 0);
      const days = r.aging?.oldestDays ?? 0;
      if (filter === 'debt')    return balance > 0;
      if (filter === 'credit')  return balance < 0;
      if (filter === 'overdue') return balance > 0 && days > 0;
      if (filter === 'current') return balance > 0 && days === 0;
      return true;
    });

    if (term) {
      const digits = term.replace(/\D/g, '');
      rows = rows.filter((r) =>
        r.customer.name.toLowerCase().includes(term) ||
        (digits.length > 0 && (r.customer.taxId ?? '').replace(/\D/g, '').includes(digits))
      );
    }

    rows.sort((a, b) => {
      if (sort === 'name')   return a.customer.name.localeCompare(b.customer.name, 'es-AR');
      if (sort === 'amount') return Math.abs(Number(b.account?.balance ?? 0)) - Math.abs(Number(a.account?.balance ?? 0));
      return (b.aging?.oldestDays ?? 0) - (a.aging?.oldestDays ?? 0);
    });
    return rows;
  }, [accounts, agingByCustomer, currency, filter, search, sort]);

  const isLocal = filter !== 'all';
  const rows: Row[] = isLocal
    ? localRows.slice((page - 1) * limit, page * limit)
    : customers.map((c) => ({
        customer: c,
        account: accountFor(c.id, currency),
        aging: agingByCustomer.get(c.id),
      }));
  const rowsTotal = isLocal ? localRows.length : total;

  const screenTotal = rows.reduce((s, r) => s + Number(r.account?.balance ?? 0), 0);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: ({ customer: c }) => {
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
      render: ({ customer: c }) => c.taxId
        ? <span className="font-mono text-xs text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded">{formatCuit(c.taxId)}</span>
        : <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>,
    },
    {
      key: 'aging',
      header: 'Antigüedad de la deuda',
      render: ({ aging }) => {
        if (!aging || aging.total <= 0) return <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>;
        return (
          <div className="flex items-center gap-2.5">
            <AgingBar aging={aging} />
            <OverdueBadge days={aging.oldestDays} />
          </div>
        );
      },
    },
    {
      key: 'balance',
      header: `Saldo ${currency}`,
      className: 'text-right',
      render: ({ account }) => {
        const balance = Number(account?.balance ?? 0);
        if (!account || balance === 0) return <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>;
        const owes = balance > 0;
        return (
          <span className={`text-sm font-bold tabular-nums ${owes ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {owes ? '' : '+'}{formatCurrency(Math.abs(balance), currency)}
          </span>
        );
      },
    },
    {
      key: 'creditLimit',
      header: 'Límite',
      render: ({ account }) => {
        const limit_ = account?.creditLimit;
        if (!account || limit_ == null) return <span className="text-xs text-gray-300 dark:text-slate-600">Sin límite</span>;
        const balance = Number(account.balance);
        const pct = Number(limit_) > 0 ? Math.max(0, (balance / Number(limit_)) * 100) : 0;
        const over = pct > 100;
        return (
          <div className="w-[92px]">
            <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${over ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <p className={`mt-1 text-[10px] ${over ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-500'}`}>
              {over
                ? `${pct.toFixed(0)}% del límite`
                : `${pct.toFixed(0)}% de ${formatCurrency(Number(limit_), currency)}`}
            </p>
          </div>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Últ. mov.',
      render: ({ account }) => account
        ? <span className="text-xs text-gray-500 dark:text-slate-400">{new Date(account.updatedAt).toLocaleDateString('es-AR')}</span>
        : <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>,
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
        subtitle={`${new Set(accounts.filter((a) => Number(a.balance) !== 0).map((a) => a.customerId)).size} clientes con saldo`}
      />

      {/* ── Indicadores de cartera ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Por cobrar"
          value={formatCurrency(receivable[currency], currency)}
          valueClass="text-red-600 dark:text-red-400"
          hint={
            currency === 'ARS'
              ? (receivable.USD > 0 ? `+ ${formatCurrency(receivable.USD, 'USD')} en dólares` : undefined)
              : (receivable.ARS > 0 ? `+ ${formatCurrency(receivable.ARS, 'ARS')} en pesos` : undefined)
          }
        >
          {stats && (
            <>
              <div className="flex gap-0.5 mt-3">
                {[
                  { v: agingTotals.notDue, c: 'bg-emerald-400' },
                  { v: agingTotals.d0_30,  c: 'bg-amber-400' },
                  { v: agingTotals.d31_60, c: 'bg-orange-400' },
                  { v: agingTotals.late,   c: 'bg-red-500' },
                ].map((s, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full ${s.v > 0 ? s.c : 'bg-gray-100 dark:bg-slate-700'}`}
                    style={{ flexGrow: s.v > 0 ? s.v : 1 }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-gray-400 dark:text-slate-500">
                <span>Al día</span><span>1-30</span><span>31-60</span><span>+60 días</span>
              </div>
            </>
          )}
        </StatCard>

        <StatCard
          label="Vencido +30 días"
          value={formatCurrency(overdue.amount, currency)}
          valueClass="text-amber-600 dark:text-amber-400"
          hint={`${overdue.count} ${overdue.count === 1 ? 'cliente' : 'clientes'} · ${overdue.pct}% de la cartera`}
        >
          {overdue.amount > 0 && (
            <span className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800">
              <Clock className="w-3 h-3" />
              Requiere gestión
            </span>
          )}
        </StatCard>

        <StatCard
          label="Cobrado este mes"
          value={formatCurrency(collected.total, currency)}
          valueClass="text-emerald-600 dark:text-emerald-400"
          hint={`${collected.count} ${collected.count === 1 ? 'recibo' : 'recibos'}`}
        />

        <StatCard
          label="Límite excedido"
          value={String(overLimit.length)}
          hint="clientes por encima de su límite de crédito"
        >
          {overLimit.length > 0 && (
            <button
              type="button"
              onClick={() => { setFilter('debt'); setSort('amount'); }}
              className="inline-flex items-center gap-1.5 mt-3"
            >
              <span className="flex">
                {overLimit.slice(0, 3).map((a, i) => {
                  const name = a.customer?.name ?? '?';
                  const color = avatarColor(name);
                  return (
                    <span
                      key={a.id}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 border-white dark:border-slate-800 ${color.bg} ${color.text}`}
                      style={{ marginLeft: i === 0 ? 0 : -6 }}
                      title={name}
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                  );
                })}
              </span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Ver todos</span>
            </button>
          )}
        </StatCard>
      </div>

      <Card padding="none">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Buscar cliente o CUIT…"
              className="w-60"
            />
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors duration-150 ${
                    filter === f.key
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isLocal && (
              <>
                <span className="text-xs text-gray-400 dark:text-slate-500">Ordenar por</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </>
            )}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
              {(['ARS', 'USD'] as Currency[]).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setCurrency(cur)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                    currency === cur
                      ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-200 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          keyExtractor={(r) => r.customer.id}
          onRowClick={(r) => navigate(`/current-accounts/${r.customer.id}`)}
          emptyMessage={
            search ? 'Sin resultados para la búsqueda'
            : filter === 'credit' ? 'Ningún cliente tiene saldo a favor'
            : filter === 'overdue' ? 'No hay deuda vencida'
            : filter === 'debt' ? 'Ningún cliente tiene saldo pendiente'
            : 'No hay clientes registrados'
          }
          pagination={{
            page,
            totalPages: Math.ceil(rowsTotal / limit),
            limit,
            total: rowsTotal,
            onPageChange: setPage,
            onLimitChange: (l) => { setLimit(l); setPage(1); },
          }}
        />

        {rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 dark:bg-slate-700/40 border-t border-gray-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              Total en pantalla
            </span>
            <span className={`text-sm font-bold tabular-nums ${screenTotal >= 0 ? 'text-gray-900 dark:text-white' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {formatCurrency(Math.abs(screenTotal), currency)}
            </span>
          </div>
        )}
      </Card>

      {!stats && !isLoading && (
        <p className="flex items-center gap-1.5 mt-3 text-xs text-gray-400 dark:text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5" />
          No se pudo calcular la antigüedad de la deuda; los saldos se muestran igual.
        </p>
      )}
    </div>
  );
}
