import { useState, useEffect, useMemo } from 'react';
import { X, Receipt, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import type {
  PurchaseInvoice,
  CreatePurchaseInvoiceDTO,
  CreatePurchaseInvoiceItemDTO,
  CreatePurchaseInvoiceRetentionDTO,
  RetentionType,
} from '../../types';

// ── Options ──────────────────────────────────────────────────────────────────

const INVOICE_TYPE_OPTIONS = [
  { value: 'FACTURA_A',       label: 'Factura A' },
  { value: 'FACTURA_B',       label: 'Factura B' },
  { value: 'FACTURA_C',       label: 'Factura C' },
  { value: 'FACTURA_M',       label: 'Factura M' },
  { value: 'NOTA_DEBITO_A',   label: 'Nota Débito A' },
  { value: 'NOTA_DEBITO_B',   label: 'Nota Débito B' },
  { value: 'NOTA_CREDITO_A',  label: 'Nota Crédito A' },
  { value: 'NOTA_CREDITO_B',  label: 'Nota Crédito B' },
  { value: 'RECIBO',          label: 'Recibo' },
  { value: 'OTRO',            label: 'Otro' },
];

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen:    boolean;
  purchaseId: string;
  currency:  string;
  existing?: PurchaseInvoice | null;
  onClose:   () => void;
  onSave:    (data: CreatePurchaseInvoiceDTO) => Promise<void>;
  isLoading: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AddPurchaseInvoiceModal({ isOpen, currency, existing, onClose, onSave, isLoading }: Props) {
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [items,       setItems]       = useState<CreatePurchaseInvoiceItemDTO[]>([]);
  const [retenciones, setRetenciones] = useState<CreatePurchaseInvoiceRetentionDTO[]>([]);
  const [showItems,   setShowItems]   = useState(false);
  const [showRets,    setShowRets]    = useState(false);

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
      setItems(existingItems);
      setRetenciones(existingRets);
      setShowItems(existingItems.length > 0);
      setShowRets(existingRets.length > 0);
    } else {
      setForm(EMPTY_FORM);
      setItems([]);
      setRetenciones([]);
      setShowItems(false);
      setShowRets(false);
    }
  }, [isOpen, existing]);

  const set = (field: keyof typeof EMPTY_FORM, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ── Items ──────────────────────────────────────────────────────────────────

  const addItem = () => { setShowItems(true); setItems((prev) => [...prev, { ...EMPTY_ITEM }]); };
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const setItem = (i: number, field: keyof CreatePurchaseInvoiceItemDTO, val: unknown) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

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

  // Sync form totals whenever items change
  useEffect(() => {
    if (!hasItems) return;
    setForm((prev) => ({
      ...prev,
      subtotal:  itemsSubtotal,
      taxAmount: itemsTaxAmount,
      amount:    itemsTotal,
    }));
  }, [hasItems, itemsSubtotal, itemsTaxAmount, itemsTotal]);

  // Manual total handlers — only used when there are no items
  const handleSubtotalChange = (val: number) => {
    const taxAmount = val * (form.taxRate / 100);
    setForm((prev) => ({ ...prev, subtotal: val, taxAmount, amount: val + taxAmount }));
  };
  const handleTaxRateChange = (val: number) => {
    const taxAmount = form.subtotal * (val / 100);
    setForm((prev) => ({ ...prev, taxRate: val, taxAmount, amount: prev.subtotal + taxAmount }));
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

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalRetenciones = retenciones.reduce((s, r) => s + Number(r.amount), 0);
  const netoPagar        = form.amount - totalRetenciones;

  const isValid = form.number.trim() && form.amount > 0;

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

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
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

          {/* IVA + Total — auto when items exist, manual otherwise */}
          {hasItems ? (
            <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/10 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-2">
                Totales calculados desde los ítems
              </p>
              {Object.entries(taxByRate).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, val]) => (
                <div key={rate} className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                  <span>Neto {Number(rate) === 0 ? '(exento)' : `gravado ${rate}%`}</span>
                  <span className="tabular-nums">{formatCurrency(val.subtotal, currency)}</span>
                </div>
              ))}
              {Object.entries(taxByRate).filter(([r]) => Number(r) > 0).map(([rate, val]) => (
                <div key={`iva-${rate}`} className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                  <span>IVA {rate}%</span>
                  <span className="tabular-nums">{formatCurrency(val.tax, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white border-t border-indigo-200 dark:border-indigo-800 pt-2 mt-1">
                <span>Total factura</span>
                <span className="tabular-nums text-indigo-700 dark:text-indigo-400">{formatCurrency(itemsTotal, currency)}</span>
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
                  className={inputCls + ' text-right text-base font-semibold'}
                  value={form.amount || ''} placeholder="0.00"
                  onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)} />
                {form.subtotal > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Neto {formatCurrency(form.subtotal, currency)} + IVA {formatCurrency(form.taxAmount, currency)}
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
                <div className="hidden sm:grid grid-cols-[3fr_60px_80px_64px_80px_28px] gap-1.5 px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Descripción</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Precio unit.</span>
                  <span className="text-right">IVA %</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>

                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[3fr_60px_80px_64px_80px_28px] gap-1.5 items-center">
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
                      {formatCurrency(itemTotal(item), currency)}
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
                    {formatCurrency(items.reduce((s, it) => s + itemSubtotal(it), 0), currency)}
                  </strong></span>
                  <span>Total ítems: <strong className="text-gray-700 dark:text-slate-300 tabular-nums">
                    {formatCurrency(items.reduce((s, it) => s + itemTotal(it), 0), currency)}
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
                <div className="hidden sm:grid grid-cols-[80px_120px_80px_64px_80px_28px] gap-1.5 px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Tipo</span>
                  <span>Jurisdicción</span>
                  <span className="text-right">Base</span>
                  <span className="text-right">%</span>
                  <span className="text-right">Importe</span>
                  <span />
                </div>

                {retenciones.map((ret, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[80px_120px_80px_64px_80px_28px] gap-1.5 items-center">
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

            {/* Retenciones total + neto */}
            {retenciones.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1.5">
                <div className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                  <span>Total factura</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(form.amount, currency)}</span>
                </div>
                <div className="flex justify-between text-xs text-red-600 dark:text-red-400">
                  <span>Total retenciones</span>
                  <span className="tabular-nums font-semibold">− {formatCurrency(totalRetenciones, currency)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-amber-200 dark:border-amber-700 pt-1.5 text-gray-800 dark:text-white">
                  <span>Neto a pagar al proveedor</span>
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(netoPagar, currency)}</span>
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
              Neto a pagar: <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(netoPagar, currency)}</strong>
            </span>
          ) : <span />}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>Cancelar</Button>
            <Button size="sm"
              onClick={() => onSave({ ...form, items, retenciones })}
              isLoading={isLoading} disabled={!isValid}>
              {existing ? 'Guardar cambios' : 'Agregar factura'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
