import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Edit, Lock, TrendingUp, TrendingDown, Activity,
  ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Modal, Input } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { cashRegistersService } from '../../services';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type {
  CashRegister,
  CashRegisterMovement,
  CashRegisterMovementType,
  CashRegisterClose,
  CashRegisterClosePreview,
} from '../../types';

// ── Filter components ────────────────────────────────────────────────────────
function CompactDateInput({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-lg border border-gray-200 dark:border-slate-600 px-2 py-1.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:outline-none"
      />
    </div>
  );
}

function CompactSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded-lg border border-gray-200 dark:border-slate-600 px-2 py-1.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color = 'gray', isLoading }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color?: 'gray' | 'green' | 'red' | 'indigo' | 'blue';
  isLoading?: boolean;
}) {
  const bg: Record<string, string> = {
    gray:  'bg-gray-100 dark:bg-slate-700',
    green: 'bg-emerald-50 dark:bg-emerald-900/30',
    red:   'bg-red-50 dark:bg-red-900/30',
    indigo:'bg-indigo-50 dark:bg-indigo-900/30',
    blue:  'bg-blue-50 dark:bg-blue-900/30',
  };
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${bg[color]} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 dark:text-slate-500">{label}</p>
          {isLoading ? (
            <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-20 mt-1 animate-pulse" />
          ) : (
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page skeleton ────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 h-20" />
        ))}
      </div>
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-64" />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CashRegisterDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [cashRegister, setCashRegister]   = useState<CashRegister | null>(null);
  const [movements, setMovements]         = useState<CashRegisterMovement[]>([]);
  const [closes, setCloses]               = useState<CashRegisterClose[]>([]);
  const [preview, setPreview]             = useState<CashRegisterClosePreview | null>(null);

  const [isLoadingMovements, setIsLoadingMovements] = useState(true);
  const [isLoadingCloses, setIsLoadingCloses]       = useState(true);
  const [isLoadingPreview, setIsLoadingPreview]     = useState(true);

  // Paginación movimientos
  const [page, setPage]   = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  // Paginación cierres
  const [closesPage, setClosesPage]   = useState(1);
  const [closesTotal, setClosesTotal] = useState(0);
  const closesLimit = DEFAULT_PAGE_SIZE;

  // Filtros
  const [filterType, setFilterType]           = useState<CashRegisterMovementType | ''>('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate]     = useState('');

  // Modal cierre
  const [isCloseModalOpen, setIsCloseModalOpen]         = useState(false);
  const [closeModalPreview, setCloseModalPreview]       = useState<CashRegisterClosePreview | null>(null);
  const [isLoadingModalPreview, setIsLoadingModalPreview] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [isClosing, setIsClosing]   = useState(false);

  // Load caja
  useEffect(() => {
    if (!id) return;
    cashRegistersService.getById(id)
      .then(setCashRegister)
      .catch(() => navigate('/cash-registers'));
  }, [id, navigate]);

  // Load current-period preview for stat cards
  useEffect(() => {
    if (!id) return;
    cashRegistersService
      .getClosePreview(id)
      .then(setPreview)
      .catch(() => {})
      .finally(() => setIsLoadingPreview(false));
  }, [id]);

  // Movimientos
  const fetchMovements = useCallback(async () => {
    if (!id) return;
    setIsLoadingMovements(true);
    try {
      const response = await cashRegistersService.getMovements(id, {
        page,
        limit,
        ...(filterType      && { type: filterType }),
        ...(filterStartDate && { startDate: filterStartDate }),
        ...(filterEndDate   && { endDate: filterEndDate }),
      });
      setMovements(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar movimientos');
    } finally {
      setIsLoadingMovements(false);
    }
  }, [id, page, limit, filterType, filterStartDate, filterEndDate]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  // Cierres
  const fetchCloses = useCallback(async () => {
    if (!id) return;
    setIsLoadingCloses(true);
    try {
      const response = await cashRegistersService.getCloses(id, { page: closesPage, limit: closesLimit });
      setCloses(response.data);
      setClosesTotal(response.total);
    } catch {
      toast.error('Error al cargar cierres');
    } finally {
      setIsLoadingCloses(false);
    }
  }, [id, closesPage, closesLimit]);

  useEffect(() => { fetchCloses(); }, [fetchCloses]);

  const clearFilters = () => {
    setFilterType('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const hasActiveFilters = !!(filterType || filterStartDate || filterEndDate);

  // Open close modal
  const openCloseModal = async () => {
    if (!id) return;
    setCloseNotes('');
    setCloseModalPreview(null);
    setIsCloseModalOpen(true);
    setIsLoadingModalPreview(true);
    try {
      const p = await cashRegistersService.getClosePreview(id);
      setCloseModalPreview(p);
    } catch {
      toast.error('Error al cargar vista previa del cierre');
      setIsCloseModalOpen(false);
    } finally {
      setIsLoadingModalPreview(false);
    }
  };

  const handleClose = async () => {
    if (!id) return;
    setIsClosing(true);
    try {
      await cashRegistersService.createClose(id, { notes: closeNotes || undefined });
      toast.success('Cierre registrado correctamente');
      setIsCloseModalOpen(false);
      fetchMovements();
      fetchCloses();
      // Refresh stat cards
      setIsLoadingPreview(true);
      cashRegistersService.getClosePreview(id)
        .then(setPreview)
        .catch(() => {})
        .finally(() => setIsLoadingPreview(false));
    } catch {
      toast.error('Error al registrar el cierre');
    } finally {
      setIsClosing(false);
    }
  };

  // ── Movement columns ─────────────────────────────────────────────────────
  const movementColumns: Column<CashRegisterMovement>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (mov) => {
        const dt = new Date(mov.createdAt);
        return (
          <div>
            <p className="text-sm text-gray-800 dark:text-slate-200 tabular-nums">
              {dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
              {dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      },
    },
    {
      key: 'customer',
      header: 'Cliente / Descripción',
      render: (mov) => (
        <div>
          {mov.currentAccount?.customer?.name && (
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{mov.currentAccount.customer.name}</p>
          )}
          <p className={`text-xs ${mov.currentAccount?.customer?.name ? 'text-gray-400 dark:text-slate-500' : 'text-sm text-gray-700 dark:text-slate-300'}`}>
            {mov.description}
          </p>
        </div>
      ),
    },
    {
      key: 'invoice',
      header: 'Comprobante',
      render: (mov) =>
        mov.invoice ? (
          <span className="text-xs font-mono font-semibold bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 px-2 py-0.5 rounded-md">
            {mov.invoice.number}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-slate-600">—</span>
        ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (mov) => (
        <span
          className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
            mov.type === 'CREDIT'
              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800'
              : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
          }`}
        >
          {mov.type === 'CREDIT' ? 'Ingreso' : 'Egreso'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      render: (mov) => (
        <span
          className={`text-sm font-semibold tabular-nums ${
            mov.type === 'CREDIT' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {mov.type === 'CREDIT' ? '+' : '−'}
          {formatCurrency(mov.amount, mov.currentAccount?.currency ?? 'ARS')}
        </span>
      ),
    },
  ];

  // ── Close history columns ────────────────────────────────────────────────
  const closeColumns: Column<CashRegisterClose>[] = [
    {
      key: 'closedAt',
      header: 'Fecha de cierre',
      render: (c) => {
        const dt = new Date(c.closedAt);
        return (
          <div>
            <p className="text-sm text-gray-800 dark:text-slate-200 tabular-nums">
              {dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
              {dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      },
    },
    {
      key: 'period',
      header: 'Período',
      render: (c) => (
        <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded-md whitespace-nowrap">
          {c.fromDate ? formatDate(c.fromDate) : 'Inicio'} → {formatDate(c.closedAt)}
        </span>
      ),
    },
    {
      key: 'movementsCount',
      header: 'Movimientos',
      render: (c) => (
        <span className="text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2.5 py-0.5 rounded-full">
          {c.movementsCount}
        </span>
      ),
    },
    {
      key: 'totalIn',
      header: 'Ingresos',
      render: (c) => (
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
          +{formatCurrency(c.totalIn)}
        </span>
      ),
    },
    {
      key: 'totalOut',
      header: 'Egresos',
      render: (c) =>
        c.totalOut > 0 ? (
          <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
            −{formatCurrency(c.totalOut)}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-slate-600">—</span>
        ),
    },
    {
      key: 'netTotal',
      header: 'Neto',
      render: (c) => (
        <span
          className={`text-sm font-bold tabular-nums ${
            c.netTotal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {formatCurrency(c.netTotal)}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Realizado por',
      render: (c) =>
        c.user?.name ? (
          <span className="text-sm text-gray-700 dark:text-slate-300">{c.user.name}</span>
        ) : (
          <span className="text-gray-300 dark:text-slate-600">—</span>
        ),
    },
    {
      key: 'notes',
      header: 'Observaciones',
      render: (c) =>
        c.notes ? (
          <span className="text-xs text-gray-500 dark:text-slate-400">{c.notes}</span>
        ) : (
          <span className="text-gray-300 dark:text-slate-600">—</span>
        ),
    },
  ];

  if (!cashRegister) {
    return (
      <div>
        <PageHeader title="Caja" backTo="/cash-registers" />
        <PageSkeleton />
      </div>
    );
  }

  const lastClose = closes[0] ?? null;

  return (
    <div>
      <PageHeader
        title={cashRegister.name}
        subtitle={cashRegister.description ?? 'Detalle de caja'}
        backTo="/cash-registers"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/cash-registers/${id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button onClick={openCloseModal}>
              <Lock className="w-4 h-4 mr-2" />
              Cerrar caja
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Activity className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
          label="Último cierre"
          color="blue"
          isLoading={isLoadingCloses}
          value={lastClose ? formatDate(lastClose.closedAt) : 'Sin cierres'}
        />
        <StatCard
          icon={<ArrowUpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          label="Ingresos (período)"
          color="green"
          isLoading={isLoadingPreview}
          value={preview ? formatCurrency(preview.totalIn) : '—'}
        />
        <StatCard
          icon={<ArrowDownCircle className="w-4 h-4 text-red-500 dark:text-red-400" />}
          label="Egresos (período)"
          color="red"
          isLoading={isLoadingPreview}
          value={preview ? formatCurrency(preview.totalOut) : '—'}
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          label="Neto (período)"
          color="indigo"
          isLoading={isLoadingPreview}
          value={
            preview ? (
              <span className={preview.netTotal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {formatCurrency(preview.netTotal)}
              </span>
            ) : '—'
          }
        />
      </div>

      {/* Movimientos */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Movimientos</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <CompactDateInput
                label="Desde"
                value={filterStartDate}
                onChange={(v) => { setFilterStartDate(v); setPage(1); }}
              />
              <CompactDateInput
                label="Hasta"
                value={filterEndDate}
                onChange={(v) => { setFilterEndDate(v); setPage(1); }}
              />
              <CompactSelect
                value={filterType}
                onChange={(v) => { setFilterType(v as CashRegisterMovementType | ''); setPage(1); }}
                options={[
                  { value: '',       label: 'Todos los tipos' },
                  { value: 'CREDIT', label: 'Ingresos' },
                  { value: 'DEBIT',  label: 'Egresos' },
                ]}
              />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </div>

        <DataTable
          columns={movementColumns}
          data={movements}
          isLoading={isLoadingMovements}
          keyExtractor={(mov) => mov.id}
          emptyMessage="No hay movimientos para esta caja"
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (newLimit) => { setLimit(newLimit); setPage(1); },
          }}
        />
      </div>

      {/* Historial de cierres */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Historial de cierres</h3>
        </div>
        <DataTable
          columns={closeColumns}
          data={closes}
          isLoading={isLoadingCloses}
          keyExtractor={(c) => c.id}
          emptyMessage="No hay cierres registrados"
          pagination={{
            page: closesPage,
            totalPages: Math.ceil(closesTotal / closesLimit),
            limit: closesLimit,
            total: closesTotal,
            onPageChange: setClosesPage,
            onLimitChange: () => {},
          }}
        />
      </div>

      {/* Modal cierre de caja */}
      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title="Cerrar caja"
        size="sm"
      >
        {isLoadingModalPreview ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 dark:text-slate-400">Calculando totales...</p>
          </div>
        ) : closeModalPreview ? (
          <div className="space-y-4">
            {/* Period label */}
            <div className="text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 border border-gray-100 dark:border-slate-600">
              Período:{' '}
              <span className="font-medium text-gray-700 dark:text-slate-300">
                {closeModalPreview.fromDate
                  ? `desde ${formatDateTime(closeModalPreview.fromDate)}`
                  : 'desde el inicio'}
                {' '}hasta ahora
              </span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Movimientos</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{closeModalPreview.movementsCount}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Ingresos</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(closeModalPreview.totalIn)}
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Egresos</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-400 tabular-nums">
                  {formatCurrency(closeModalPreview.totalOut)}
                </p>
              </div>
              <div
                className={`border rounded-xl p-3 text-center ${
                  closeModalPreview.netTotal >= 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800'
                }`}
              >
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Neto</p>
                <p
                  className={`text-lg font-bold tabular-nums ${
                    closeModalPreview.netTotal >= 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'
                  }`}
                >
                  {formatCurrency(closeModalPreview.netTotal)}
                </p>
              </div>
            </div>

            <Input
              label="Observaciones (opcional)"
              placeholder="Notas del cierre..."
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
            />

            <div className="flex gap-3 pt-1">
              <Button onClick={handleClose} isLoading={isClosing}>
                <Lock className="w-4 h-4 mr-2" />
                Confirmar cierre
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsCloseModalOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
