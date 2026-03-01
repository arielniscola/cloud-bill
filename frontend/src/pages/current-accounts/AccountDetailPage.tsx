import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  DollarSign, Settings, Mail, Phone, Hash,
  TrendingDown, TrendingUp, Minus, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { currentAccountsService, customersService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { CURRENCY_OPTIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Customer, CurrentAccount, AccountMovement, Currency, TaxCondition } from '../../types';

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

// ── Balance card ─────────────────────────────────────────────────
function BalanceCard({
  currency, account, isLoading,
}: {
  currency: Currency;
  account: CurrentAccount | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 animate-pulse">
        <div className="h-4 w-20 bg-gray-100 rounded" />
        <div className="h-8 w-36 bg-gray-100 rounded" />
        <div className="h-5 w-24 bg-gray-100 rounded-full" />
      </div>
    );
  }

  const balance = account?.balance ?? 0;
  const creditLimit = account?.creditLimit ?? null;

  type BalanceStatus = 'owes' | 'favor' | 'settled';
  const status: BalanceStatus =
    balance > 0 ? 'owes' : balance < 0 ? 'favor' : 'settled';

  const statusCfg = {
    owes:    { label: 'Cliente debe',           icon: TrendingDown, valueClass: 'text-red-600',     badgeClass: 'text-red-600 bg-red-50 border-red-200'        },
    favor:   { label: 'A favor del cliente',    icon: TrendingUp,   valueClass: 'text-emerald-600', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    settled: { label: 'Sin saldo pendiente',    icon: Minus,        valueClass: 'text-gray-400',    badgeClass: 'text-gray-500 bg-gray-100 border-gray-200'    },
  }[status];

  const StatusIcon = statusCfg.icon;
  const usedPct = creditLimit && balance > 0
    ? Math.min(100, (balance / creditLimit) * 100)
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
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

      {/* Credit limit */}
      {creditLimit !== null && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-1.5">
            <span>Límite de crédito</span>
            <span className="font-mono font-semibold">{formatCurrency(creditLimit, currency)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usedPct > 90 ? 'bg-red-500' :
                usedPct > 70 ? 'bg-amber-400' :
                               'bg-emerald-500'
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {balance > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">
              {usedPct.toFixed(0)}% del límite utilizado
            </p>
          )}
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
      {/* Customer bar */}
      <div className="h-16 bg-white border border-gray-200 rounded-xl" />
      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-36 bg-white border border-gray-200 rounded-xl" />
        <div className="h-36 bg-white border border-gray-200 rounded-xl" />
      </div>
      {/* Table */}
      <div className="h-64 bg-white border border-gray-200 rounded-xl" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function AccountDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();

  const [customer,  setCustomer]  = useState<Customer | null>(null);
  const [accounts,  setAccounts]  = useState<CurrentAccount[]>([]);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('ARS');
  const [paymentCurrency,  setPaymentCurrency]  = useState<Currency>('ARS');
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCreditModalOpen,  setIsCreditModalOpen]  = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      const [customerData, accountsData] = await Promise.all([
        customersService.getById(customerId),
        currentAccountsService.getByCustomerId(customerId),
      ]);
      setCustomer(customerData);
      setAccounts(accountsData);

      const selectedAccount = accountsData.find((a: CurrentAccount) => a.currency === selectedCurrency);
      if (selectedAccount) {
        const movementsData = await currentAccountsService.getMovements(customerId, {
          page, limit, currency: selectedCurrency,
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
  }, [customerId, page, limit, selectedCurrency, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const arsAccount = accounts.find((a) => a.currency === 'ARS');
  const usdAccount = accounts.find((a) => a.currency === 'USD');

  const columns: Column<AccountMovement>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (mov) => {
        const d = new Date(mov.createdAt);
        return (
          <div className="whitespace-nowrap">
            <p className="text-sm text-gray-800">{d.toLocaleDateString('es-AR')}</p>
            <p className="text-xs text-gray-400">{d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (mov) => {
        const isCredit = mov.type === 'CREDIT';
        return (
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            isCredit
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-red-600 bg-red-50 border-red-200'
          }`}>
            {isCredit ? 'Crédito' : 'Débito'}
          </span>
        );
      },
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (mov) => (
        <div className="min-w-0">
          <p className="text-sm text-gray-700 truncate max-w-[220px]">{mov.description || '—'}</p>
          {mov.invoice && (
            <p className="text-xs text-indigo-500 flex items-center gap-1 mt-0.5">
              <FileText className="w-3 h-3" />
              {mov.invoice.number ?? `Factura`}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      render: (mov) => {
        const isCredit = mov.type === 'CREDIT';
        return (
          <span className={`text-sm font-bold tabular-nums ${isCredit ? 'text-emerald-700' : 'text-red-600'}`}>
            {isCredit ? '+' : '−'}{formatCurrency(mov.amount, selectedCurrency)}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Saldo',
      render: (mov) => (
        <span className={`text-sm tabular-nums font-mono ${
          mov.balance > 0 ? 'text-red-500' : mov.balance < 0 ? 'text-emerald-600' : 'text-gray-400'
        }`}>
          {formatCurrency(mov.balance, selectedCurrency)}
        </span>
      ),
    },
  ];

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
            <Button size="sm" onClick={openPaymentModal}>
              <DollarSign className="w-3.5 h-3.5 mr-1.5" />
              Registrar pago
            </Button>
          </div>
        }
      />

      {/* ── Customer info bar ── */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base font-bold ${color.bg} ${color.text}`}>
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
          <p className="text-xs text-gray-400">{TAX_LABEL[customer.taxCondition]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500">
          {customer.taxId && (
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-300" />
              <span className="font-mono text-xs text-gray-600">{customer.taxId}</span>
            </span>
          )}
          {customer.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs">{customer.email}</span>
            </span>
          )}
          {customer.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs">{customer.phone}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Balance cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BalanceCard currency="ARS" account={arsAccount} isLoading={isLoading} />
        <BalanceCard currency="USD" account={usdAccount} isLoading={isLoading} />
      </div>

      {/* ── Movements table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header with currency tabs */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Movimientos
            {total > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">· {total}</span>}
          </h3>

          {/* Currency segmented control */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(['ARS', 'USD'] as Currency[]).map((cur) => (
              <button
                key={cur}
                onClick={() => { setSelectedCurrency(cur); setPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  selectedCurrency === cur
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
          keyExtractor={(mov) => mov.id}
          emptyMessage={`Sin movimientos en ${selectedCurrency}`}
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (l) => { setLimit(l); setPage(1); },
          }}
        />
      </div>

      {/* ── Payment modal ── */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Registrar pago">
        <form onSubmit={paymentForm.handleSubmit(handlePayment)} className="space-y-4">
          {/* Currency tabs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Moneda</label>
            <div className="flex gap-2">
              {(['ARS', 'USD'] as Currency[]).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setPaymentCurrency(cur)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                    paymentCurrency === cur
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
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

      {/* ── Credit limit modal ── */}
      <Modal isOpen={isCreditModalOpen} onClose={() => setIsCreditModalOpen(false)} title="Límite de crédito">
        <form onSubmit={creditForm.handleSubmit(handleCreditLimit)} className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500 leading-relaxed">
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
