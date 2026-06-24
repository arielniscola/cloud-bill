import { useState, useEffect, useMemo } from 'react';
import { X, Receipt, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui';
import ProductSearchSelect from './ProductSearchSelect';
import { formatCurrency } from '../../utils/formatters';
import { purchaseInvoicesService, productsService } from '../../services';
import type {
  PurchaseInvoice,
  CreatePurchaseInvoiceDTO,
  CreatePurchaseInvoiceItemDTO,
  CreatePurchaseInvoiceRetentionDTO,
  CreatePurchaseInvoiceTributoDTO,
  RetentionType,
  TributoType,
  Product,
} from '../../types';

// Fila de ítem en el formulario. `productId` es solo una ayuda de carga
// (autocompleta descripción/precio/IVA); no se persiste en la factura.
type PurchaseInvoiceItemRow = CreatePurchaseInvoiceItemDTO & { productId?: string | null };

// ── Options ──────────────────────────────────────────────────────────────────

const INVOICE_TYPE_OPTIONS = [
  { value: 'FACTURA_A',       label: 'Factura A' },
  { value: 'FACTURA_B',       label: 'Factura B' },
  { value: 'FACTURA_C',       label: 'Factura C' },
  { value: 'FACTURA_M',       label: 'Factura M' },
  { value: 'NOTA_DEBITO_A',   label: 'Nota Débito A' },
  { value: 'NOTA_DEBITO_B',   label: 'Nota Débito B' },
  { value: 'NOTA_DEBITO_C',   label: 'Nota Débito C' },
  { value: 'NOTA_CREDITO_A',  label: 'Nota Crédito A' },
  { value: 'NOTA_CREDITO_B',  label: 'Nota Crédito B' },
  { value: 'NOTA_CREDITO_C',  label: 'Nota Crédito C' },
  { value: 'RECIBO',          label: 'Recibo' },
  { value: 'OTRO',            label: 'Otro' },
];

const isNoteType = (t: string) => t.startsWith('NOTA_');

const PAYMENT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'Transferencia bancaria' },
  { value: 'CASH',          label: 'Efectivo' },
  { value: 'CHECK',         label: 'Cheque' },
  { value: 'CARD',          label: 'Tarjeta' },
  { value: 'OTHER',         label: 'Otro' },
];

const TAX_RATE_OPTIONS = [
  { value: 0,    label: 'Exento / 0%' },
  { value: 10.5, label: '10.5%' },
  { value: 21,   label: '21%' },
  { value: 27,   label: '27%' },
];

const RETENTION_TYPE_OPTIONS: { value: RetentionType; label: string }[] = [
  { value: 'IIBB',      label: 'IIBB' },
  { value: 'GANANCIAS', label: 'Ganancias' },
  { value: 'IVA',       label: 'IVA' },
  { value: 'OTHER',     label: 'Otro' },
];

const TRIBUTO_TYPE_OPTIONS: { value: TributoType; label: string }[] = [
  { value: 'PERCEPCION_IVA',    label: 'Percepción IVA' },
  { value: 'PERCEPCION_IIBB',   label: 'Percepción IIBB' },
  { value: 'IMPUESTOS_INTERNOS', label: 'Imp. internos' },
  { value: 'OTRO',              label: 'Otro tributo' },
];

const AR_PROVINCES = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
];

// ── Empty state ───────────────────────────────────────────────────────────────

const EMPTY_FORM: Omit<CreatePurchaseInvoiceDTO, 'items' | 'retenciones'> = {
  number:         '',
  type:           'FACTURA_A',
  subtotal:       0,
  taxRate:        21,
  taxAmount:      0,
  amount:         0,
  dueDate:        null,
  imputationDate: null,
  paymentMethod:  'BANK_TRANSFER',
  notes:          null,
};

const EMPTY_ITEM: CreatePurchaseInvoiceItemDTO = {
  description: '',
  quantity:    1,
  unitPrice:   0,
  taxRate:     21,
};

const EMPTY_RET: CreatePurchaseInvoiceRetentionDTO = {
  type:         'IIBB',
  jurisdiction: null,
  base:         0,
  percentage:   0,
  amount:       0,
  certificate:  null,
  notes:        null,
};

