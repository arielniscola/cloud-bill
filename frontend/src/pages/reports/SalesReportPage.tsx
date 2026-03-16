import { useState, useEffect } from 'react';
import { FileDown, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Badge } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { invoicesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_TYPE_OPTIONS,
  INVOICE_STATUSES,
  INVOICE_STATUS_OPTIONS,
  CURRENCY_OPTIONS,
} from '../../utils/constants';
import type { Invoice, InvoiceStatus, InvoiceType, Currency } from '../../types';

const today = new Date().toISOString().substring(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .substring(0, 10);

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default',
  ISSUED: 'info',
  PAID: 'success',
  CANCELLED: 'error',
  PARTIALLY_PAID: 'warning',
};

function downloadCSV(invoices: Invoice[]) {
  const BOM = '\uFEFF';
  const headers = [
    'Número', 'Fecha', 'Tipo', 'Cliente', 'CUIT/DNI',
    'Condición', 'Subtotal', 'IVA', 'Total', 'Moneda', 'Estado',
  ];
  const rows = invoices.map((inv) => [
    inv.number,
    inv.date.substring(0, 10),
    INVOICE_TYPES[inv.type] ?? inv.type,
    inv.customer?.name ?? '',
    inv.customer?.taxId ?? '',
    inv.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado',
    Number(inv.subtotal).toFixed(2),
    Number(inv.taxAmount).toFixed(2),
    Number(inv.total).toFixed(2),
    inv.currency,
    INVOICE_STATUSES[inv.status] ?? inv.status,
  ]);
  const csv =
    BOM +
    [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-ventas-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SalesReportPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await invoicesService.getAll({
        limit: 10000,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
        type: (typeFilter as InvoiceType) || undefined,
        status: (statusFilter as InvoiceStatus) || undefined,
        currency: (currencyFilter as Currency) || undefined,
      });
      setInvoices(data.data);
    } catch {
      toast.error('Error al cargar el reporte');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = invoices.filter((inv) => inv.status !== 'CANCELLED');
  const totals = active.reduce(
    (acc, inv) => {
      const sign = inv.type.startsWith('NOTA_CREDITO') ? -1 : 1;
      return {
        subtotal: acc.subtotal + sign * Number(inv.subtotal),
        taxAmount: acc.taxAmount + sign * Number(inv.taxAmount),
        total: acc.total + sign * Number(inv.total),
      };
    },
    { subtotal: 0, taxAmount: 0, total: 0 }
  );
  const hasMixed = invoices.length > 0 && new Set(invoices.map((i) => i.currency)).size > 1;

  return (
    <div>
      <PageHeader
        title="Reporte de Ventas"
        subtitle={isLoading ? 'Cargando…' : `${invoices.length} comprobante${invoices.length !== 1 ? 's' : ''}`}
        actions={
          <Button
            variant="outline"
            onClick={() => downloadCSV(invoices)}
            disabled={invoices.length === 0 || isLoading}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <Input
            label="Desde"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label="Hasta"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Select
            label="Tipo"
            options={[{ value: '', label: 'Todos' }, ...INVOICE_TYPE_OPTIONS]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <Select
            label="Estado"
            options={[{ value: '', label: 'Todos' }, ...INVOICE_STATUS_OPTIONS]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <Select
            label="Moneda"
            options={[{ value: '', label: 'Todas' }, ...CURRENCY_OPTIONS]}
            value={currencyFilter}
            onChange={setCurrencyFilter}
          />
          <Button onClick={fetchData} isLoading={isLoading} className="self-end">
            <RefreshCw className="w-4 h-4 mr-2" />
            Buscar
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">
            Comprobantes
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{invoices.length}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{active.length} activos</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">
            Subtotal neto
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(totals.subtotal, 'ARS')}
          </p>
          {hasMixed && <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">Monedas mixtas</p>}
        </div>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">
            IVA neto
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(totals.taxAmount, 'ARS')}
          </p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-400 dark:text-indigo-400 uppercase tracking-wider mb-1">
            Total neto
          </p>
          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
            {formatCurrency(totals.total, 'ARS')}
          </p>
          <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">NCs descontadas · excluye canceladas</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50/80 dark:bg-slate-700/50">
              <tr>
                {[
                  'Número', 'Fecha', 'Tipo', 'Cliente', 'Condición',
                  'Subtotal', 'IVA', 'Total', 'Mon.', 'Estado',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-slate-500">
                    No hay comprobantes para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100">
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-700 dark:text-slate-300 whitespace-nowrap">
                      {inv.number}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {formatDate(inv.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                      {INVOICE_TYPES[inv.type] ?? inv.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 max-w-[160px] truncate">
                      {inv.customer?.name ?? <span className="text-gray-400 dark:text-slate-500 italic">Sin cliente</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {inv.saleCondition === 'CUENTA_CORRIENTE' ? 'Cta. Cte.' : 'Contado'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums whitespace-nowrap">
                      {formatCurrency(Number(inv.subtotal), inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 text-right tabular-nums whitespace-nowrap">
                      {formatCurrency(Number(inv.taxAmount), inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums whitespace-nowrap">
                      {formatCurrency(Number(inv.total), inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {inv.currency}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={STATUS_VARIANT[inv.status] ?? 'default'} dot>
                        {INVOICE_STATUSES[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {invoices.length > 0 && !isLoading && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-700/30">
            <p className="text-xs text-gray-400 dark:text-slate-500 text-right">
              {invoices.length} comprobante{invoices.length !== 1 ? 's' : ''}
              {invoices.length === 10000 && ' · Límite alcanzado — refiná los filtros para ver más'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
