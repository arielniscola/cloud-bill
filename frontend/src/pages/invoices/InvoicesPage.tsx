import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, X, CalendarRange, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card, Select, Input } from '../../components/ui';
import { PageHeader, CustomerSearchSelect } from '../../components/shared';
import Pagination from '../../components/shared/Pagination';
import { invoicesService, customersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_STATUSES,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  DELIVERY_STATUSES,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Invoice, InvoiceStatus, InvoiceType, Customer } from '../../types';

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default',
  ISSUED: 'info',
  PAID: 'success',
  CANCELLED: 'error',
  PARTIALLY_PAID: 'warning',
};

const DELIVERY_VARIANT: Record<string, StatusVariant> = {
  NOT_DELIVERED: 'default',
  PARTIALLY_DELIVERED: 'warning',
  DELIVERED: 'success',
};

const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  FACTURA_A:      { label: 'FA',   cls: 'text-indigo-700 bg-indigo-50 ring-indigo-200/60' },
  FACTURA_B:      { label: 'FB',   cls: 'text-sky-700 bg-sky-50 ring-sky-200/60' },
  FACTURA_C:      { label: 'FC',   cls: 'text-teal-700 bg-teal-50 ring-teal-200/60' },
  NOTA_CREDITO_A: { label: 'NC-A', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60' },
  NOTA_CREDITO_B: { label: 'NC-B', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60' },
  NOTA_CREDITO_C: { label: 'NC-C', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60' },
  NOTA_DEBITO_A:  { label: 'ND-A', cls: 'text-amber-700 bg-amber-50 ring-amber-200/60' },
  NOTA_DEBITO_B:  { label: 'ND-B', cls: 'text-amber-700 bg-amber-50 ring-amber-200/60' },
  NOTA_DEBITO_C:  { label: 'ND-C', cls: 'text-amber-700 bg-amber-50 ring-amber-200/60' },
};

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-gray-100 last:border-0">
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-28" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 rounded-full w-10" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-44" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-20" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-24 ml-auto" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 rounded-full w-16 mx-auto" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 rounded-full w-20 mx-auto" /></td>
          <td className="px-4 py-4" />
        </tr>
      ))}
    </>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [showDateRange, setShowDateRange] = useState(false);

  useEffect(() => {
    customersService.getAll({ limit: 1000 }).then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await invoicesService.getAll({
        page, limit,
        status: (statusFilter || undefined) as InvoiceStatus | undefined,
        type: (typeFilter || undefined) as InvoiceType | undefined,
        customerId: customerFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setInvoices(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar facturas');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, statusFilter, typeFilter, customerFilter, dateFrom, dateTo]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const hasFilters = statusFilter || typeFilter || customerFilter || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter(''); setTypeFilter(''); setCustomerFilter('');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  const toggleDateRange = () => {
    if (showDateRange) { setDateFrom(''); setDateTo(''); setPage(1); }
    setShowDateRange((v) => !v);
  };

  const statusOptions = [{ value: '', label: 'Todos los estados' }, ...INVOICE_STATUS_OPTIONS];
  const typeOptions = [{ value: '', label: 'Todos los tipos' }, ...INVOICE_TYPE_OPTIONS];

  const showSkeleton = isFirstLoad && isLoading;
  const showEmpty = !isLoading && !isFirstLoad && invoices.length === 0;

  return (
    <div>
      <PageHeader
        title="Facturas"
        subtitle={total > 0 ? `${total} facturas registradas` : undefined}
        actions={
          <Button onClick={() => navigate('/invoices/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva factura
          </Button>
        }
      />

      <Card padding="none">
        {/* Filters */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select options={typeOptions} value={typeFilter}
                onChange={(v) => { setTypeFilter(v); setPage(1); }} />
            </div>
            <div className="w-40">
              <Select options={statusOptions} value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }} />
            </div>
            <div className="w-52">
              <CustomerSearchSelect
                customers={customers}
                value={customerFilter}
                onChange={(v) => { setCustomerFilter(v); setPage(1); }}
                clearLabel="Todos los clientes"
              />
            </div>

            <button
              onClick={toggleDateRange}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors duration-150 ${
                showDateRange || dateFrom || dateTo
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 bg-white'
              }`}
            >
              <CalendarRange className="w-4 h-4" />
              Fechas
            </button>

            {showDateRange && (
              <>
                <div className="w-36">
                  <Input type="date" value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                </div>
                <span className="text-gray-300 text-sm select-none">–</span>
                <div className="w-36">
                  <Input type="date" value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
                </div>
              </>
            )}

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-150"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Skeleton */}
        {showSkeleton && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80">
                <tr>
                  {['Número', 'Tipo', 'Cliente', 'Fecha', 'Total', 'Estado', 'Entrega', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                <SkeletonRows count={8} />
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="py-20 flex flex-col items-center text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
              <Receipt className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-1">
              {hasFilters ? 'Sin resultados' : 'Sin facturas todavía'}
            </p>
            <p className="text-sm text-gray-400 mb-5 max-w-xs">
              {hasFilters
                ? 'Probá ajustando los filtros para encontrar lo que buscás.'
                : 'Creá tu primera factura para comenzar a registrar ventas.'}
            </p>
            {!hasFilters && (
              <Button onClick={() => navigate('/invoices/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva factura
              </Button>
            )}
          </div>
        )}

        {/* Data table */}
        {!showSkeleton && !showEmpty && (
          <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Número</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Entrega</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {invoices.map((inv) => {
                    const chip = TYPE_CHIP[inv.type];
                    return (
                      <tr
                        key={inv.id}
                        className="cursor-pointer hover:bg-gray-50/80 transition-colors duration-150 group"
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">{inv.number}</td>
                        <td className="px-4 py-3.5">
                          <span
                            title={INVOICE_TYPES[inv.type]}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${chip?.cls ?? 'text-gray-600 bg-gray-50 ring-gray-200/60'}`}
                          >
                            {chip?.label ?? inv.type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-700">
                          {inv.customer?.name ?? <span className="text-gray-400 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-500 tabular-nums">{formatDate(inv.date)}</td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">
                          {formatCurrency(inv.total, inv.currency)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <Badge variant={STATUS_VARIANT[inv.status] ?? 'default'} dot>
                            {INVOICE_STATUSES[inv.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {inv.deliveryStatus && inv.deliveryStatus !== 'NOT_DELIVERED' ? (
                            <Badge variant={DELIVERY_VARIANT[inv.deliveryStatus] ?? 'default'} dot>
                              {DELIVERY_STATUSES[inv.deliveryStatus]}
                            </Badge>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${inv.id}`); }}
                            className="p-1.5 rounded-lg text-gray-300 group-hover:text-gray-500 hover:bg-gray-100 transition-colors duration-150"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > limit && (
              <Pagination
                page={page}
                totalPages={Math.ceil(total / limit)}
                limit={limit}
                total={total}
                onPageChange={setPage}
                onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
