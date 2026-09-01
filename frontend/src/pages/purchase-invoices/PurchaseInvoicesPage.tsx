import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUrlFilters } from '../../hooks/useUrlFilters';
import {
  Plus, Truck, Receipt, CheckCircle2, Clock, Trash2, Search, X, PackagePlus,
  AlertTriangle, SlidersHorizontal, Rows3, Table2, Download, DollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button } from '../../components/ui';
import { PageHeader, Pagination, ConfirmDialog } from '../../components/shared';
import { AddPurchaseInvoiceModal } from '../../components/shared/AddPurchaseInvoiceModal';
import type { RemitoPrefill } from '../../components/shared/AddPurchaseInvoiceModal';
import { PurchaseInvoiceDetailModal } from '../../components/shared/PurchaseInvoiceDetailModal';
import { purchaseInvoicesService, suppliersService } from '../../services';
import { formatDate, formatCurrency, daysUntil } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type {
  PurchaseInvoice, CreatePurchaseInvoiceDTO, PurchaseInvoiceStatus,
  PurchaseInvoiceFilters, PurchaseInvoiceSummary,
} from '../../types';

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

// Etiqueta corta del tipo, para el badge de la fila.
const TYPE_SHORT: Record<string, string> = {
  FACTURA_A: 'FC A', FACTURA_B: 'FC B', FACTURA_C: 'FC C', FACTURA_M: 'FC M',
  NOTA_DEBITO_A: 'ND A', NOTA_DEBITO_B: 'ND B', NOTA_DEBITO_C: 'ND C',
  NOTA_CREDITO_A: 'NC A', NOTA_CREDITO_B: 'NC B', NOTA_CREDITO_C: 'NC C',
  RECIBO: 'Recibo', OTRO: 'Otro',
};

const SELECT_CLS = 'w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300';

type ViewMode = 'summary' | 'sheet';
const VIEW_MODE_KEY = 'purchaseInvoices.viewMode';

const isCreditNote = (type: string) => type.startsWith('NOTA_CREDITO');

