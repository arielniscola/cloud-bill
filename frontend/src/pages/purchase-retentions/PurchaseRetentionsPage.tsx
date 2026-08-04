import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Search, X, Download, Wallet, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { Button, Card } from '../../components/ui';
import { PageHeader, Pagination } from '../../components/shared';
import { purchaseInvoicesService, suppliersService, afipService } from '../../services';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE, RETENTION_TYPE_OPTIONS, RETENTION_BASE_OPTIONS } from '../../utils/constants';
import RetentionCertificatePDF from '../../components/pdf/RetentionCertificatePDF';
import type { PurchaseInvoiceRetentionRow, RetentionType } from '../../types';

const RETENTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);
const BASE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_BASE_OPTIONS.map((o) => [o.value, o.label]),
);

export default function PurchaseRetentionsPage() {
  const navigate = useNavigate();
  const [retenciones, setRetenciones] = useState<PurchaseInvoiceRetentionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [printingId, setPrintingId] = useState<string | null>(null);

  // Filters
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | RetentionType>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const hasActiveFilters = supplierFilter || typeFilter || dateFrom || dateTo || search;

  const clearFilters = () => {
    setSupplierFilter(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1);
  };

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    suppliersService.getAll({ limit: 500, isActive: true })
      .then((res) => setSuppliers(res.data.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => { /* non-blocking */ });
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await purchaseInvoicesService.getRetenciones({
        page, limit,
        supplierId: supplierFilter || undefined,
        type: typeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: debouncedSearch || undefined,
      });
      setRetenciones(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Error al cargar las retenciones');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, supplierFilter, typeFilter, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReprint = async (ret: PurchaseInvoiceRetentionRow) => {
    setPrintingId(ret.id);
    try {
      const afipConfig = await afipService.getConfig();
      const blob = await pdf(<RetentionCertificatePDF retention={ret} afipConfig={afipConfig} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retencion-${ret.certificate ?? ret.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Error al generar el PDF');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Retenciones"
        subtitle="Retenciones practicadas a proveedores — consulta y reimpresión del comprobante"
        actions={
          <Button variant="outline" onClick={() => navigate('/reports/retentions')}>
            <BarChart2 className="w-4 h-4 mr-2" /> Reporte del período
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Nº de comprobante o factura…"
            className="w-64 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as '' | RetentionType); setPage(1); }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
        >
          <option value="">Todos los regímenes</option>
          {RETENTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300" title="Desde" />
          <span className="text-gray-400 text-sm">–</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300" title="Hasta" />
        </div>
        {hasActiveFilters && (
          <button onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
              <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Fecha · Comprobante</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3">Régimen</th>
                <th className="px-4 py-3 text-right">Base</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-right">Retenido</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
              ) : retenciones.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Sin retenciones registradas</td></tr>
              ) : (
                retenciones.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{formatDate(r.createdAt)}</p>
                      <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{r.certificate ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                        <Truck className="w-3.5 h-3.5 text-gray-400" /> {r.supplier.name}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400">
                        <Wallet className="w-3.5 h-3.5 text-gray-400" />
                        {r.invoice.number}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-slate-500 ml-5">
                        Orden de pago
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200">
                        {RETENTION_TYPE_LABELS[r.type] ?? r.type}
                      </span>
                      {r.jurisdiction && <span className="ml-1.5 text-[11px] text-gray-400">{r.jurisdiction}</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm tabular-nums text-gray-600 dark:text-slate-400">
                      {formatCurrency(r.base, r.invoice.currency)}
                      {r.baseKind && (
                        <span className="block text-[11px] text-gray-400 dark:text-slate-500">
                          s/{BASE_LABELS[r.baseKind] ?? r.baseKind}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm tabular-nums text-gray-600 dark:text-slate-400">
                      {r.percentage}%
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                      {formatCurrency(r.amount, r.invoice.currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleReprint(r)}
                        disabled={printingId === r.id}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {printingId === r.id ? 'Generando…' : 'Reimprimir'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && retenciones.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
          />
        )}
      </Card>
    </div>
  );
}
