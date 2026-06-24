import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DollarSign, Mail, Phone, Hash, FileText,
  TrendingDown, TrendingUp, Minus, Truck, Search, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { suppliersService, ordenPagosService } from '../../services';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import type { Supplier, TaxCondition } from '../../types';
import type { SupplierAccountMovement, SupplierMovementKind, SupplierMovementType } from '../../types/ordenPago.types';

// ── Avatar helper ────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
];
function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, c) => c.charCodeAt(0) + acc, 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const TAX_LABEL: Record<TaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Resp. Inscripto',
  MONOTRIBUTISTA:        'Monotributista',
  EXENTO:                'Exento',
  CONSUMIDOR_FINAL:      'Cons. Final',
};

// ── Movement kind config ─────────────────────────────────────────
const KIND_CFG: Record<SupplierMovementKind, { label: string; className: string }> = {
  FC:        { label: 'Factura',      className: 'text-red-600 bg-red-50 border-red-200' },
  ND:        { label: 'Nota Débito',  className: 'text-red-600 bg-red-50 border-red-200' },
  NC:        { label: 'Nota Crédito', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  OP:        { label: 'Pago',         className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  NOTE:      { label: 'Nota interna', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  RETENTION: { label: 'Retención',    className: 'text-amber-700 bg-amber-50 border-amber-200' },
  PURCHASE:  { label: 'Compra',       className: 'text-slate-600 bg-slate-100 border-slate-200' },
  OTHER:     { label: 'Otro',         className: 'text-gray-500 bg-gray-50 border-gray-200' },
};
const KIND_ORDER: SupplierMovementKind[] = ['FC', 'NC', 'ND', 'OP', 'NOTE', 'RETENTION', 'PURCHASE', 'OTHER'];

// ── Balance card ─────────────────────────────────────────────────
function BalanceCard({ balance, isLoading }: { balance: number; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3 animate-pulse">
        <div className="h-4 w-20 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="h-8 w-36 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="h-5 w-24 bg-gray-100 dark:bg-slate-700 rounded-full" />
      </div>
    );
  }

  type BalanceStatus = 'weOwe' | 'favor' | 'settled';
  const status: BalanceStatus =
    balance > 0 ? 'weOwe' : balance < 0 ? 'favor' : 'settled';

  const statusCfg = {
    weOwe:   { label: 'Debemos al proveedor',   icon: TrendingDown, valueClass: 'text-red-600 dark:text-red-400',         badgeClass: 'text-red-600 bg-red-50 border-red-200'            },
    favor:   { label: 'A favor nuestro',         icon: TrendingUp,   valueClass: 'text-emerald-600 dark:text-emerald-400', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    settled: { label: 'Sin saldo pendiente',     icon: Minus,        valueClass: 'text-gray-400 dark:text-slate-500',      badgeClass: 'text-gray-500 bg-gray-100 border-gray-200'        },
  }[status];

  const StatusIcon = statusCfg.icon;

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          Saldo ARS
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </span>
      </div>

      <p className={`text-3xl font-bold tabular-nums ${statusCfg.valueClass}`}>
        {formatCurrency(Math.abs(balance), 'ARS')}
      </p>
    </div>
  );
}

// ── Page skeleton ─────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      <div className="h-36 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      <div className="h-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function SupplierAccountDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();

  const [supplier,  setSupplier]  = useState<Supplier | null>(null);
  const [movements, setMovements] = useState<SupplierAccountMovement[]>([]);
  const [balance,   setBalance]   = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | SupplierMovementType>('');
  const [kindFilter, setKindFilter] = useState<Set<SupplierMovementKind>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const hasActiveFilters = !!(search || typeFilter || kindFilter.size > 0 || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch(''); setTypeFilter(''); setKindFilter(new Set()); setDateFrom(''); setDateTo('');
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    if (!supplierId) return;
    setIsLoading(true);
    try {
      const [supplierData, accountData] = await Promise.all([
        suppliersService.getById(supplierId),
        ordenPagosService.getSupplierAccount(supplierId, {
          page: 1,
          limit: 1000, // vista analítica: traemos todo el set filtrado para selección/neto
          type: typeFilter || undefined,
          kinds: kindFilter.size > 0 ? Array.from(kindFilter) : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: debouncedSearch || undefined,
        }),
      ]);
      setSupplier(supplierData);
      setBalance(accountData.balance);
      setMovements(accountData.data);
      // prune selección a ids visibles
      setSelected((prev) => {
        const ids = new Set(accountData.data.map((m) => m.id));
        const next = new Set<string>();
        prev.forEach((id) => { if (ids.has(id)) next.add(id); });
        return next;
      });
    } catch {
      toast.error('Error al cargar cuenta corriente');
      navigate('/supplier-accounts');
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, typeFilter, kindFilter, dateFrom, dateTo, debouncedSearch, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleKind = (k: SupplierMovementKind) => {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = movements.length > 0 && selected.size === movements.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(movements.map((m) => m.id)));
  };

  // Totals of selected (o de todo lo filtrado si no hay selección)
  const summary = useMemo(() => {
    const rows = selected.size > 0 ? movements.filter((m) => selected.has(m.id)) : movements;
    let debit = 0, credit = 0;
    for (const m of rows) {
      if (m.type === 'DEBIT') debit += Number(m.amount);
      else credit += Number(m.amount);
    }
    return { count: rows.length, debit, credit, net: debit - credit, isSelection: selected.size > 0 };
  }, [movements, selected]);

  if (isLoading && !supplier) {
    return (
      <div>
        <PageHeader title="Cuenta corriente proveedor" backTo="/supplier-accounts" />
        <PageSkeleton />
      </div>
    );
  }

  if (!supplier) return null;

  const color = avatarColor(supplier.name);

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Cuenta corriente proveedor"
        subtitle={supplier.name}
        backTo="/supplier-accounts"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/suppliers/${supplier.id}`)}>
              <Truck className="w-3.5 h-3.5 mr-1.5" />
              Ver proveedor
            </Button>
            <Button size="sm" onClick={() => navigate('/orden-pagos/new')}>
              <DollarSign className="w-3.5 h-3.5 mr-1.5" />
              Nueva orden de pago
            </Button>
          </div>
        }
      />

      {/* ── Supplier info bar ── */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base font-bold ${color.bg} ${color.text}`}>
          {supplier.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{supplier.name}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{TAX_LABEL[supplier.taxCondition]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500 dark:text-slate-400">
          {supplier.cuit && (
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{formatCuit(supplier.cuit)}</span>
            </span>
          )}
          {supplier.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="text-xs">{supplier.email}</span>
            </span>
          )}
          {supplier.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="text-xs">{supplier.phone}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Balance card ── */}
      <BalanceCard balance={balance} isLoading={isLoading} />

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Nº o descripción…"
              className="w-60 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
            />
          </div>

          {/* Type segmented */}
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            {([['', 'Todos'], ['DEBIT', 'Débito'], ['CREDIT', 'Crédito']] as const).map(([val, label]) => (
              <button key={val}
                onClick={() => setTypeFilter(val as '' | SupplierMovementType)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  typeFilter === val ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Desde"
              className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300" />
            <span className="text-gray-400 text-sm">–</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Hasta"
              className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300" />
          </div>

          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>

        {/* Kind chips */}
        <div className="flex flex-wrap gap-1.5">
          {KIND_ORDER.map((k) => {
            const active = kindFilter.has(k);
            return (
              <button key={k} onClick={() => toggleKind(k)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  active ? KIND_CFG[k].className + ' ring-1 ring-offset-1 ring-current' : 'text-gray-400 bg-gray-50 dark:bg-slate-700/40 border-gray-200 dark:border-slate-700'
                }`}>
                {KIND_CFG[k].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Movements table ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Movimientos
            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {movements.length}</span>
          </h3>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())}
              className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline">
              Deseleccionar ({selected.size})
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
              <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                </th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Sin movimientos</td></tr>
              ) : (
                movements.map((mov) => {
                  const isCredit = mov.type === 'CREDIT';
                  const kind = mov.kind ?? 'OTHER';
                  const cfg = KIND_CFG[kind];
                  const isSel = selected.has(mov.id);
                  const d = new Date(mov.createdAt);
                  return (
                    <tr key={mov.id} onClick={() => toggleRow(mov.id)}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-gray-50/60 dark:hover:bg-slate-700/40'}`}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleRow(mov.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm text-gray-800 dark:text-slate-200">{d.toLocaleDateString('es-AR')}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">{d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{mov.docNumber || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[280px]">{mov.description || '—'}</p>
                          {mov.purchaseId && (
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/purchases/${mov.purchaseId}`); }}
                              className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1 mt-0.5 hover:underline">
                              <FileText className="w-3 h-3" /> Ver compra
                            </button>
                          )}
                          {mov.ordenPagoId && (
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/orden-pagos/${mov.ordenPagoId}`); }}
                              className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1 mt-0.5 hover:underline">
                              <FileText className="w-3 h-3" /> Ver orden de pago
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold tabular-nums ${isCredit ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {isCredit ? '−' : '+'}{formatCurrency(mov.amount, 'ARS')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm tabular-nums font-mono ${
                          mov.balance > 0 ? 'text-red-500 dark:text-red-400' : mov.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'
                        }`}>
                          {formatCurrency(mov.balance, 'ARS')}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Selection / totals summary bar ── */}
      {movements.length > 0 && (
        <div className="sticky bottom-4 z-20 rounded-xl border border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              {summary.isSelection ? `Seleccionados · ${summary.count}` : `Todos los movimientos · ${summary.count}`}
            </span>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-gray-400">Débitos:</span>
                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(summary.debit, 'ARS')}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-gray-400">Créditos:</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.credit, 'ARS')}</span>
              </span>
              <span className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Neto</span>
                <span className={`text-base font-bold tabular-nums ${
                  summary.net > 0 ? 'text-red-600 dark:text-red-400' : summary.net < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'
                }`}>
                  {formatCurrency(Math.abs(summary.net), 'ARS')}
                </span>
                <span className="text-[11px] text-gray-400">
                  {summary.net > 0 ? '(debemos)' : summary.net < 0 ? '(a favor)' : ''}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