export default function PurchaseInvoicesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const remitoState = (location.state as { fromRemito?: RemitoPrefill } | null)?.fromRemito ?? null;

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [summary, setSummary] = useState<PurchaseInvoiceSummary | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Filtros en la URL, no en useState: al ir a una orden de pago o a un remito
  // y volver, el listado tiene que estar como lo dejaste.
  const { values, setValues, reset } = useUrlFilters({
    tab: 'all',
    supplier: '',
    search: '',
    currency: '',
    condition: '',
    type: '',
    dateFrom: '',
    dateTo: '',
    page: '1',
    limit: String(DEFAULT_PAGE_SIZE),
  });

  // Un `tab` inventado en la URL no debe romper el listado.
  const tab: Tab = TABS.some((t) => t.key === values.tab) ? (values.tab as Tab) : 'all';
  const supplierFilter = values.supplier;
  const { search, dateFrom, dateTo } = values;
  const currencyFilter = values.currency;
  const conditionFilter = values.condition;
  const typeFilter = values.type;
  const page = Number(values.page) || 1;
  const limit = Number(values.limit) || DEFAULT_PAGE_SIZE;

  // Cambiar cualquier filtro vuelve a la página 1; moverse de página, no.
  const setTab = (v: Tab) => setValues({ tab: v, page: '1' });
  const setSupplierFilter = (v: string) => setValues({ supplier: v, page: '1' });
  const setSearch = (v: string) => setValues({ search: v, page: '1' });
  const setCurrencyFilter = (v: string) => setValues({ currency: v, page: '1' });
  const setConditionFilter = (v: string) => setValues({ condition: v, page: '1' });
  const setTypeFilter = (v: string) => setValues({ type: v, page: '1' });
  const setDateFrom = (v: string) => setValues({ dateFrom: v, page: '1' });
  const setDateTo = (v: string) => setValues({ dateTo: v, page: '1' });
  const setPage = (p: number) => setValues({ page: String(p) });
  const setLimit = (l: number) => setValues({ limit: String(l), page: '1' });

  const [debouncedSearch, setDebouncedSearch] = useState(() => values.search.trim());
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [usdRate, setUsdRate] = useState<number | null>(null);  // cotización actual (Banco Nación venta)

  // Vista: "summary" (por defecto) o "sheet" (planilla densa). Se recuerda por navegador.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'sheet' ? 'sheet' : 'summary';
  });
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  // Panel de filtros (los que no son búsqueda ni estado)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [filtersOpen]);

  // Selección para acciones en lote (solo planilla)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
      setSummary(res.summary ?? null);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Error al cargar las facturas de compra');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, tab, supplierFilter, debouncedSearch, currencyFilter, conditionFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Al cambiar la consulta, la selección deja de tener sentido.
  useEffect(() => { setSelectedIds([]); }, [page, limit, tab, supplierFilter, debouncedSearch, currencyFilter, conditionFilter, typeFilter, dateFrom, dateTo]);

  // Debounce de la búsqueda por número. La vuelta a la página 1 la hace ya
  // setSearch, así que acá no se toca: al montar pisaría el page de la URL.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
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

  // Traemos la factura completa (con ítems/tributos) porque la fila
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

  // ── Filtros activos (chips) ────────────────────────────────────────────────

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (supplierFilter) {
      const name = suppliers.find((s) => s.id === supplierFilter)?.name ?? 'Proveedor';
      chips.push({ key: 'supplier', label: `Proveedor: ${name}`, clear: () => setValues({ supplier: '', page: '1' }) });
    }
    if (typeFilter) {
      const label = TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter)?.label ?? typeFilter;
      chips.push({ key: 'type', label: `Tipo: ${label}`, clear: () => setValues({ type: '', page: '1' }) });
    }
    if (conditionFilter) {
      chips.push({
        key: 'condition',
        label: conditionFilter === 'CUENTA_CORRIENTE' ? 'Cuenta corriente' : 'Contado',
        clear: () => setValues({ condition: '', page: '1' }),
      });
    }
    if (currencyFilter) chips.push({ key: 'currency', label: `Moneda: ${currencyFilter}`, clear: () => setValues({ currency: '', page: '1' }) });
    if (dateFrom) chips.push({ key: 'from', label: `Desde ${formatDate(dateFrom)}`, clear: () => setValues({ dateFrom: '', page: '1' }) });
    if (dateTo)   chips.push({ key: 'to',   label: `Hasta ${formatDate(dateTo)}`,   clear: () => setValues({ dateTo: '', page: '1' }) });
    return chips;
  }, [supplierFilter, typeFilter, conditionFilter, currencyFilter, dateFrom, dateTo, suppliers, setValues]);

  const clearAllFilters = () => reset(['limit', 'tab']);

  // ── Selección en lote (planilla) ───────────────────────────────────────────

  const selected = useMemo(
    () => invoices.filter((i) => selectedIds.includes(i.id)),
    [invoices, selectedIds]
  );

  const selectionBalanceArs = selected.reduce((s, inv) => {
    const balance = Number(inv.amount) - Number(inv.paidAmount ?? 0);
    return s + balance * (Number(inv.exchangeRate) || 1);
  }, 0);

  // La orden de pago es por proveedor: con proveedores mezclados no se puede generar.
  const selectedSupplierIds = Array.from(new Set(selected.map((i) => i.supplierId).filter(Boolean)));
  const canGenerateOP =
    selected.length > 0 &&
    selectedSupplierIds.length === 1 &&
    selected.every((i) => i.status !== 'PAID' && !isCreditNote(i.type));

  const opBlockReason = (() => {
    if (selected.length === 0) return null;
    if (selectedSupplierIds.length > 1) return 'La orden de pago es por proveedor: hay más de uno en la selección';
    if (selectedSupplierIds.length === 0) return 'Las facturas seleccionadas no tienen proveedor asignado';
    if (selected.some((i) => i.status === 'PAID')) return 'Hay facturas ya pagadas en la selección';
    if (selected.some((i) => isCreditNote(i.type))) return 'Las notas de crédito no se pagan: se imputan como saldo a favor';
    return null;
  })();

  const generateOP = () => {
    if (!canGenerateOP) return;
    const ids = selected.map((i) => i.id).join(',');
    navigate(`/orden-pagos/new?supplierId=${selectedSupplierIds[0]}&invoices=${ids}`);
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allOnPageSelected = invoices.length > 0 && invoices.every((i) => selectedIds.includes(i.id));
  const toggleAllOnPage = () => {
    setSelectedIds(allOnPageSelected ? [] : invoices.map((i) => i.id));
  };

  const exportRows = () => {
    const rows = (selected.length > 0 ? selected : invoices).map((inv) => ({
      fecha:     formatDate(inv.date),
      tipo:      TYPE_SHORT[inv.type] ?? inv.type,
      numero:    inv.number,
      proveedor: inv.supplier?.name ?? '',
      vencimiento: inv.dueDate ? formatDate(inv.dueDate) : '',
      moneda:    inv.currency || 'ARS',
      neto:      Number(inv.subtotal ?? 0),
      iva:       Number(inv.taxAmount ?? 0),
      tributos:  Number(inv.tributosAmount ?? 0),
      total:     Number(inv.amount),
      pagado:    Number(inv.paidAmount ?? 0),
      saldo:     Number(inv.amount) - Number(inv.paidAmount ?? 0),
      estado:    STATUS_CFG[inv.status].label,
    }));
    if (rows.length === 0) { toast.error('No hay filas para exportar'); return; }
    exportToExcel(
      `facturas-compra-${new Date().toISOString().slice(0, 10)}`,
      'Facturas de compra',
      [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Tipo', key: 'tipo', width: 10 },
        { header: 'Número', key: 'numero', width: 18 },
        { header: 'Proveedor', key: 'proveedor', width: 30 },
        { header: 'Vencimiento', key: 'vencimiento', width: 13 },
        { header: 'Moneda', key: 'moneda', width: 9 },
        { header: 'Neto', key: 'neto', width: 14, format: 'currency' },
        { header: 'IVA', key: 'iva', width: 14, format: 'currency' },
        { header: 'Otros tributos', key: 'tributos', width: 14, format: 'currency' },
        { header: 'Total', key: 'total', width: 15, format: 'currency' },
        { header: 'Pagado', key: 'pagado', width: 14, format: 'currency' },
        { header: 'Saldo', key: 'saldo', width: 15, format: 'currency' },
        { header: 'Estado', key: 'estado', width: 14 },
      ],
      rows,
    );
  };

  // ── Celdas compartidas ─────────────────────────────────────────────────────

  const typeBadge = (inv: PurchaseInvoice) => (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
      isCreditNote(inv.type)
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : 'text-indigo-700 bg-indigo-50 border-indigo-200'
    }`}>
      {TYPE_SHORT[inv.type] ?? inv.type}
    </span>
  );

  const dueBadge = (inv: PurchaseInvoice) => {
    const days = daysUntil(inv.dueDate);
    if (days === null) return <span className="text-gray-300 dark:text-slate-600">—</span>;
    const settled = inv.status === 'PAID';
    return (
      <>
        <p className={`text-sm tabular-nums ${settled ? 'text-gray-400 dark:text-slate-500' : 'text-gray-700 dark:text-slate-300'}`}>
          {formatDate(inv.dueDate!)}
        </p>
        {!settled && days < 0 && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border text-red-700 bg-red-50 border-red-200">
            <Clock className="w-3 h-3" /> Vencida hace {Math.abs(days)} d
          </span>
        )}
        {!settled && days >= 0 && days <= 7 && (
          <span className="mt-0.5 inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200">
            {days === 0 ? 'Vence hoy' : `Vence en ${days} d`}
          </span>
        )}
      </>
    );
  };

  const rowActions = (inv: PurchaseInvoice) => (
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
  );

  const hasFilters = activeFilters.length > 0 || !!search;

  return (
    <div>
      <PageHeader
        title="Facturas de Compra"
        subtitle="Comprobantes del proveedor — deuda y cuenta corriente"
        actions={
          <>
            <Button variant="outline" size="md" onClick={exportRows}>
              <Download className="w-4 h-4 mr-1.5 text-gray-400" />
              {selectedIds.length > 0 ? `Exportar (${selectedIds.length})` : 'Exportar'}
            </Button>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-1.5" /> Nueva factura
            </Button>
          </>
        }
      />

      {/* Situación de lo que se está mirando (todo el filtro, no solo la página) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card padding="none" className="px-4 py-3.5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Saldo pendiente</p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-gray-900 dark:text-white">
            {summary ? formatCurrency(summary.balanceArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary ? `${summary.count} comprobantes · ${summary.supplierCount} proveedores` : 'Cargando…'}
          </p>
        </Card>

        <Card padding="none" className={`px-4 py-3.5 ${summary && summary.overdueCount > 0 ? '!border-red-200 dark:!border-red-900' : ''}`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3 h-3" /> Vencido
          </p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-red-700 dark:text-red-400">
            {summary ? formatCurrency(summary.overdueArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary && summary.overdueCount > 0
              ? `${summary.overdueCount} ${summary.overdueCount === 1 ? 'factura' : 'facturas'}${
                  summary.oldestOverdueDate ? ` · la más vieja, ${Math.abs(daysUntil(summary.oldestOverdueDate)!)} días` : ''
                }`
              : 'Sin facturas vencidas'}
          </p>
        </Card>

        <Card padding="none" className="px-4 py-3.5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Vence esta semana</p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
            {summary ? formatCurrency(summary.dueSoonArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary
              ? `${summary.dueSoonCount} ${summary.dueSoonCount === 1 ? 'factura' : 'facturas'} en los próximos 7 días`
              : 'Cargando…'}
          </p>
        </Card>

        <Card padding="none" className="px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            <DollarSign className="w-3 h-3" /> Dólar BNA (venta)
          </p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-indigo-600 dark:text-indigo-400">
            {usdRate ? formatCurrency(usdRate, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {usdRate ? 'Cotización del día · para las facturas en USD' : 'Sin conexión a la cotización'}
          </p>
        </Card>
      </div>

      {/* Estado + búsqueda + vista + filtros */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {TABS.map((t) => (
              <button key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Conmutador de vista */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800">
            <button
              onClick={() => setViewMode('summary')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                viewMode === 'summary'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-semibold shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 font-medium'
              }`}
              title="Vista resumen">
              <Rows3 className="w-3.5 h-3.5" /> Resumen
            </button>
            <button
              onClick={() => setViewMode('sheet')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                viewMode === 'sheet'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-semibold shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 font-medium'
              }`}
              title="Vista planilla (densa, con neto e IVA discriminados)">
              <Table2 className="w-3.5 h-3.5" /> Planilla
            </button>
          </div>

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

          {/* Filtros en un panel: antes eran 6 selects sueltos en la barra */}
          <div className="relative" ref={filtersRef}>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activeFilters.length > 0
                  ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800'
                  : 'text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
              }`}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
              {activeFilters.length > 0 && (
                <span className="tabular-nums text-[10px] font-bold text-white bg-indigo-600 rounded-full px-1.5 py-px">
                  {activeFilters.length}
                </span>
              )}
            </button>

            {filtersOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 w-80 p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Proveedor</label>
                  <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={SELECT_CLS}>
                    <option value="">Todos los proveedores</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Tipo de comprobante</label>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={SELECT_CLS}>
                    <option value="">Todos los tipos</option>
                    {TYPE_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Condición</label>
                    <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)} className={SELECT_CLS}>
                      <option value="">Toda condición</option>
                      <option value="CONTADO">Contado</option>
                      <option value="CUENTA_CORRIENTE">Cuenta corriente</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Moneda</label>
                    <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className={SELECT_CLS}>
                      <option value="">Toda moneda</option>
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Desde</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={SELECT_CLS} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Hasta</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={SELECT_CLS} />
                  </div>
                </div>
                {hasFilters && (
                  <button type="button" onClick={clearAllFilters}
                    className="w-full text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    Limpiar todo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chips de lo aplicado */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {search && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full pl-2.5 pr-2 py-1">
                N° «{search}»
                <button onClick={() => setSearch('')} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeFilters.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full pl-2.5 pr-2 py-1">
                {f.label}
                <button onClick={f.clear} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button type="button" onClick={clearAllFilters} className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1">
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          {viewMode === 'summary' ? (
            /* ── Vista resumen ───────────────────────────────────────────── */
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
                <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Comprobante</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Importe</th>
                  <th className="px-4 py-3 w-56">Saldo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Sin facturas de compra</td></tr>
                ) : (
                  invoices.map((inv) => {
                    const paid = Number(inv.paidAmount ?? 0);
                    const amount = Number(inv.amount);
                    const balance = amount - paid;
                    const pct = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;
                    const overdue = inv.status !== 'PAID' && (daysUntil(inv.dueDate) ?? 0) < 0 && !!inv.dueDate;
                    const credit = isCreditNote(inv.type);
                    return (
                      <tr key={inv.id} onClick={() => openRow(inv)}
                        className={`cursor-pointer transition-colors ${
                          overdue ? 'bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50/70 dark:hover:bg-red-900/20'
                                  : 'hover:bg-indigo-50/30 dark:hover:bg-slate-700/50'
                        }`}>
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center gap-2">
                            {typeBadge(inv)}
                            <span className="font-mono text-[13px] font-semibold text-gray-800 dark:text-slate-200">{inv.number}</span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 tabular-nums">{formatDate(inv.date)}</p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                            <Truck className="w-3.5 h-3.5 text-gray-400" />
                            {inv.supplier?.name ?? '—'}
                          </span>
                          <p className={`text-[11px] font-semibold mt-0.5 ${
                            inv.saleCondition === 'CUENTA_CORRIENTE' ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500'
                          }`}>
                            {inv.saleCondition === 'CUENTA_CORRIENTE' ? 'Cta. Cte.' : 'Contado'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top">{dueBadge(inv)}</td>
                        <td className="px-4 py-3.5 align-top text-right">
                          <p className={`text-sm font-semibold tabular-nums ${credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-slate-200'}`}>
                            {credit && '− '}{formatCurrency(amount, inv.currency || 'ARS')}
                          </p>
                          {/* Facturas en moneda extranjera: valor al emitir y valor de hoy */}
                          {inv.currency && inv.currency !== 'ARS' && Number(inv.exchangeRate) > 1 && (
                            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 tabular-nums">
                              al emitir {formatCurrency(amount * Number(inv.exchangeRate), 'ARS')} · cotiz. {Number(inv.exchangeRate).toLocaleString('es-AR')}
                            </p>
                          )}
                          {inv.currency && inv.currency !== 'ARS' && usdRate && (
                            <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mt-0.5 tabular-nums">
                              hoy {formatCurrency(amount * usdRate, 'ARS')} · cotiz. {usdRate.toLocaleString('es-AR')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {credit ? (
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Saldo a favor</span>
                          ) : inv.status === 'PAID' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Saldada
                            </span>
                          ) : (
                            <>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className={`text-sm font-semibold tabular-nums ${paid > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-slate-200'}`}>
                                  {formatCurrency(balance, inv.currency || 'ARS')}
                                </span>
                                <span className="text-[11px] text-gray-400 dark:text-slate-500 tabular-nums">
                                  {paid > 0 ? `${pct} % pagado` : 'sin pagos'}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                                <div className="h-1 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top text-right">{rowActions(inv)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ── Vista planilla ──────────────────────────────────────────── */
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="pl-4 pr-2 py-2.5 w-9">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                  </th>
                  <th className="px-3 py-2.5 w-24">Fecha</th>
                  <th className="px-3 py-2.5 w-24">Tipo</th>
                  <th className="px-3 py-2.5 w-40">Número</th>
                  <th className="px-3 py-2.5">Proveedor</th>
                  <th className="px-3 py-2.5 w-24">Vto.</th>
                  <th className="px-3 py-2.5 w-32 text-right">Neto</th>
                  <th className="px-3 py-2.5 w-28 text-right">IVA</th>
                  <th className="px-3 py-2.5 w-28 text-right">Tributos</th>
                  <th className="px-3 py-2.5 w-32 text-right">Total</th>
                  <th className="px-3 py-2.5 w-32 text-right">Saldo</th>
                  <th className="px-3 py-2.5 w-28">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {isLoading ? (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">Sin facturas de compra</td></tr>
                ) : (
                  invoices.map((inv) => {
                    const cfg = STATUS_CFG[inv.status];
                    const StatusIcon = cfg.icon;
                    const credit = isCreditNote(inv.type);
                    const sign = credit ? '− ' : '';
                    const cur = inv.currency || 'ARS';
                    const paid = Number(inv.paidAmount ?? 0);
                    const balance = Number(inv.amount) - paid;
                    const days = daysUntil(inv.dueDate);
                    const isSelected = selectedIds.includes(inv.id);
                    return (
                      <tr key={inv.id} onClick={() => openRow(inv)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-indigo-50/30 dark:hover:bg-slate-700/50'
                        }`}>
                        <td className="pl-4 pr-2 py-2 w-9" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRow(inv.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 text-[13px] tabular-nums text-gray-600 dark:text-slate-300">{formatDate(inv.date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{typeBadge(inv)}</td>
                        <td className="px-3 py-2 font-mono text-[13px] font-semibold text-gray-800 dark:text-slate-200">{inv.number}</td>
                        <td className="px-3 py-2 text-[13px] text-gray-700 dark:text-slate-300 truncate">
                          {inv.supplier?.name ?? '—'}
                          {cur !== 'ARS' && (
                            <span className="ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border text-gray-600 bg-gray-50 border-gray-200 tabular-nums">
                              {cur} {Number(inv.exchangeRate).toLocaleString('es-AR')}
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-[13px] tabular-nums ${
                          inv.status !== 'PAID' && days !== null && days < 0 ? 'text-red-600 dark:text-red-400 font-semibold'
                            : inv.status !== 'PAID' && days !== null && days <= 7 ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}>
                          {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-[13px] text-right tabular-nums ${credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-slate-300'}`}>
                          {sign}{formatCurrency(Number(inv.subtotal ?? 0), cur)}
                        </td>
                        <td className={`px-3 py-2 text-[13px] text-right tabular-nums ${credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-slate-300'}`}>
                          {Number(inv.taxAmount ?? 0) === 0
                            ? <span className="text-gray-300 dark:text-slate-600">—</span>
                            : <>{sign}{formatCurrency(Number(inv.taxAmount), cur)}</>}
                        </td>
                        <td className="px-3 py-2 text-[13px] text-right tabular-nums text-gray-600 dark:text-slate-300">
                          {Number(inv.tributosAmount ?? 0) === 0
                            ? <span className="text-gray-300 dark:text-slate-600">—</span>
                            : formatCurrency(Number(inv.tributosAmount), cur)}
                        </td>
                        <td className={`px-3 py-2 text-[13px] text-right tabular-nums font-semibold ${credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-slate-200'}`}>
                          {sign}{formatCurrency(Number(inv.amount), cur)}
                        </td>
                        <td className="px-3 py-2 text-[13px] text-right tabular-nums font-semibold">
                          {inv.status === 'PAID'
                            ? <span className="text-gray-300 dark:text-slate-600">—</span>
                            : <span className={credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                                {sign}{formatCurrency(balance, cur)}
                              </span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
                            <StatusIcon className="w-3 h-3" /> {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {!isLoading && invoices.length > 0 && (
                <tfoot className="bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                  <tr className="text-[13px] font-semibold text-gray-700 dark:text-slate-200">
                    <td className="pl-4 pr-2 py-2.5" />
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-slate-400 font-medium" colSpan={4}>
                      Totales de esta página ({invoices.length} de {total})
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(invoices.reduce((s, i) => s + Number(i.subtotal ?? 0) * (Number(i.exchangeRate) || 1), 0), 'ARS')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(invoices.reduce((s, i) => s + Number(i.taxAmount ?? 0) * (Number(i.exchangeRate) || 1), 0), 'ARS')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(invoices.reduce((s, i) => s + Number(i.tributosAmount ?? 0) * (Number(i.exchangeRate) || 1), 0), 'ARS')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(invoices.reduce((s, i) => s + Number(i.amount) * (Number(i.exchangeRate) || 1), 0), 'ARS')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {formatCurrency(
                        invoices
                          .filter((i) => i.status !== 'PAID')
                          .reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount ?? 0)) * (Number(i.exchangeRate) || 1), 0),
                        'ARS'
                      )}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {!isLoading && invoices.length > 0 && (
          <>
            {/* Totales de toda la consulta (no solo la página) */}
            {summary && (
              <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-700 text-[13px] text-gray-500 dark:text-slate-400">
                <span>
                  Total del filtro{' '}
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-slate-200">{formatCurrency(summary.totalArs, 'ARS')}</span>
                </span>
                <span>
                  Saldo{' '}
                  <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(summary.balanceArs, 'ARS')}</span>
                </span>
              </div>
            )}
            <Pagination
              page={page}
              totalPages={totalPages}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </>
        )}
      </Card>

      {/* Barra de acciones en lote (planilla, con selección) */}
      {viewMode === 'sheet' && selectedIds.length > 0 && (
        <div className="sticky bottom-4 mt-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-xl bg-indigo-950 shadow-xl shadow-indigo-950/30">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold tabular-nums">
            {selectedIds.length}
          </span>
          <p className="text-sm text-indigo-100">
            {selectedIds.length === 1 ? 'comprobante seleccionado' : 'comprobantes seleccionados'} ·{' '}
            <span className="font-bold tabular-nums text-white">{formatCurrency(selectionBalanceArs, 'ARS')}</span>
            <span className="text-indigo-300"> de saldo</span>
          </p>
          {opBlockReason && <span className="text-[13px] text-indigo-300">{opBlockReason}</span>}
          <div className="flex-1" />
          <button onClick={exportRows}
            className="px-3.5 py-1.5 text-[13px] font-medium rounded-lg border border-indigo-700 text-indigo-200 hover:bg-indigo-900 transition-colors">
            Exportar selección
          </button>
          <button
            onClick={generateOP}
            disabled={!canGenerateOP}
            title={opBlockReason ?? 'Generar orden de pago con las facturas seleccionadas'}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold rounded-lg bg-white text-indigo-900 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Receipt className="w-3.5 h-3.5" /> Generar orden de pago
          </button>
          <button onClick={() => setSelectedIds([])}
            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-900 transition-colors"
            title="Limpiar selección">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
