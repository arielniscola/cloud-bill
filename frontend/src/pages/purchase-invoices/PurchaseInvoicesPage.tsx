import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Truck, Receipt, CheckCircle2, Clock, Trash2, Search, X, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button } from '../../components/ui';
import { PageHeader, Pagination, ConfirmDialog } from '../../components/shared';
import { AddPurchaseInvoiceModal } from '../../components/shared/AddPurchaseInvoiceModal';
import type { RemitoPrefill } from '../../components/shared/AddPurchaseInvoiceModal';
import { PurchaseInvoiceDetailModal } from '../../components/shared/PurchaseInvoiceDetailModal';
import { purchaseInvoicesService, suppliersService } from '../../services';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { PurchaseInvoice, CreatePurchaseInvoiceDTO, PurchaseInvoiceStatus, PurchaseInvoiceFilters } from '../../types';

const STATUS_CFG: Record<PurchaseInvoiceStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  PENDING:        { label: 'Pendiente',  className: 'text-amber-700 bg-amber-50 border-amber-200',     icon: Clock },
  PARTIALLY_PAID: { label: 'Pago parcial', className: 'text-blue-700 bg-blue-50 border-blue-200',      icon: Clock },
  PAID:           { label: 'Pagada',     className: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
};

type Tab = 'all' | PurchaseInvoiceStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: 'all',            label: 'Todas' },
  { key: 'PENDING',        label: 'Pendientes' },
  { key: 'PARTIALLY_PAID', label: 'Pago parcial' },
  { key: 'PAID',           label: 'Pagadas' },
];

const TYPE_FILTER_OPTIONS = [
  { value: 'FACTURA_A',      label: 'Factura A' },
  { value: 'FACTURA_B',      label: 'Factura B' },
  { value: 'FACTURA_C',      label: 'Factura C' },
  { value: 'FACTURA_M',      label: 'Factura M' },
  { value: 'NOTA_DEBITO_A',  label: 'Nota Débito A' },
  { value: 'NOTA_DEBITO_B',  label: 'Nota Débito B' },
  { value: 'NOTA_DEBITO_C',  label: 'Nota Débito C' },
  { value: 'NOTA_CREDITO_A', label: 'Nota Crédito A' },
  { value: 'NOTA_CREDITO_B', label: 'Nota Crédito B' },
  { value: 'NOTA_CREDITO_C', label: 'Nota Crédito C' },
  { value: 'RECIBO',         label: 'Recibo' },
  { value: 'OTRO',           label: 'Otro' },
];

const SELECT_CLS = 'text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300';