const EMPTY_TRIB: CreatePurchaseInvoiceTributoDTO = {
  type:         'PERCEPCION_IVA',
  jurisdiction: null,
  base:         0,
  percentage:   0,
  amount:       0,
  description:  null,
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RemitoPrefill {
  remitoId:     string;
  remitoNumber: string;
  supplierId:   string;
  supplierName?: string;
  currency?:    string;
  items:        CreatePurchaseInvoiceItemDTO[];
}

interface Props {
  isOpen:    boolean;
  purchaseId?: string;
  currency:  string;
  existing?: PurchaseInvoice | null;
  onClose:   () => void;
  onSave:    (data: CreatePurchaseInvoiceDTO) => Promise<void>;
  isLoading: boolean;
  // Standalone mode: factura como documento de primer nivel (sin compra)
  standalone?: boolean;
  suppliers?: { id: string; name: string }[];
  fromRemito?: RemitoPrefill | null;
}

const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'ARS — Peso' },
  { value: 'USD', label: 'USD — Dólar' },
];

const SALE_CONDITION_OPTIONS = [
  { value: 'CONTADO',          label: 'Contado' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente' },
];

const todayISO = () => new Date().toISOString().split('T')[0];

// ── Component ────────────────────────────────────────────────────────────────

export function AddPurchaseInvoiceModal({
  isOpen, currency, existing, onClose, onSave, isLoading,
  standalone = false, suppliers = [], fromRemito = null,
}: Props) {
  const [supplierId,    setSupplierId]    = useState('');
  const [currencyState, setCurrencyState] = useState(currency);
  const [saleCondition, setSaleCondition] = useState<'CONTADO' | 'CUENTA_CORRIENTE'>('CONTADO');
  const [date,          setDate]          = useState(todayISO());
  const [exchangeRate,  setExchangeRate]  = useState(1);
  const [rateLoading,   setRateLoading]   = useState(false);
  const [remitoLink,    setRemitoLink]    = useState<{ id: string; number: string } | null>(null);

  // Cotización del día (Banco Nación, venta) — editable
  const fetchDayRate = async () => {
    setRateLoading(true);
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
      const data = await res.json();
      if (data?.venta) setExchangeRate(Number(data.venta));
    } catch {
      /* sin conexión: queda el valor actual, editable a mano */
    } finally {
      setRateLoading(false);
    }
  };
  const [originInvoiceId, setOriginInvoiceId] = useState<string>('');
  const [originOptions,   setOriginOptions]   = useState<PurchaseInvoice[]>([]);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [items,       setItems]       = useState<PurchaseInvoiceItemRow[]>([]);
  const [products,    setProducts]    = useState<Product[]>([]);
  const [retenciones, setRetenciones] = useState<CreatePurchaseInvoiceRetentionDTO[]>([]);
  const [tributos,    setTributos]    = useState<CreatePurchaseInvoiceTributoDTO[]>([]);
  const [showItems,   setShowItems]   = useState(false);
  const [showRets,    setShowRets]    = useState(false);
  const [showTribs,   setShowTribs]   = useState(false);

  // Reset / populate standalone header fields when opening
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setSupplierId(existing.supplierId ?? '');
      setCurrencyState(existing.currency ?? currency);
      setSaleCondition((existing.saleCondition as 'CONTADO' | 'CUENTA_CORRIENTE') ?? 'CONTADO');
      setDate(existing.date ? existing.date.split('T')[0] : todayISO());
      setExchangeRate(Number(existing.exchangeRate) > 0 ? Number(existing.exchangeRate) : 1);
      setRemitoLink(existing.remitos?.[0] ? { id: existing.remitos[0].id, number: existing.remitos[0].number } : null);
      setOriginInvoiceId(existing.originInvoiceId ?? '');
    } else if (fromRemito) {
      setSupplierId(fromRemito.supplierId);
      setCurrencyState(fromRemito.currency ?? currency);
      setSaleCondition('CONTADO');
      setDate(todayISO());
      setExchangeRate(1);
      setRemitoLink({ id: fromRemito.remitoId, number: fromRemito.remitoNumber });
      setOriginInvoiceId('');
      if ((fromRemito.currency ?? currency) !== 'ARS') fetchDayRate();
    } else {
      setSupplierId('');
      setCurrencyState(currency);
      setSaleCondition('CONTADO');
      setDate(todayISO());
      setExchangeRate(1);
      setRemitoLink(null);
      setOriginInvoiceId('');
      if (currency !== 'ARS') fetchDayRate();
    }
  }, [isOpen, existing, fromRemito, currency]);

  // Reset / populate when opening
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setForm({
        number:         existing.number,
        type:           existing.type,
        subtotal:       Number(existing.subtotal),
        taxRate:        Number(existing.taxRate),
        taxAmount:      Number(existing.taxAmount),
        amount:         Number(existing.amount),
        dueDate:        existing.dueDate        ? existing.dueDate.split('T')[0]        : null,
        imputationDate: existing.imputationDate ? existing.imputationDate.split('T')[0] : null,
        paymentMethod:  existing.paymentMethod,
        notes:          existing.notes,
      });
      const existingItems = (existing.items ?? []).map((i) => ({
        description: i.description,
        quantity:    Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
        taxRate:     Number(i.taxRate),
      }));
      const existingRets = (existing.retenciones ?? []).map((r) => ({
        type:         r.type as RetentionType,
        jurisdiction: r.jurisdiction,
        base:         Number(r.base),
        percentage:   Number(r.percentage),
        amount:       Number(r.amount),
        certificate:  r.certificate,
        notes:        r.notes,
      }));
      const existingTribs = (existing.tributos ?? []).map((t) => ({
        type:         t.type as TributoType,
        jurisdiction: t.jurisdiction,
        base:         Number(t.base),
        percentage:   Number(t.percentage),
        amount:       Number(t.amount),
        description:  t.description,
      }));
      setItems(existingItems);
      setRetenciones(existingRets);
      setTributos(existingTribs);
      setShowItems(existingItems.length > 0);
      setShowRets(existingRets.length > 0);
      setShowTribs(existingTribs.length > 0);
    } else if (fromRemito) {
      setForm({ ...EMPTY_FORM, number: '' });
      setItems(fromRemito.items.map((i) => ({ ...i })));
      setRetenciones([]);
      setTributos([]);
      setShowItems(fromRemito.items.length > 0);
      setShowRets(false);
      setShowTribs(false);
    } else {
      setForm(EMPTY_FORM);
      setItems([]);
      setRetenciones([]);
      setTributos([]);
      setShowItems(false);
      setShowRets(false);
      setShowTribs(false);
    }
  }, [isOpen, existing, fromRemito]);

  // Productos para el selector de ayuda en los ítems (autocompletar)
  useEffect(() => {
    if (!isOpen || products.length > 0) return;
    let cancelled = false;
    productsService.getAll({ limit: 1000 })
      .then((res) => { if (!cancelled) setProducts(res.data); })
      .catch(() => { /* sin productos: el ítem se carga a mano */ });
    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof typeof EMPTY_FORM, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Carga las facturas del proveedor como posibles comprobantes de origen (solo NC/ND)
  const isNote = isNoteType(form.type);
  useEffect(() => {
    if (!isOpen || !isNote || !supplierId) { setOriginOptions([]); return; }
    let cancelled = false;
    purchaseInvoicesService.getAll({ supplierId, limit: 500 })
      .then((res) => {
        if (cancelled) return;
        const facturas = (res.data ?? []).filter(
          (inv) => inv.type.startsWith('FACTURA') && inv.id !== existing?.id,
        );
        setOriginOptions(facturas);
      })
      .catch(() => { if (!cancelled) setOriginOptions([]); });
    return () => { cancelled = true; };
  }, [isOpen, isNote, supplierId, existing?.id]);

  // Al elegir el comprobante de origen, ajusta la letra de la NC/ND para que coincida
  const handleOriginChange = (id: string) => {
    setOriginInvoiceId(id);
    const origin = originOptions.find((o) => o.id === id);
    if (!origin) return;
    const letter = origin.type.split('_').pop();
    const prefix = form.type.startsWith('NOTA_CREDITO') ? 'NOTA_CREDITO' : 'NOTA_DEBITO';
    const candidate = `${prefix}_${letter}`;
    if (INVOICE_TYPE_OPTIONS.some((o) => o.value === candidate)) set('type', candidate);
  };

  // ── Items ──────────────────────────────────────────────────────────────────

  const addItem = () => { setShowItems(true); setItems((prev) => [...prev, { ...EMPTY_ITEM }]); };
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const setItem = (i: number, field: keyof CreatePurchaseInvoiceItemDTO, val: unknown) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  // Al elegir un producto: autocompleta descripción, precio unitario (costo) e IVA.
  // El productId queda solo en el estado local (no se envía al backend).
  const selectProduct = (i: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== i) return item;
      if (!product) return { ...item, productId: null };
      return {
        ...item,
        productId,
        description: product.name,
        unitPrice: Number(product.cost) || item.unitPrice,
        taxRate: Number(product.taxRate),
      };
    }));
  };

  const itemSubtotal = (item: CreatePurchaseInvoiceItemDTO) =>
    item.quantity * item.unitPrice;
  const itemTax = (item: CreatePurchaseInvoiceItemDTO) =>
    itemSubtotal(item) * (item.taxRate / 100);
  const itemTotal = (item: CreatePurchaseInvoiceItemDTO) =>
    itemSubtotal(item) + itemTax(item);

  // ── Auto-calc totals from items ────────────────────────────────────────────
  // When items exist, totals are derived; otherwise user fills them manually.

  const hasItems = items.length > 0;

  const itemsSubtotal = useMemo(
    () => items.reduce((s, it) => s + itemSubtotal(it), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );
  const itemsTaxAmount = useMemo(
    () => items.reduce((s, it) => s + itemTax(it), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );
  const itemsTotal = itemsSubtotal + itemsTaxAmount;

  // "Otros tributos" suman al total del comprobante
  const totalTributos = tributos.reduce((s, t) => s + Number(t.amount), 0);

  // Tax breakdown by rate (for display)
  const taxByRate = useMemo(() => {
    const map: Record<number, { subtotal: number; tax: number }> = {};
    for (const it of items) {
      const rate = Number(it.taxRate);
      if (!map[rate]) map[rate] = { subtotal: 0, tax: 0 };
      map[rate].subtotal += itemSubtotal(it);
      map[rate].tax      += itemTax(it);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Sync form totals whenever items change (grand total includes otros tributos)
  useEffect(() => {
    if (!hasItems) return;
    setForm((prev) => ({
      ...prev,
      subtotal:  itemsSubtotal,
      taxAmount: itemsTaxAmount,
      amount:    itemsTotal + totalTributos,
    }));
  }, [hasItems, itemsSubtotal, itemsTaxAmount, itemsTotal, totalTributos]);

  // In manual mode, fold otros tributos into the grand total
  useEffect(() => {
    if (hasItems) return;
    setForm((prev) => ({ ...prev, amount: prev.subtotal + prev.taxAmount + totalTributos }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasItems, totalTributos]);

  // Manual total handlers — only used when there are no items
  const handleSubtotalChange = (val: number) => {
    const taxAmount = val * (form.taxRate / 100);
    setForm((prev) => ({ ...prev, subtotal: val, taxAmount, amount: val + taxAmount + totalTributos }));
  };
  const handleTaxRateChange = (val: number) => {
    const taxAmount = form.subtotal * (val / 100);
    setForm((prev) => ({ ...prev, taxRate: val, taxAmount, amount: prev.subtotal + taxAmount + totalTributos }));
  };
  const handleTotalChange = (val: number) => {
    const subtotal  = val / (1 + form.taxRate / 100);
    const taxAmount = val - subtotal;
    setForm((prev) => ({ ...prev, amount: val, subtotal, taxAmount }));
  };

  // ── Retenciones ────────────────────────────────────────────────────────────

  const addRet = () => setRetenciones((prev) => [...prev, { ...EMPTY_RET }]);
  const removeRet = (i: number) => setRetenciones((prev) => prev.filter((_, idx) => idx !== i));
  const setRet = (i: number, field: keyof CreatePurchaseInvoiceRetentionDTO, val: unknown) =>
    setRetenciones((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const recalcRetAmount = (i: number, base?: number, pct?: number) => {
    setRetenciones((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const b = base      ?? r.base;
        const p = pct       ?? r.percentage;
        return { ...r, base: b, percentage: p, amount: parseFloat((b * p / 100).toFixed(2)) };
      })
    );
  };

  // ── Otros tributos ──────────────────────────────────────────────────────────

  const addTrib = () => { setShowTribs(true); setTributos((prev) => [...prev, { ...EMPTY_TRIB }]); };
  const removeTrib = (i: number) => setTributos((prev) => prev.filter((_, idx) => idx !== i));
  const setTrib = (i: number, field: keyof CreatePurchaseInvoiceTributoDTO, val: unknown) =>
    setTributos((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));

  const recalcTribAmount = (i: number, base?: number, pct?: number) => {
    setTributos((prev) =>
      prev.map((t, idx) => {
        if (idx !== i) return t;
        const b = base ?? t.base;
        const p = pct  ?? t.percentage;
        return { ...t, base: b, percentage: p, amount: parseFloat((b * p / 100).toFixed(2)) };
      })
    );
  };

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalRetenciones = retenciones.reduce((s, r) => s + Number(r.amount), 0);
  const netoPagar        = form.amount - totalRetenciones;

  const isValid = form.number.trim() && form.amount > 0 && (!standalone || !!supplierId)
    && (!isNote || !!originInvoiceId);

  const buildPayload = (): CreatePurchaseInvoiceDTO => ({
    ...form,
    items: items.map(({ productId: _productId, ...rest }) => rest),
    retenciones, tributos,
    originInvoiceId: isNote ? (originInvoiceId || null) : null,
    ...(standalone ? {
      supplierId,
      currency: currencyState,
      saleCondition,
      exchangeRate: currencyState === 'ARS' ? 1 : (exchangeRate || 1),
      date,
      remitoIds: remitoLink ? [remitoLink.id] : [],
    } : {}),
  });

  // All hooks have been called — safe to early-return now
  if (!isOpen) return null;

  // ── Styles ─────────────────────────────────────────────────────────────────

  const inputCls  = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700';
  const labelCls  = 'block text-xs text-gray-500 dark:text-slate-400 mb-1';
  const tinyInput = 'w-full text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-300';

  // ── Section toggle header ──────────────────────────────────────────────────

  const SectionHeader = ({
    title, count, open, onToggle, onAdd, addLabel,
  }: { title: string; count: number; open: boolean; onToggle: () => void; onAdd: () => void; addLabel: string }) => (
    <div className="flex items-center justify-between py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
        {count > 0 && (
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => { if (!open) onToggle(); onAdd(); }}
        className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {existing ? 'Editar factura' : 'Agregar factura del proveedor'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Standalone header: proveedor / moneda / condición / fecha */}
          {standalone && (
            <div className="rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50/60 dark:bg-slate-700/30 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Proveedor *</label>
                  <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Seleccionar proveedor…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fecha</label>
                  <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Moneda</label>
                  <select className={inputCls} value={currencyState}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCurrencyState(v);
                      if (v !== 'ARS' && !existing) fetchDayRate();
                      if (v === 'ARS') setExchangeRate(1);
                    }}>
                    {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Condición de cobro</label>
                  <select className={inputCls} value={saleCondition}
                    onChange={(e) => setSaleCondition(e.target.value as 'CONTADO' | 'CUENTA_CORRIENTE')}>
                    {SALE_CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {currencyState !== 'ARS' && (
                <div>
                  <label className={labelCls}>Cotización del día (USD → ARS)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} step="0.01"
                      className={inputCls + ' text-right'}
                      value={exchangeRate || ''}
                      placeholder="0.00"
                      onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)} />
                    <button type="button" onClick={fetchDayRate} disabled={rateLoading}
                      className="shrink-0 text-xs px-2.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50">
                      {rateLoading ? '…' : 'Hoy'}
                    </button>
                  </div>
                  {form.amount > 0 && exchangeRate > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      ≈ {formatCurrency(form.amount * exchangeRate, 'ARS')} (Banco Nación venta, editable)
                    </p>
                  )}
                </div>
              )}
              {remitoLink && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Vinculada al remito {remitoLink.number}
                </p>
              )}
              {saleCondition === 'CUENTA_CORRIENTE' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Genera deuda en la cuenta corriente del proveedor.
                </p>
              )}
            </div>
          )}

          {/* Number + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Número de factura *</label>
              <input className={inputCls} placeholder="0001-00012345" value={form.number}
                onChange={(e) => set('number', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Tipo de comprobante *</label>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
                {INVOICE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Comprobante de origen (solo NC/ND) */}
          {isNote && (
            <div>
              <label className={labelCls}>Comprobante de origen *</label>
              <select
                className={inputCls}
                value={originInvoiceId}
                onChange={(e) => handleOriginChange(e.target.value)}
                disabled={!supplierId}
              >
                <option value="">{supplierId ? 'Seleccionar factura…' : 'Elegí primero el proveedor'}</option>
                {originOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {formatCurrency(o.amount, o.currency || 'ARS')} · {new Date(o.date).toLocaleDateString('es-AR')}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                La NC/ND queda vinculada a esta factura del proveedor. La letra se ajusta automáticamente.
              </p>
            </div>
          )}

          {/* IVA + Total — auto when items exist, manual otherwise */}
          {hasItems ? (
            <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/10 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-2">
                Totales calculados desde los ítems
              </p>
              {Object.entries(taxByRate).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, val]) => (
                <div key={rate} className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                  <span>Neto {Number(rate) === 0 ? '(exento)' : `gravado ${rate}%`}</span>
                  <span className="tabular-nums">{formatCurrency(val.subtotal, currencyState)}</span>
                </div>
              ))}
              {Object.entries(taxByRate).filter(([r]) => Number(r) > 0).map(([rate, val]) => (
                <div key={`iva-${rate}`} className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                  <span>IVA {rate}%</span>
                  <span className="tabular-nums">{formatCurrency(val.tax, currencyState)}</span>
                </div>
              ))}
              {totalTributos > 0 && (
                <div className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                  <span>Otros tributos</span>
                  <span className="tabular-nums">+ {formatCurrency(totalTributos, currencyState)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white border-t border-indigo-200 dark:border-indigo-800 pt-2 mt-1">
                <span>Total factura</span>
                <span className="tabular-nums text-indigo-700 dark:text-indigo-400">{formatCurrency(itemsTotal + totalTributos, currencyState)}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Neto gravado</label>
                  <input type="number" min={0} step="0.01" className={inputCls + ' text-right'}
                    value={form.subtotal || ''} placeholder="0.00"
                    onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className={labelCls}>Alícuota IVA</label>
                  <select className={inputCls} value={form.taxRate}
                    onChange={(e) => handleTaxRateChange(parseFloat(e.target.value))}>
                    {TAX_RATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>IVA $</label>
                  <input type="number" className={inputCls + ' text-right bg-gray-50 dark:bg-slate-600'}
                    value={form.taxAmount ? Number(form.taxAmount).toFixed(2) : ''} readOnly />
                </div>
              </div>
              <div>
                <label className={labelCls + ' font-semibold text-gray-700 dark:text-slate-300'}>Total factura *</label>
                <input type="number" min={0} step="0.01"
                  className={inputCls + ' text-right text-base font-semibold' + (totalTributos > 0 ? ' bg-gray-50 dark:bg-slate-600' : '')}
                  value={form.amount || ''} placeholder="0.00"
                  readOnly={totalTributos > 0}
                  onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)} />
                {form.subtotal > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Neto {formatCurrency(form.subtotal, currencyState)} + IVA {formatCurrency(form.taxAmount, currencyState)}
                    {totalTributos > 0 && <> + Otros tributos {formatCurrency(totalTributos, currencyState)}</>}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Imputation date + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fecha de imputación</label>
              <input type="date" className={inputCls} value={form.imputationDate ?? ''}
                onChange={(e) => set('imputationDate', e.target.value || null)} />
            </div>
            <div>
              <label className={labelCls}>Vencimiento de pago</label>
              <input type="date" className={inputCls} value={form.dueDate ?? ''}
                onChange={(e) => set('dueDate', e.target.value || null)} />
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className={labelCls}>Forma de pago</label>
            <select className={inputCls} value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}>
              {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* ── Items section ── */}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
            <SectionHeader
              title="Ítems de la factura"
              count={items.length}
              open={showItems}
              onToggle={() => setShowItems((v) => !v)}
              onAdd={addItem}
              addLabel="Agregar ítem"
            />

            {showItems && items.length > 0 && (
              <div className="mt-2 space-y-2">
                {/* Column headers */}
                <div className="hidden sm:grid grid-cols-[1.5fr_1.5fr_64px_100px_84px_104px_28px] gap-1.5 px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Producto</span>
                  <span>Descripción</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Precio unit.</span>
                  <span className="text-right">IVA %</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>

                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1.5fr_64px_100px_84px_104px_28px] gap-1.5 items-center">
                    <ProductSearchSelect
                      products={products}
                      value={item.productId || ''}
                      onChange={(productId) => selectProduct(i, productId)}
                      placeholder="Elegir producto…"
                      optional
                    />
                    <input className={tinyInput} placeholder="Descripción"
                      value={item.description}
                      onChange={(e) => setItem(i, 'description', e.target.value)} />
                    <input type="number" min={0} step="0.01" className={tinyInput + ' text-right'} placeholder="1"
                      value={item.quantity || ''}
                      onChange={(e) => setItem(i, 'quantity', parseFloat(e.target.value) || 0)} />
                    <input type="number" min={0} step="0.01" className={tinyInput + ' text-right'} placeholder="0.00"
                      value={item.unitPrice || ''}
                      onChange={(e) => setItem(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
                    <select className={tinyInput} value={item.taxRate}
                      onChange={(e) => setItem(i, 'taxRate', parseFloat(e.target.value))}>
                      {TAX_RATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-xs text-right font-semibold tabular-nums text-gray-700 dark:text-slate-300">
                      {formatCurrency(itemTotal(item), currencyState)}
                    </span>
                    <button type="button" onClick={() => removeItem(i)}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Items total */}
                <div className="flex justify-end gap-4 pt-1.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400">
                  <span>Subtotal ítems: <strong className="text-gray-700 dark:text-slate-300 tabular-nums">
                    {formatCurrency(items.reduce((s, it) => s + itemSubtotal(it), 0), currencyState)}
                  </strong></span>
                  <span>Total ítems: <strong className="text-gray-700 dark:text-slate-300 tabular-nums">
                    {formatCurrency(items.reduce((s, it) => s + itemTotal(it), 0), currencyState)}
                  </strong></span>
                </div>
              </div>
            )}
          </div>

          {/* ── Otros tributos section (suman al total) ── */}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
            <SectionHeader
              title="Otros tributos / Percepciones"
              count={tributos.length}
              open={showTribs}
              onToggle={() => setShowTribs((v) => !v)}
              onAdd={addTrib}
              addLabel="Agregar tributo"
            />

            {showTribs && tributos.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="hidden sm:grid grid-cols-[1.3fr_1.7fr_110px_80px_120px_32px] gap-1.5 px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Tipo</span>
                  <span>Jurisdicción</span>
                  <span className="text-right">Base</span>
                  <span className="text-right">%</span>
                  <span className="text-right">Importe</span>
                  <span />
                </div>

                {tributos.map((trib, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.3fr_1.7fr_110px_80px_120px_32px] gap-1.5 items-center">
                    <select className={tinyInput} value={trib.type}
                      onChange={(e) => setTrib(i, 'type', e.target.value as TributoType)}>
                      {TRIBUTO_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {trib.type === 'PERCEPCION_IIBB' ? (
                      <select className={tinyInput} value={trib.jurisdiction ?? ''}
                        onChange={(e) => setTrib(i, 'jurisdiction', e.target.value || null)}>
                        <option value="">Jurisdicción</option>
                        {AR_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <input className={tinyInput} placeholder="—"
                        value={trib.jurisdiction ?? ''}
                        onChange={(e) => setTrib(i, 'jurisdiction', e.target.value || null)} />
                    )}
                    <input type="number" min={0} step="0.01" className={tinyInput + ' text-right'} placeholder="0.00"
                      value={trib.base || ''}
                      onChange={(e) => recalcTribAmount(i, parseFloat(e.target.value) || 0, undefined)} />
                    <input type="number" min={0} max={100} step="0.01" className={tinyInput + ' text-right'} placeholder="0.00"
                      value={trib.percentage || ''}
                      onChange={(e) => recalcTribAmount(i, undefined, parseFloat(e.target.value) || 0)} />
                    <input type="number" min={0} step="0.01" className={tinyInput + ' text-right font-semibold'} placeholder="0.00"
                      value={trib.amount || ''}
                      onChange={(e) => setTrib(i, 'amount', parseFloat(e.target.value) || 0)} />
                    <button type="button" onClick={() => removeTrib(i)}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex justify-end pt-1.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400">
                  <span>Total otros tributos: <strong className="text-gray-700 dark:text-slate-300 tabular-nums">
                    {formatCurrency(totalTributos, currencyState)}
                  </strong></span>
                </div>
              </div>
            )}
          </div>

          {/* ── Retenciones section ── */}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
            <SectionHeader
              title="Retenciones"
              count={retenciones.length}
              open={showRets}
              onToggle={() => setShowRets((v) => !v)}
              onAdd={addRet}
              addLabel="Agregar retención"
            />

            {showRets && retenciones.length > 0 && (
              <div className="mt-2 space-y-2">
                {/* Column headers */}
                <div className="hidden sm:grid grid-cols-[1.3fr_1.7fr_110px_80px_120px_32px] gap-1.5 px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Tipo</span>
                  <span>Jurisdicción</span>
                  <span className="text-right">Base</span>
                  <span className="text-right">%</span>
                  <span className="text-right">Importe</span>
                  <span />
                </div>

                {retenciones.map((ret, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.3fr_1.7fr_110px_80px_120px_32px] gap-1.5 items-center">
                    <select className={tinyInput} value={ret.type}
                      onChange={(e) => setRet(i, 'type', e.target.value as RetentionType)}>
                      {RETENTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {ret.type === 'IIBB' ? (
                      <select className={tinyInput} value={ret.jurisdiction ?? ''}
                        onChange={(e) => setRet(i, 'jurisdiction', e.target.value || null)}>
                        <option value="">Jurisdicción</option>
                        {AR_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <input className={tinyInput} placeholder="—"
                        value={ret.jurisdiction ?? ''}
                        onChange={(e) => setRet(i, 'jurisdiction', e.target.value || null)} />
                    )}
                    <input type="number" min={0} step="0.01" className={tinyInput + ' text-right'} placeholder="0.00"
                      value={ret.base || ''}
                      onChange={(e) => recalcRetAmount(i, parseFloat(e.target.value) || 0, undefined)} />
                    <input type="number" min={0} max={100} step="0.01" className={tinyInput + ' text-right'} placeholder="0.00"
                      value={ret.percentage || ''}
                      onChange={(e) => recalcRetAmount(i, undefined, parseFloat(e.target.value) || 0)} />
                    <input type="number" min={0} step="0.01" className={tinyInput + ' text-right font-semibold'} placeholder="0.00"
                      value={ret.amount || ''}
                      onChange={(e) => setRet(i, 'amount', parseFloat(e.target.value) || 0)} />
                    <button type="button" onClick={() => removeRet(i)}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {retenciones.some((r) => r.certificate !== null) && (
                  <div className="space-y-1 pt-1">
                    {retenciones.map((ret, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-20 shrink-0">{ret.type} {ret.jurisdiction ? `(${ret.jurisdiction})` : ''}</span>
                        <input className={tinyInput + ' flex-1'} placeholder="Nº certificado (opcional)"
                          value={ret.certificate ?? ''}
                          onChange={(e) => setRet(i, 'certificate', e.target.value || null)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Totales: factura (incl. otros tributos) − retenciones = neto a pagar */}
            {(retenciones.length > 0 || tributos.length > 0) && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1.5">
                {totalTributos > 0 && (
                  <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                    <span>Incluye otros tributos</span>
                    <span className="tabular-nums">+ {formatCurrency(totalTributos, currencyState)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                  <span>Total factura</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(form.amount, currencyState)}</span>
                </div>
                {totalRetenciones > 0 && (
                  <div className="flex justify-between text-xs text-red-600 dark:text-red-400">
                    <span>Total retenciones</span>
                    <span className="tabular-nums font-semibold">− {formatCurrency(totalRetenciones, currencyState)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-amber-200 dark:border-amber-700 pt-1.5 text-gray-800 dark:text-white">
                  <span>Neto a pagar al proveedor</span>
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(netoPagar, currencyState)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notas</label>
            <input className={inputCls} placeholder="Opcional" value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          {retenciones.length > 0 ? (
            <span className="text-xs text-gray-500 dark:text-slate-400">
              Neto a pagar: <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(netoPagar, currencyState)}</strong>
            </span>
          ) : <span />}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>Cancelar</Button>
            <Button size="sm"
              onClick={() => onSave(buildPayload())}
              isLoading={isLoading} disabled={!isValid}>
              {existing ? 'Guardar cambios' : standalone ? 'Crear factura' : 'Agregar factura'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
