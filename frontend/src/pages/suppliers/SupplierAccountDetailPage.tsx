import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DollarSign, Mail, Phone, Hash, FileText,
  TrendingDown, TrendingUp, Minus, Truck, Search, X, FileDown, Plus, Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { suppliersService, ordenPagosService, chequesService, internalNotesService } from '../../services';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import type { Supplier, TaxCondition } from '../../types';
import { CHEQUE_STATUS_LABELS, type Cheque } from '../../types/cheque.types';
import type {
  SupplierAccountMovement, SupplierMovementKind, SupplierMovementType,
  OpenAccountItems, OpenDebitItem, OpenCreditItem,
} from '../../types/ordenPago.types';

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
  ADJUSTMENT:{ label: 'Ajuste',       className: 'text-violet-700 bg-violet-50 border-violet-200' },
  OTHER:     { label: 'Otro',         className: 'text-gray-500 bg-gray-50 border-gray-200' },
};
const KIND_ORDER: SupplierMovementKind[] = ['FC', 'NC', 'ND', 'OP', 'NOTE', 'RETENTION', 'PURCHASE', 'ADJUSTMENT', 'OTHER'];

// ── Balance card (una por moneda — nunca se netea USD contra ARS) ─
type BalanceStatus = 'weOwe' | 'favor' | 'settled';
const BALANCE_STATUS_CFG: Record<BalanceStatus, { label: string; icon: typeof TrendingDown; valueClass: string; badgeClass: string }> = {
  weOwe:   { label: 'Debemos al proveedor',   icon: TrendingDown, valueClass: 'text-red-600 dark:text-red-400',         badgeClass: 'text-red-600 bg-red-50 border-red-200'            },
  favor:   { label: 'A favor nuestro',         icon: TrendingUp,   valueClass: 'text-emerald-600 dark:text-emerald-400', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  settled: { label: 'Sin saldo pendiente',     icon: Minus,        valueClass: 'text-gray-400 dark:text-slate-500',      badgeClass: 'text-gray-500 bg-gray-100 border-gray-200'        },
};

function SingleBalanceCard({ currency, balance }: { currency: string; balance: number }) {
  const status: BalanceStatus = balance > 0 ? 'weOwe' : balance < 0 ? 'favor' : 'settled';
  const statusCfg = BALANCE_STATUS_CFG[status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          Saldo {currency}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </span>
      </div>

      <p className={`text-3xl font-bold tabular-nums ${statusCfg.valueClass}`}>
        {formatCurrency(Math.abs(balance), currency)}
      </p>
    </div>
  );
}

function BalanceCard({ balances, isLoading }: { balances: Record<string, number>; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3 animate-pulse">
        <div className="h-4 w-20 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="h-8 w-36 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="h-5 w-24 bg-gray-100 dark:bg-slate-700 rounded-full" />
      </div>
    );
  }

  const currencies = Object.keys(balances).length > 0 ? Object.keys(balances).sort() : ['ARS'];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {currencies.map((currency) => (
        <SingleBalanceCard key={currency} currency={currency} balance={balances[currency] ?? 0} />
      ))}
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
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);

  const [supplier,  setSupplier]  = useState<Supplier | null>(null);
  const [movements, setMovements] = useState<SupplierAccountMovement[]>([]);
  const [balance,   setBalance]   = useState<Record<string, number>>({});
  const [openingBalance, setOpeningBalance] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Tab (Movimientos / Cuenta Corriente / Cheques)
  const [tab, setTab] = useState<'movimientos' | 'cuentaCorriente' | 'cheques'>('movimientos');
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [chequesLoading, setChequesLoading] = useState(false);

  // Cuenta Corriente: imputación manual de débitos (FC/ND) contra créditos (NC/pago a cuenta)
  const [openItems, setOpenItems] = useState<OpenAccountItems>({ debits: [], credits: [] });
  const [openItemsLoading, setOpenItemsLoading] = useState(false);
  const [ccCurrencyFilter, setCcCurrencyFilter] = useState<'' | 'ARS' | 'USD'>('');
  const [selectedDebits, setSelectedDebits] = useState<Map<string, string>>(new Map());
  const [selectedCredits, setSelectedCredits] = useState<Map<string, string>>(new Map());
  const [manualAmount, setManualAmount] = useState('');
  const [adjDescription, setAdjDescription] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  // Ajuste manual (ND/NC interna que mueve la cuenta)
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustType, setAdjustType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | SupplierMovementType>('');
  const [kindFilter, setKindFilter] = useState<Set<SupplierMovementKind>>(new Set());
  const [currencyFilter, setCurrencyFilter] = useState<'' | 'ARS' | 'USD'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const hasActiveFilters = !!(search || typeFilter || kindFilter.size > 0 || currencyFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch(''); setTypeFilter(''); setKindFilter(new Set()); setCurrencyFilter(''); setDateFrom(''); setDateTo('');
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
          currency: currencyFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: debouncedSearch || undefined,
        }),
      ]);
      setSupplier(supplierData);
      setBalance(accountData.balance ?? {});
      setOpeningBalance(accountData.openingBalance ?? {});
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
  }, [supplierId, typeFilter, kindFilter, currencyFilter, dateFrom, dateTo, debouncedSearch, navigate, fiscalMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cheques del proveedor (se cargan al abrir la pestaña)
  const fetchCheques = useCallback(async () => {
    if (!supplierId) return;
    setChequesLoading(true);
    try {
      const res = await chequesService.getAll({ supplierId, limit: 200 });
      setCheques(res.data);
    } catch {
      toast.error('Error al cargar cheques');
    } finally {
      setChequesLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (tab === 'cheques') fetchCheques();
  }, [tab, fetchCheques]);

  // Ítems abiertos de cuenta corriente (se cargan al abrir la pestaña)
  const fetchOpenItems = useCallback(async () => {
    if (!supplierId) return;
    setOpenItemsLoading(true);
    try {
      const data = await ordenPagosService.getOpenItems(supplierId);
      setOpenItems(data);
      setSelectedDebits(new Map());
      setSelectedCredits(new Map());
      setManualAmount(''); setAdjDescription('');
    } catch {
      toast.error('Error al cargar los comprobantes abiertos');
    } finally {
      setOpenItemsLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (tab === 'cuentaCorriente') fetchOpenItems();
  }, [tab, fetchOpenItems]);

  const toggleDebit = (item: OpenDebitItem) => {
    setSelectedDebits((prev) => {
      const next = new Map(prev);
      if (next.has(item.purchaseInvoiceId)) next.delete(item.purchaseInvoiceId);
      else next.set(item.purchaseInvoiceId, item.balance.toFixed(2));
      return next;
    });
  };
  const toggleCredit = (item: OpenCreditItem) => {
    const key = item.source === 'INVOICE' ? item.purchaseInvoiceId! : item.movementId!;
    setSelectedCredits((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, item.balance.toFixed(2));
      return next;
    });
  };

  // Moneda de la imputación: la del primer ítem tildado (débito o crédito)
  const ccCurrency = useMemo(() => {
    const firstDebit = openItems.debits.find((d) => selectedDebits.has(d.purchaseInvoiceId));
    if (firstDebit) return firstDebit.currency;
    const firstCredit = openItems.credits.find((c) =>
      selectedCredits.has(c.source === 'INVOICE' ? c.purchaseInvoiceId! : c.movementId!));
    return firstCredit?.currency ?? null;
  }, [openItems, selectedDebits, selectedCredits]);

  // Filtro de moneda de la pestaña (independiente de la selección ya hecha)
  const visibleDebits = useMemo(
    () => ccCurrencyFilter ? openItems.debits.filter((d) => d.currency === ccCurrencyFilter) : openItems.debits,
    [openItems.debits, ccCurrencyFilter]
  );
  const visibleCredits = useMemo(
    () => ccCurrencyFilter ? openItems.credits.filter((c) => c.currency === ccCurrencyFilter) : openItems.credits,
    [openItems.credits, ccCurrencyFilter]
  );

  const ccSumDebits = useMemo(() => Array.from(selectedDebits.values()).reduce((s, v) => s + (parseFloat(v) || 0), 0), [selectedDebits]);
  const ccSumCredits = useMemo(() => Array.from(selectedCredits.values()).reduce((s, v) => s + (parseFloat(v) || 0), 0), [selectedCredits]);
  const ccDiff = ccSumDebits - ccSumCredits;
  const ccHasSelection = selectedDebits.size > 0 || selectedCredits.size > 0;

  const handleCreateCcAdjustment = async () => {
    if (!supplierId || !ccCurrency) return;
    const manual = parseFloat(manualAmount) || 0;
    setSavingAdjustment(true);
    try {
      await ordenPagosService.createAdjustment(supplierId, {
        currency: ccCurrency,
        description: adjDescription.trim() || undefined,
        debits: Array.from(selectedDebits.entries()).map(([purchaseInvoiceId, amount]) => ({ purchaseInvoiceId, amount: parseFloat(amount) || 0 })),
        credits: Array.from(selectedCredits.entries()).map(([id, amount]) => {
          const src = openItems.credits.find((c) => (c.source === 'INVOICE' ? c.purchaseInvoiceId : c.movementId) === id);
          return src?.source === 'INVOICE'
            ? { purchaseInvoiceId: id, amount: parseFloat(amount) || 0 }
            : { movementId: id, amount: parseFloat(amount) || 0 };
        }),
        manualAmount: manual > 0 ? manual : undefined,
      });
      toast.success('Ajuste de cuenta corriente registrado');
      fetchOpenItems();
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar el ajuste');
    } finally {
      setSavingAdjustment(false);
    }
  };

  // Crear ajuste manual (ND interna = débito, NC interna = crédito). Ya mueve la cuenta.
  const handleCreateAdjust = async () => {
    const amount = parseFloat(adjustAmount);
    if (!supplierId) return;
    if (!amount || amount <= 0) { toast.error('Ingresá un importe válido'); return; }
    if (!adjustReason.trim()) { toast.error('Ingresá el motivo del ajuste'); return; }
    setSavingAdjust(true);
    try {
      await internalNotesService.create({
        type: adjustType,
        supplierId,
        currency: 'ARS',
        amount,
        reason: adjustReason.trim(),
      });
      toast.success(adjustType === 'DEBIT' ? 'Débito interno registrado' : 'Crédito interno registrado');
      setShowAdjust(false);
      setAdjustAmount(''); setAdjustReason(''); setAdjustType('DEBIT');
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar el ajuste');
    } finally {
      setSavingAdjust(false);
    }
  };

  // Exportar el resumen de cuenta (movimientos filtrados) a Excel
  const handleExport = () => {
    if (movements.length === 0) { toast.error('No hay movimientos para exportar'); return; }
    const rows = movements.map((m) => ({
      fechaImputable: new Date(m.createdAt).toLocaleDateString('es-AR'),
      fechaComprobante: m.docDate ? new Date(m.docDate).toLocaleDateString('es-AR') : '',
      tipo: KIND_CFG[m.kind ?? 'OTHER'].label,
      comprobante: m.docNumber ?? '',
      descripcion: m.description ?? '',
      moneda: m.currency,
      debito: m.type === 'DEBIT' ? Number(m.amount) : 0,
      credito: m.type === 'CREDIT' ? Number(m.amount) : 0,
      saldo: Number(m.balance),
    }));
    // Fila de totales: solo tiene sentido sumar débito/crédito/saldo cuando
    // todos los movimientos exportados están en la misma moneda.
    const currenciesPresent = Object.keys(totalsAll);
    const singleCurrency = currenciesPresent.length === 1 ? currenciesPresent[0] : null;
    exportToExcel(
      `cta_cte_${supplier?.name ?? 'proveedor'}`.replace(/\s+/g, '_'),
      'Cuenta corriente',
      [
        { header: 'F. Imputable',   key: 'fechaImputable',   width: 14 },
        { header: 'F. Comprobante', key: 'fechaComprobante', width: 14 },
        { header: 'Tipo',           key: 'tipo',             width: 14 },
        { header: 'Comprobante',    key: 'comprobante',      width: 18 },
        { header: 'Descripción',    key: 'descripcion',      width: 36 },
        { header: 'Moneda',        key: 'moneda',           width: 10 },
        { header: 'Débito',         key: 'debito',           width: 14, format: 'currency' },
        { header: 'Crédito',        key: 'credito',          width: 14, format: 'currency' },
        { header: 'Saldo',          key: 'saldo',            width: 14, format: 'currency' },
      ],
      rows,
      singleCurrency
        ? { descripcion: 'TOTALES', moneda: singleCurrency, debito: totalsAll[singleCurrency].debit, credito: totalsAll[singleCurrency].credit, saldo: balance[singleCurrency] ?? 0 }
        : { descripcion: 'TOTALES (ver por moneda arriba)' },
    );
  };

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

  // Totales por moneda: nunca se suma un débito en USD con uno en ARS.
  type CurrencyTotals = Record<string, { debit: number; credit: number }>;
  const sumByCurrency = (rows: SupplierAccountMovement[]): CurrencyTotals => {
    const totals: CurrencyTotals = {};
    for (const m of rows) {
      const t = (totals[m.currency] ??= { debit: 0, credit: 0 });
      if (m.type === 'DEBIT') t.debit += Number(m.amount);
      else t.credit += Number(m.amount);
    }
    return totals;
  };

  // Totals of selected (o de todo lo filtrado si no hay selección), por moneda
  const summary = useMemo(() => {
    const rows = selected.size > 0 ? movements.filter((m) => selected.has(m.id)) : movements;
    const byCurrency = sumByCurrency(rows);
    return { count: rows.length, byCurrency, isSelection: selected.size > 0 };
  }, [movements, selected]);

  // Totales de TODOS los movimientos filtrados (para el pie de la tabla), por moneda
  const totalsAll = useMemo(() => sumByCurrency(movements), [movements]);

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
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/suppliers/${supplier.id}`)}>
              <Truck className="w-3.5 h-3.5 mr-1.5" />
              Ver proveedor
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              Exportar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdjust(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Nuevo ajuste
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
      <BalanceCard balances={balance} isLoading={isLoading} />

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-700/50 p-1 rounded-lg w-fit">
        {([['movimientos', 'Movimientos'], ['cuentaCorriente', 'Cuenta Corriente'], ['cheques', 'Cheques']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === val ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'movimientos' && (
      <>
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

          {/* Currency segmented */}
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            {([['', 'Todas'], ['ARS', 'Pesos'], ['USD', 'Dólares']] as const).map(([val, label]) => (
              <button key={val}
                onClick={() => setCurrencyFilter(val as '' | 'ARS' | 'USD')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  currencyFilter === val ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300'
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
                <th className="px-4 py-3">F. Imputable</th>
                <th className="px-4 py-3">F. Comprobante</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {/* Saldo al inicio: solo al filtrar por fecha desde, una fila por moneda */}
              {!isLoading && dateFrom && Object.entries(openingBalance).map(([currency, ob]) => (
                <tr key={`opening-${currency}`} className="bg-gray-50/70 dark:bg-slate-800/40">
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                    {new Date(dateFrom).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-2.5" colSpan={4}>
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Saldo al inicio ({currency})</span>
                  </td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-sm tabular-nums font-mono ${
                      ob > 0 ? 'text-red-500 dark:text-red-400' : ob < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'
                    }`}>
                      {formatCurrency(ob, currency)}
                    </span>
                  </td>
                </tr>
              ))}
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Sin movimientos</td></tr>
              ) : (
                movements.map((mov) => {
                  const isCredit = mov.type === 'CREDIT';
                  const kind = mov.kind ?? 'OTHER';
                  const cfg = KIND_CFG[kind];
                  const isSel = selected.has(mov.id);
                  const d = new Date(mov.createdAt);
                  const docD = mov.docDate ? new Date(mov.docDate) : null;
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm text-gray-700 dark:text-slate-300">{docD ? docD.toLocaleDateString('es-AR') : '—'}</p>
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
                          {isCredit ? '−' : '+'}{formatCurrency(mov.amount, mov.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm tabular-nums font-mono ${
                          mov.balance > 0 ? 'text-red-500 dark:text-red-400' : mov.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'
                        }`}>
                          {formatCurrency(mov.balance, mov.currency)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && movements.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 dark:border-slate-600 bg-gray-50/70 dark:bg-slate-800/60">
                {Object.keys(totalsAll).sort().map((currency) => (
                  <tr key={currency}>
                    <td colSpan={6} className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Totales {currency} · {movements.filter((m) => m.currency === currency).length}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">+{formatCurrency(totalsAll[currency].debit, currency)}</span>
                        <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">−{formatCurrency(totalsAll[currency].credit, currency)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold tabular-nums font-mono ${
                        (balance[currency] ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : (balance[currency] ?? 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'
                      }`}>
                        {formatCurrency(balance[currency] ?? 0, currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Selection totals bar (solo al seleccionar filas; los totales generales van en el pie de la tabla) ── */}
      {summary.isSelection && (
        <div className="sticky bottom-4 z-20 rounded-xl border border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              {`Seleccionados · ${summary.count}`}
            </span>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {Object.entries(summary.byCurrency).sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => {
                const net = t.debit - t.credit;
                return (
                  <div key={currency} className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase">{currency}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-400">Débitos:</span>
                      <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(t.debit, currency)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-400">Créditos:</span>
                      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(t.credit, currency)}</span>
                    </span>
                    <span className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-slate-700">
                      <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Neto</span>
                      <span className={`text-base font-bold tabular-nums ${
                        net > 0 ? 'text-red-600 dark:text-red-400' : net < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'
                      }`}>
                        {formatCurrency(Math.abs(net), currency)}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {net > 0 ? '(debemos)' : net < 0 ? '(a favor)' : ''}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* ── Cuenta Corriente tab: imputación manual de débitos contra créditos ── */}
      {tab === 'cuentaCorriente' && (
        <div className="space-y-4 pb-24">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Seleccioná facturas/ND pendientes y los créditos (NC / pagos a cuenta) que las cubren. Si queda una
            diferencia chica, cargala como ajuste manual para cerrar el saldo — no hace falta que coincidan exacto.
          </p>

          {/* Currency segmented */}
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden w-fit">
            {([['', 'Todas'], ['ARS', 'Pesos'], ['USD', 'Dólares']] as const).map(([val, label]) => (
              <button key={val}
                onClick={() => setCcCurrencyFilter(val as '' | 'ARS' | 'USD')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  ccCurrencyFilter === val ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Débitos abiertos */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Facturas / ND pendientes
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {visibleDebits.length}</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
                {openItemsLoading ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Cargando…</p>
                ) : visibleDebits.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Sin facturas pendientes</p>
                ) : visibleDebits.map((item) => {
                  const disabled = !!ccCurrency && item.currency !== ccCurrency;
                  const checked = selectedDebits.has(item.purchaseInvoiceId);
                  return (
                    <div key={item.purchaseInvoiceId}
                      className={`px-4 py-3 flex items-center gap-3 ${disabled ? 'opacity-40' : 'cursor-pointer hover:bg-gray-50/60 dark:hover:bg-slate-700/40'}`}
                      onClick={() => !disabled && toggleDebit(item)}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleDebit(item)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-slate-200">{item.number}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          Saldo {formatCurrency(item.balance, item.currency)} de {formatCurrency(item.amount, item.currency)}
                        </p>
                      </div>
                      {checked && (
                        <input type="number" min={0} max={item.balance} step="0.01"
                          value={selectedDebits.get(item.purchaseInvoiceId) ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSelectedDebits((prev) => new Map(prev).set(item.purchaseInvoiceId, e.target.value))}
                          className="w-28 text-sm text-right px-2 py-1 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Créditos disponibles */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Créditos disponibles (NC / pagos a cuenta)
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {visibleCredits.length}</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
                {openItemsLoading ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Cargando…</p>
                ) : visibleCredits.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Sin créditos disponibles</p>
                ) : visibleCredits.map((item) => {
                  const key = item.source === 'INVOICE' ? item.purchaseInvoiceId! : item.movementId!;
                  const disabled = !!ccCurrency && item.currency !== ccCurrency;
                  const checked = selectedCredits.has(key);
                  return (
                    <div key={key}
                      className={`px-4 py-3 flex items-center gap-3 ${disabled ? 'opacity-40' : 'cursor-pointer hover:bg-gray-50/60 dark:hover:bg-slate-700/40'}`}
                      onClick={() => !disabled && toggleCredit(item)}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCredit(item)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-slate-200">
                          {item.source === 'INVOICE' ? item.number : (item.number || 'Pago a cuenta')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          Disponible {formatCurrency(item.balance, item.currency)} de {formatCurrency(item.amount, item.currency)}
                        </p>
                      </div>
                      {checked && (
                        <input type="number" min={0} max={item.balance} step="0.01"
                          value={selectedCredits.get(key) ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSelectedCredits((prev) => new Map(prev).set(key, e.target.value))}
                          className="w-28 text-sm text-right px-2 py-1 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Resumen + ajuste manual */}
          {ccHasSelection && (
            <div className="sticky bottom-4 z-20 rounded-xl border border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-[11px] font-semibold text-gray-400 uppercase">{ccCurrency}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-400">Débitos:</span>
                  <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(ccSumDebits, ccCurrency || 'ARS')}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-400">Créditos:</span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(ccSumCredits, ccCurrency || 'ARS')}</span>
                </span>
                <span className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Diferencia</span>
                  <span className={`text-base font-bold tabular-nums ${
                    ccDiff > 0 ? 'text-red-600 dark:text-red-400' : ccDiff < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'
                  }`}>
                    {formatCurrency(Math.abs(ccDiff), ccCurrency || 'ARS')}
                  </span>
                </span>
              </div>

              {ccDiff > 0.01 && (
                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Ajuste manual (opcional)</label>
                    <input type="number" min={0} max={ccDiff} step="0.01" placeholder="0.00"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      className="w-32 text-sm text-right px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Motivo</label>
                    <input type="text" placeholder="Ej: diferencia de redondeo, descuento otorgado…"
                      value={adjDescription}
                      onChange={(e) => setAdjDescription(e.target.value)}
                      className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white" />
                  </div>
                  <p className="text-[11px] text-gray-400 basis-full">
                    Genera un movimiento nuevo en "Movimientos" por la diferencia que decidas cerrar a mano.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button size="sm" onClick={handleCreateCcAdjustment} isLoading={savingAdjustment}>
                  Ajustar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Cheques tab ── */}
      {tab === 'cheques' && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Cheques del proveedor
              <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {cheques.length}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
                <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">N° cheque</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Banco</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {chequesLoading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
                ) : cheques.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Sin cheques para este proveedor</td></tr>
                ) : (
                  cheques.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-700 dark:text-slate-300">{c.checkNumber || c.number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          c.type === 'INGRESO' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200'
                        }`}>
                          <Banknote className="w-3 h-3" />
                          {c.type === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400">{c.bank || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                        {c.dueDate ? new Date(c.dueDate).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-gray-600 bg-gray-50 border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                          {CHEQUE_STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                        {formatCurrency(Number(c.amount), (c.currency as 'ARS' | 'USD') || 'ARS')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Adjustment modal ── */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !savingAdjust && setShowAdjust(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Ajuste de cuenta corriente</h3>
              <button onClick={() => !savingAdjust && setShowAdjust(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAdjustType('DEBIT')}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    adjustType === 'DEBIT' ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400'
                  }`}>
                  Débito (nos deben más)
                </button>
                <button type="button" onClick={() => setAdjustType('CREDIT')}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    adjustType === 'CREDIT' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400'
                  }`}>
                  Crédito (a favor)
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 -mt-2">
                {adjustType === 'DEBIT'
                  ? 'Aumenta lo que le debemos al proveedor (ND interna).'
                  : 'Reduce lo que le debemos al proveedor (NC interna).'}
              </p>
              {/* Importe */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Importe (ARS)</label>
                <input type="number" min="0" step="0.01" value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)} placeholder="0,00"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {/* Motivo */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Motivo</label>
                <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej: diferencia de cambio, ajuste de saldo…"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
              <Button size="sm" variant="outline" onClick={() => setShowAdjust(false)} disabled={savingAdjust}>Cancelar</Button>
              <Button size="sm" onClick={handleCreateAdjust} isLoading={savingAdjust}>Registrar ajuste</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