export default function PurchaseInvoicesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const remitoState = (location.state as { fromRemito?: RemitoPrefill } | null)?.fromRemito ?? null;

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [usdRate, setUsdRate] = useState<number | null>(null);  // cotización actual (Banco Nación venta)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);
  const [viewing, setViewing] = useState<PurchaseInvoice | null>(null);
  const [prefill, setPrefill] = useState<RemitoPrefill | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<PurchaseInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await purchaseInvoicesService.getAll({
        page, limit,
        status: tab === 'all' ? undefined : tab,
        supplierId: supplierFilter || undefined,
        search: debouncedSearch || undefined,
        currency: currencyFilter || undefined,
        saleCondition: (conditionFilter || undefined) as PurchaseInvoiceFilters['saleCondition'],
        type: typeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setInvoices(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Error al cargar las facturas de compra');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, tab, supplierFilter, debouncedSearch, currencyFilter, conditionFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounce de la búsqueda por número (vuelve a la página 1 al cambiar)
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    suppliersService.getAll({ limit: 500, isActive: true })
      .then((res) => setSuppliers(res.data.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => { /* non-blocking */ });
  }, []);

  // Cotización del día (Banco Nación venta) para mostrar el valor actual de facturas en USD
  useEffect(() => {
    fetch('https://dolarapi.com/v1/dolares/oficial')
      .then((r) => r.json())
      .then((d) => { if (d?.venta) setUsdRate(Number(d.venta)); })
      .catch(() => { /* sin conexión: no se muestra el valor actual */ });
  }, []);

  // Auto-open prefilled from a remito (navigated from PurchaseRemitoDetailPage)
  useEffect(() => {
    if (remitoState) {
      setPrefill(remitoState);
      setEditing(null);
      setModalOpen(true);
      // clear the navigation state so a refresh doesn't reopen it
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remitoState]);

  const openNew = () => { setEditing(null); setPrefill(null); setModalOpen(true); };
  // Una factura con pagos imputados (pagada / parcialmente pagada) no se edita.
  const canModify = (inv: PurchaseInvoice) =>
    inv.status !== 'PAID' && inv.status !== 'PARTIALLY_PAID';

  // Clic en la fila: editable → form de edición; con pagos imputados → vista de detalle.
  const openRow = (inv: PurchaseInvoice) => (canModify(inv) ? openEdit(inv) : openView(inv));

  // Traemos la factura completa (con ítems/retenciones/tributos) porque la fila
  // de la lista no los incluye — sin esto el modal abría sin ítems.
  const openEdit = async (inv: PurchaseInvoice) => {
    setPrefill(null);
    try {
      const full = await purchaseInvoicesService.getById(inv.id);
      setEditing(full);
    } catch {
      toast.error('No se pudo cargar la factura');
      setEditing(inv);
    }
    setModalOpen(true);
  };

  // Vista de detalle (solo lectura). Preservamos paidAmount de la fila del listado
  // porque el getById no lo computa.
  const openView = async (inv: PurchaseInvoice) => {
    try {
      const full = await purchaseInvoicesService.getById(inv.id);
      setViewing({ ...full, paidAmount: inv.paidAmount });
    } catch {
      toast.error('No se pudo cargar la factura');
      setViewing(inv);
    }
  };

  // Registrar mercadería (remito de compra) a partir de una factura: trae la factura
  // completa (con ítems) y abre el form de remito prefijado.
  const handleGenerateRemito = async (inv: PurchaseInvoice) => {
    try {
      const full = await purchaseInvoicesService.getById(inv.id);
      navigate('/purchase-remitos/new', { state: { fromInvoice: full } });
    } catch {
      toast.error('No se pudo cargar la factura');
    }
  };

  const handleSave = async (data: CreatePurchaseInvoiceDTO) => {
    setSaving(true);
    try {
      if (editing) {
        await purchaseInvoicesService.update(editing.id, data);
        toast.success('Factura actualizada');
      } else {
        await purchaseInvoicesService.create(data);
        toast.success('Factura creada');
      }
      setModalOpen(false);
      setEditing(null);
      setPrefill(null);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar la factura');
      throw e; // el modal usa el rechazo para NO limpiar el borrador si falló
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await purchaseInvoicesService.remove(toDelete.id);
      toast.success('Factura eliminada');
      setToDelete(null);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Facturas de Compra"
        subtitle="Comprobantes del proveedor — deuda y cuenta corriente"
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" /> Nueva factura
          </Button>
        }
      />

      <div className="space-y-3 mb-4">
        {/* Estado (tabs) */}
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N° de factura…"
              className="w-56 pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>

          <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }} className={SELECT_CLS}>
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className={SELECT_CLS}>
            <option value="">Todos los tipos</option>
            {TYPE_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select value={conditionFilter} onChange={(e) => { setConditionFilter(e.target.value); setPage(1); }} className={SELECT_CLS}>
            <option value="">Toda condición</option>
            <option value="CONTADO">Contado</option>
            <option value="CUENTA_CORRIENTE">Cuenta corriente</option>
          </select>

          <select value={currencyFilter} onChange={(e) => { setCurrencyFilter(e.target.value); setPage(1); }} className={SELECT_CLS}>
            <option value="">Toda moneda</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>

          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400">
            Desde
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={SELECT_CLS} />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400">
            Hasta
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={SELECT_CLS} />
          </label>

          {(search || supplierFilter || typeFilter || conditionFilter || currencyFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSupplierFilter(''); setTypeFilter(''); setConditionFilter(''); setCurrencyFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
              <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Fecha · Nº</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Condición</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Valor al emitir</th>
                <th className="px-4 py-3 text-right">Valor actual</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Sin facturas de compra</td></tr>
              ) : (
                invoices.map((inv) => {
                  const cfg = STATUS_CFG[inv.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={inv.id} onClick={() => openRow(inv)}
                      className="cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-gray-400" /> {formatDate(inv.date)}
                        </p>
                        <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{inv.number}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                          <Truck className="w-3.5 h-3.5 text-gray-400" />
                          {inv.supplier?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          inv.saleCondition === 'CUENTA_CORRIENTE'
                            ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                            : 'text-gray-600 bg-gray-50 border-gray-200'
                        }`}>
                          {inv.saleCondition === 'CUENTA_CORRIENTE' ? 'Cta. Cte.' : 'Contado'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                        {formatCurrency(inv.amount, inv.currency || 'ARS')}
                      </td>
                      {/* Valor al emitir (ARS) — solo facturas en moneda extranjera */}
                      <td className="px-4 py-3.5 text-right text-sm tabular-nums text-gray-600 dark:text-slate-300">
                        {inv.currency && inv.currency !== 'ARS' && Number(inv.exchangeRate) > 1 ? (
                          <>
                            {formatCurrency(inv.amount * Number(inv.exchangeRate), 'ARS')}
                            <p className="text-[10px] font-normal text-gray-400 dark:text-slate-500 mt-0.5">
                              cotiz. {Number(inv.exchangeRate).toLocaleString('es-AR')}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      {/* Valor actual (ARS) — solo facturas en moneda extranjera */}
                      <td className="px-4 py-3.5 text-right text-sm tabular-nums text-indigo-600 dark:text-indigo-400 font-medium">
                        {inv.currency && inv.currency !== 'ARS' && usdRate ? (
                          <>
                            {formatCurrency(inv.amount * usdRate, 'ARS')}
                            <p className="text-[10px] font-normal text-indigo-400 dark:text-indigo-500 mt-0.5">
                              cotiz. {usdRate.toLocaleString('es-AR')}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm tabular-nums">
                        {(() => {
                          const paid = Number(inv.paidAmount ?? 0);
                          if (paid <= 0) return <span className="text-gray-300 dark:text-slate-600">—</span>;
                          const fullyPaid = paid >= Number(inv.amount) - 0.005;
                          return (
                            <span className={`font-medium ${fullyPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {formatCurrency(paid, inv.currency || 'ARS')}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
                          <StatusIcon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleGenerateRemito(inv); }}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-300 hover:text-indigo-600 transition-colors"
                            title="Registrar mercadería (remito de compra)">
                            <PackagePlus className="w-4 h-4" />
                          </button>
                          {canModify(inv) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setToDelete(inv); }}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 transition-colors"
                              title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && invoices.length > 0 && (
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

      <AddPurchaseInvoiceModal
        isOpen={modalOpen}
        standalone
        suppliers={suppliers}
        fromRemito={prefill}
        existing={editing}
        currency={editing?.currency ?? 'ARS'}
        onClose={() => { setModalOpen(false); setEditing(null); setPrefill(null); }}
        onSave={handleSave}
        isLoading={saving}
      />

      {viewing && (
        <PurchaseInvoiceDetailModal
          invoice={viewing}
          onClose={() => setViewing(null)}
          onGenerateRemito={(inv) => { setViewing(null); handleGenerateRemito(inv); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Eliminar factura"
        message={`Se eliminará la factura ${toDelete?.number ?? ''} y sus movimientos de cuenta corriente. ¿Continuar?`}
        confirmText="Eliminar"
      />
    </div>
  );
}
