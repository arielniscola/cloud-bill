import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DollarSign, Mail, Phone, Hash, FileText,
  TrendingDown, TrendingUp, Minus, Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { suppliersService, ordenPagosService } from '../../services';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Supplier, TaxCondition } from '../../types';
import type { SupplierAccountMovement } from '../../types/ordenPago.types';

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
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    if (!supplierId) return;
    setIsLoading(true);
    try {
      const [supplierData, accountData] = await Promise.all([
        suppliersService.getById(supplierId),
        ordenPagosService.getSupplierAccount(supplierId, { page, limit }),
      ]);
      setSupplier(supplierData);
      setBalance(accountData.balance);
      setMovements(accountData.data);
      setTotal(accountData.total);
    } catch {
      toast.error('Error al cargar cuenta corriente');
      navigate('/supplier-accounts');
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, page, limit, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: Column<SupplierAccountMovement>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (mov) => {
        const d = new Date(mov.createdAt);
        return (
          <div className="whitespace-nowrap">
            <p className="text-sm text-gray-800 dark:text-slate-200">{d.toLocaleDateString('es-AR')}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
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
          <p className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[280px]">{mov.description || '—'}</p>
          {mov.purchaseId && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/purchases/${mov.purchaseId}`); }}
              className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1 mt-0.5 hover:underline"
            >
              <FileText className="w-3 h-3" />
              Ver compra
            </button>
          )}
          {mov.ordenPagoId && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/orden-pagos/${mov.ordenPagoId}`); }}
              className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1 mt-0.5 hover:underline"
            >
              <FileText className="w-3 h-3" />
              Ver orden de pago
            </button>
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
          <span className={`text-sm font-bold tabular-nums ${isCredit ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {isCredit ? '+' : '−'}{formatCurrency(mov.amount, 'ARS')}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Saldo',
      render: (mov) => (
        <span className={`text-sm tabular-nums font-mono ${
          mov.balance > 0 ? 'text-red-500 dark:text-red-400' : mov.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'
        }`}>
          {formatCurrency(mov.balance, 'ARS')}
        </span>
      ),
    },
  ];

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
    <div className="space-y-5">
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

      {/* ── Movements table ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Movimientos
            {total > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {total}</span>}
          </h3>
        </div>

        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
          keyExtractor={(mov) => mov.id}
          emptyMessage="Sin movimientos registrados"
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
    </div>
  );
}
