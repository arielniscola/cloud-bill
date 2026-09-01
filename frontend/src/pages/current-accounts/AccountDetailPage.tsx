import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  DollarSign, Settings, Mail, Phone, Hash, Search, X,
  TrendingDown, TrendingUp, Minus, FileText, FileEdit,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Modal, Input } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import Pagination from '../../components/shared/Pagination';
import { LoadingOverlay } from '../../components/ui/Spinner';
import { currentAccountsService, customersService } from '../../services';
import CreateInternalNoteModal from '../internal-notes/CreateInternalNoteModal';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import type {
  Customer, CurrentAccount, AccountMovement, Currency, TaxCondition,
  MovementType, MovementOrigin, CurrentAccountSummary,
} from '../../types';

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

const ORIGINS: { key: MovementOrigin; label: string }[] = [
  { key: 'INVOICE',           label: 'Facturas' },
  { key: 'RECIBO',            label: 'Recibos' },
  { key: 'CREDIT_DEBIT_NOTE', label: 'NC / ND' },
  { key: 'INTERNAL_NOTE',     label: 'Notas internas' },
];

// ── Tarjeta de saldo principal ───────────────────────────────────
function BalanceCard({
  currency, account, summary, isLoading,
}: {
  currency: Currency;
  account: CurrentAccount | undefined;
  summary: CurrentAccountSummary | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3 animate-pulse">
        <div className="h-4 w-20 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="h-9 w-48 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="h-5 w-24 bg-gray-100 dark:bg-slate-700 rounded-full" />
      </div>
    );
  }

  const balance = account?.balance ?? 0;
  const creditLimit = account?.creditLimit ?? null;
  const aging = summary?.aging ?? null;

  type BalanceStatus = 'owes' | 'favor' | 'settled';
  const status: BalanceStatus = balance > 0 ? 'owes' : balance < 0 ? 'favor' : 'settled';

  const statusCfg = {
    owes:    { label: 'El cliente debe',      icon: TrendingDown, valueClass: 'text-red-600 dark:text-red-400',         badgeClass: 'text-red-600 bg-red-50 border-red-200'             },
    favor:   { label: 'A favor del cliente',  icon: TrendingUp,   valueClass: 'text-emerald-600 dark:text-emerald-400', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    settled: { label: 'Sin saldo pendiente',  icon: Minus,        valueClass: 'text-gray-400 dark:text-slate-500',      badgeClass: 'text-gray-500 bg-gray-100 border-gray-200'         },
  }[status];

  const StatusIcon = statusCfg.icon;
  const usedPct = creditLimit && balance > 0 ? (balance / creditLimit) * 100 : 0;
  const late = aging ? aging.d61_90 + aging.d90plus : 0;

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

      {aging && aging.docCount > 0 && (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          {aging.docCount} {aging.docCount === 1 ? 'comprobante impago' : 'comprobantes impagos'}
          {aging.oldestDays > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold"> · el más antiguo, {aging.oldestDays} días</span>
          )}
        </p>
      )}

      {/* Límite de crédito */}
      {creditLimit !== null && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
          <div className="flex justify-between items-center text-xs text-gray-400 dark:text-slate-500 mb-1.5">
            <span>Límite de crédito</span>
            <span className="font-mono font-semibold">{formatCurrency(creditLimit, currency)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-amber-400' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
          {balance > 0 && (
            <div className="flex justify-between items-center mt-1">
              <p className={`text-[11px] ${usedPct > 100 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-500'}`}>
                {usedPct.toFixed(0)}% utilizado
              </p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 tabular-nums">
                disponible {formatCurrency(Math.max(0, creditLimit - balance), currency)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Antigüedad de la deuda */}
      {aging && aging.total > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            Antigüedad
          </span>
          <div className="flex gap-0.5 mt-2">
            {[
              { v: aging.notDue, c: 'bg-emerald-400' },
              { v: aging.d0_30,  c: 'bg-amber-400' },
              { v: aging.d31_60, c: 'bg-orange-400' },
              { v: late,         c: 'bg-red-500' },
            ].map((s, i) => (
              <div
                key={i}
                className={`h-2 rounded-full ${s.v > 0 ? s.c : 'bg-gray-100 dark:bg-slate-700'}`}
                style={{ flexGrow: s.v > 0 ? s.v : 1 }}
              />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[
              { label: 'Al día',   v: aging.notDue, cls: 'text-gray-700 dark:text-slate-300' },
              { label: '1-30 d',   v: aging.d0_30,  cls: 'text-gray-700 dark:text-slate-300' },
              { label: '31-60 d',  v: aging.d31_60, cls: 'text-amber-600 dark:text-amber-400' },
              { label: '+60 d',    v: late,         cls: 'text-red-600 dark:text-red-400' },
            ].map((b) => (
              <div key={b.label}>
                <p className={`text-xs font-semibold tabular-nums ${b.cls}`}>{formatCurrency(b.v, currency)}</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500">{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel de comportamiento de pago ──────────────────────────────
function BehaviourCard({ summary, currency, isLoading }: { summary: CurrentAccountSummary | null; currency: Currency; isLoading: boolean }) {
  if (isLoading) {
    return <div className="h-36 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl animate-pulse" />;
  }

  const collected = summary?.collected90.find((c) => c.currency === currency)?.total ?? 0;
  const invoiced  = summary?.invoiced90.find((c) => c.currency === currency)?.total ?? 0;
  const delay     = summary?.avgPaymentDelayDays ?? null;
  const note      = summary?.lastInternalNote ?? null;

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
        Comportamiento de pago
      </span>
      <div className="flex flex-col gap-3 mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-gray-500 dark:text-slate-400">Demora promedio</span>
          <span className={`text-sm font-bold tabular-nums ${
            delay === null ? 'text-gray-300 dark:text-slate-600'
            : delay > 30 ? 'text-red-600 dark:text-red-400'
            : delay > 5  ? 'text-amber-600 dark:text-amber-400'
            : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {delay === null ? '—' : `${delay} días`}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-gray-500 dark:text-slate-400">Cobrado últimos 90 días</span>
          <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(collected, currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-gray-500 dark:text-slate-400">Facturado últimos 90 días</span>
          <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
            {formatCurrency(invoiced, currency)}
          </span>
        </div>
      </div>
      {note && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            Última nota interna · {new Date(note.createdAt).toLocaleDateString('es-AR')}
          </p>
          <p className="mt-1 text-xs text-gray-700 dark:text-slate-300 leading-relaxed">
            {note.notes || note.reason}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Schemas ──────────────────────────────────────────────────────
const paymentSchema = z.object({
  amount:      z.coerce.number().positive('El monto debe ser mayor a 0'),
  description: z.string().optional(),
});
const creditLimitSchema = z.object({
  creditLimit: z.coerce.number().min(0, 'Debe ser mayor o igual a 0').nullable(),
});

type PaymentFormData    = z.output<typeof paymentSchema>;
type CreditLimitFormData= z.output<typeof creditLimitSchema>;

// ── Page skeleton ─────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
        <div className="h-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
        <div className="h-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      </div>
      <div className="h-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
    </div>
  );
}

/** Agrupa los movimientos por mes, conservando el orden que trae el backend. */
function groupByMonth(movements: AccountMovement[]): { key: string; label: string; items: AccountMovement[] }[] {
  const groups: { key: string; label: string; items: AccountMovement[] }[] = [];
  for (const mov of movements) {
    const d = new Date(mov.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(mov);
    else groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [mov] });
  }
  return groups;
}

// ── Page ─────────────────────────────────────────────────────────
export default function AccountDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);

  const [customer,  setCustomer]  = useState<Customer | null>(null);
  const [accounts,  setAccounts]  = useState<CurrentAccount[]>([]);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [summary,   setSummary]   = useState<CurrentAccountSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('ARS');
  const [paymentCurrency,  setPaymentCurrency]  = useState<Currency>('ARS');
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [isPaymentModalOpen,     setIsPaymentModalOpen]     = useState(false);
  const [isCreditModalOpen,      setIsCreditModalOpen]      = useState(false);
  const [isInternalNoteModalOpen, setIsInternalNoteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filtros del extracto
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<MovementType | ''>('');
  const [origin,     setOrigin]     = useState<MovementOrigin | ''>('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [selected,   setSelected]   = useState<Set<string>>(new Set());

  const hasFilters = Boolean(search || typeFilter || origin || startDate || endDate);
  const clearFilters = () => {
    setSearch(''); setTypeFilter(''); setOrigin(''); setStartDate(''); setEndDate(''); setPage(1);
  };

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as any,
  });
  const creditForm = useForm<CreditLimitFormData>({
    resolver: zodResolver(creditLimitSchema) as any,
  });

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setIsLoading(true);
    try {
      const [customerData, accountsData, summaryData] = await Promise.all([
        customersService.getById(customerId),
        currentAccountsService.getByCustomerId(customerId),
        currentAccountsService.getSummary(customerId, selectedCurrency).catch(() => null),
      ]);
      setCustomer(customerData);
      setAccounts(accountsData);
      setSummary(summaryData);

      const hasAccount = accountsData.some((a: CurrentAccount) => a.currency === selectedCurrency);
      if (hasAccount) {
        const movementsData = await currentAccountsService.getMovements(customerId, {
          page, limit, currency: selectedCurrency,
          ...(typeFilter ? { type: typeFilter } : {}),
          ...(origin ? { origin } : {}),
          ...(search ? { search } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        });
        setMovements(movementsData.data);
        setTotal(movementsData.total);
      } else {
        setMovements([]);
        setTotal(0);
      }
    } catch {
      toast.error('Error al cargar cuenta corriente');
      navigate('/current-accounts');
    } finally {
      setIsLoading(false);
    }
  }, [customerId, page, limit, selectedCurrency, navigate, fiscalMode, typeFilter, origin, search, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Una fila seleccionada que ya no está en la lista no debe sumar al neto.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(movements.map((m) => m.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [movements]);

  const openPaymentModal = () => {
    paymentForm.reset();
    setPaymentCurrency(selectedCurrency);
    setIsPaymentModalOpen(true);
  };

  const openCreditModal = () => {
    const arsAccount = accounts.find((a) => a.currency === 'ARS');
    creditForm.reset({ creditLimit: arsAccount?.creditLimit ?? null });
    setIsCreditModalOpen(true);
  };

  const handlePayment = async (data: PaymentFormData) => {
    if (!customerId) return;
    setIsSaving(true);
    try {
      await currentAccountsService.registerPayment(customerId, { ...data, currency: paymentCurrency });
      toast.success('Pago registrado');
      setIsPaymentModalOpen(false);
      paymentForm.reset();
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al registrar pago');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreditLimit = async (data: CreditLimitFormData) => {
    if (!customerId) return;
    setIsSaving(true);
    try {
      await currentAccountsService.setCreditLimit(customerId, { creditLimit: data.creditLimit });
      toast.success('Límite de crédito actualizado');
      setIsCreditModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al actualizar límite');
    } finally {
      setIsSaving(false);
    }
  };

  // En modo "Todos" puede haber una cuenta FORMAL y otra INFORMAL para la
  // misma moneda — se suman para mostrar un solo saldo total (el límite de
  // crédito solo se muestra si hay una única cuenta, para no mezclar límites).
  const mergeAccounts = (list: CurrentAccount[]): CurrentAccount | undefined => {
    if (list.length === 0) return undefined;
    if (list.length === 1) return list[0];
    return { ...list[0], balance: list.reduce((s, a) => s + Number(a.balance), 0), creditLimit: null };
  };
  const arsAccount = mergeAccounts(accounts.filter((a) => a.currency === 'ARS'));
  const usdAccount = mergeAccounts(accounts.filter((a) => a.currency === 'USD'));

  const groups = useMemo(() => groupByMonth(movements), [movements]);

  const selection = useMemo(() => {
    const picked = movements.filter((m) => selected.has(m.id));
    const debit  = picked.filter((m) => m.type === 'DEBIT').reduce((s, m) => s + Number(m.amount), 0);
    const credit = picked.filter((m) => m.type === 'CREDIT').reduce((s, m) => s + Number(m.amount), 0);
    return { count: picked.length, debit, credit, net: debit - credit };
  }, [movements, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === movements.length ? new Set() : new Set(movements.map((m) => m.id))));
  };

  // ── Render ────────────────────────────────────────────────────
  if (isLoading && !customer) {
    return (
      <div>
        <PageHeader title="Cuenta corriente" backTo="/current-accounts" />
        <PageSkeleton />
      </div>
    );
  }

  if (!customer) return null;

  const color = avatarColor(customer.name);
  const inputCls = 'text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuenta corriente"
        subtitle={customer.name}
        backTo="/current-accounts"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={openCreditModal}>
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Límite de crédito
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsInternalNoteModalOpen(true)}>
              <FileEdit className="w-3.5 h-3.5 mr-1.5" />
              Nota interna
            </Button>
            <Button size="sm" onClick={openPaymentModal}>
              <DollarSign className="w-3.5 h-3.5 mr-1.5" />
              Registrar pago
            </Button>
          </div>
        }
      />

      {/* ── Customer info bar ── */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base font-bold ${color.bg} ${color.text}`}>
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{customer.name}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{TAX_LABEL[customer.taxCondition]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500 dark:text-slate-400">
          {customer.taxId && (
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{formatCuit(customer.taxId)}</span>
            </span>
          )}
          {customer.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="text-xs">{customer.email}</span>
            </span>
          )}
          {customer.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="text-xs">{customer.phone}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Saldos y comportamiento ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* La antigüedad del resumen es de la moneda elegida: solo se muestra
            en la tarjeta que le corresponde. */}
        <BalanceCard
          currency="ARS"
          account={arsAccount}
          summary={selectedCurrency === 'ARS' ? summary : null}
          isLoading={isLoading && !customer}
        />
        <BalanceCard
          currency="USD"
          account={usdAccount}
          summary={selectedCurrency === 'USD' ? summary : null}
          isLoading={isLoading && !customer}
        />
        <BehaviourCard summary={summary} currency={selectedCurrency} isLoading={isLoading && !customer} />
      </div>

      {/* ── Movements ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Header with currency tabs */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Movimientos
            {total > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {total}</span>}
          </h3>

          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
            {(['ARS', 'USD'] as Currency[]).map((cur) => (
              <button
                key={cur}
                onClick={() => { setSelectedCurrency(cur); setPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  selectedCurrency === cur
                    ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-200 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar comprobante…"
              className={`${inputCls} w-56 pl-8`}
            />
          </div>

          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            {([['', 'Todos'], ['DEBIT', 'Débitos'], ['CREDIT', 'Créditos']] as [MovementType | '', string][]).map(([key, label], i) => (
              <button
                key={label}
                type="button"
                onClick={() => { setTypeFilter(key); setPage(1); }}
                className={`text-xs px-3 py-1.5 transition-colors duration-150 ${i > 0 ? 'border-l border-gray-200 dark:border-slate-700' : ''} ${
                  typeFilter === key
                    ? 'bg-primary-600 text-white font-semibold'
                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={inputCls} />
            <span className="text-gray-400 text-sm">–</span>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={inputCls} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ORIGINS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => { setOrigin(origin === o.key ? '' : o.key); setPage(1); }}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors duration-150 ${
                  origin === o.key
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-700 font-semibold'
                    : 'text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>

        {/* Tabla */}
        <div className="relative">
          {isLoading && <LoadingOverlay />}
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={movements.length > 0 && selected.size === movements.length}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Comprobante</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Debe</th>
                  <th className="px-4 py-3 text-right">Haber</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
                      {hasFilters ? 'Sin movimientos para los filtros aplicados' : `Sin movimientos en ${selectedCurrency}`}
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <Fragment key={group.key}>
                      <tr className="bg-gray-50/80 dark:bg-slate-700/40">
                        <td colSpan={8} className="px-4 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                          {group.label}
                        </td>
                      </tr>
                      {group.items.map((mov) => {
                        const isCredit = mov.type === 'CREDIT';
                        const d = new Date(mov.createdAt);
                        const dueDate = mov.invoice?.dueDate ? new Date(mov.invoice.dueDate) : null;
                        const overdueDays = dueDate
                          ? Math.floor((Date.now() - dueDate.getTime()) / 86400000)
                          : null;
                        return (
                          <tr key={mov.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selected.has(mov.id)}
                                onChange={() => toggle(mov.id)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-sm text-gray-800 dark:text-slate-200">{d.toLocaleDateString('es-AR')}</p>
                              <p className="text-xs text-gray-400 dark:text-slate-500">
                                {d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {mov.invoice ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/invoices/${mov.invoiceId}`)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-700 hover:underline"
                                >
                                  <FileText className="w-3 h-3" />
                                  {mov.invoice.number ?? 'Factura'}
                                </button>
                              ) : mov.budget ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/budgets/${mov.budgetId}`)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border text-gray-600 bg-gray-50 border-gray-200 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 hover:underline"
                                >
                                  <FileText className="w-3 h-3" />
                                  {mov.budget.number ?? 'Presupuesto'}
                                </button>
                              ) : mov.internalNoteId ? (
                                <button
                                  type="button"
                                  onClick={() => navigate('/internal-notes')}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-900/30 dark:border-violet-700 hover:underline"
                                >
                                  <FileEdit className="w-3 h-3" />
                                  Nota interna
                                </button>
                              ) : (
                                <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[260px]">
                                {mov.description || '—'}
                              </p>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {dueDate === null ? (
                                <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>
                              ) : overdueDays !== null && overdueDays > 0 ? (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800">
                                  venció hace {overdueDays} d
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800">
                                  {dueDate.toLocaleDateString('es-AR')}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {isCredit
                                ? <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>
                                : <span className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(mov.amount, selectedCurrency)}</span>}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {isCredit
                                ? <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(mov.amount, selectedCurrency)}</span>
                                : <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <span className={`text-sm tabular-nums font-mono ${
                                mov.balance > 0 ? 'text-red-500 dark:text-red-400'
                                : mov.balance < 0 ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-gray-400 dark:text-slate-500'
                              }`}>
                                {formatCurrency(mov.balance, selectedCurrency)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {selection.count > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-200 dark:border-indigo-800">
              <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                {selection.count} {selection.count === 1 ? 'movimiento seleccionado' : 'movimientos seleccionados'}
              </span>
              <div className="flex flex-wrap items-center gap-4 text-xs text-indigo-700 dark:text-indigo-300">
                <span>Debe <span className="font-bold tabular-nums">{formatCurrency(selection.debit, selectedCurrency)}</span></span>
                <span>Haber <span className="font-bold tabular-nums">{formatCurrency(selection.credit, selectedCurrency)}</span></span>
                <span className="text-indigo-900 dark:text-indigo-200">
                  Neto <span className="font-bold tabular-nums">{formatCurrency(selection.net, selectedCurrency)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-indigo-500 dark:text-indigo-400 hover:underline"
                >
                  Limpiar selección
                </button>
              </div>
            </div>
          )}

          {total > 0 && (
            <Pagination
              page={page}
              totalPages={Math.ceil(total / limit)}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(l); setPage(1); }}
            />
          )}
        </div>
      </div>

      {/* ── Payment modal ── */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Registrar pago">
        <form onSubmit={paymentForm.handleSubmit(handlePayment)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Moneda</label>
            <div className="flex gap-2">
              {(['ARS', 'USD'] as Currency[]).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setPaymentCurrency(cur)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                    paymentCurrency === cur
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400'
                      : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-500'
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Monto *"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            {...paymentForm.register('amount')}
            error={paymentForm.formState.errors.amount?.message}
          />

          <Input
            label="Descripción"
            placeholder="Ej: Pago en efectivo, transferencia…"
            {...paymentForm.register('description')}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={isSaving}>Registrar pago</Button>
            <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>Cancelar</Button>
          </div>
        </form>
      </Modal>

      {/* ── Internal note modal ── */}
      {isInternalNoteModalOpen && customerId && (
        <CreateInternalNoteModal
          defaultCustomerId={customerId}
          onClose={() => setIsInternalNoteModalOpen(false)}
          onCreated={() => {
            setIsInternalNoteModalOpen(false);
            toast.success('Nota interna creada');
            fetchData();
          }}
        />
      )}

      {/* ── Credit limit modal ── */}
      <Modal isOpen={isCreditModalOpen} onClose={() => setIsCreditModalOpen(false)} title="Límite de crédito">
        <form onSubmit={creditForm.handleSubmit(handleCreditLimit)} className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            Definí el monto máximo que este cliente puede tener como deuda. Dejá el campo vacío o en 0 para no establecer límite.
          </div>
          <Input
            label="Límite de crédito (ARS)"
            type="number"
            step="0.01"
            min="0"
            placeholder="Sin límite"
            {...creditForm.register('creditLimit')}
            error={creditForm.formState.errors.creditLimit?.message}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={isSaving}>Guardar</Button>
            <Button type="button" variant="outline" onClick={() => setIsCreditModalOpen(false)}>Cancelar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
