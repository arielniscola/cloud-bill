import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import {
  ArrowLeftRight, Banknote, Barcode, CheckCircle2, CreditCard, FileText, Loader2, Minus, Plus,
  Printer, Search, Smartphone, Trash2, Wallet, X, AlertTriangle,
} from 'lucide-react';
import { CustomerSearchSelect } from '../../components/shared';
import { playScanError, playScanSuccess } from '../../utils/scanFeedback';
import { productsService } from '../../services';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import type { CashRegister, Customer, Product, Warehouse } from '../../types';
import type { BankAccount } from '../../types/bank.types';
import type { ProductVariant } from '../../types/product-variant.types';
import { parseAmount } from './invoiceCounter';
import type { CounterItem, CounterLastSale, CounterPayment, CounterTender } from './invoiceCounter';

/**
 * Layout "mostrador" del formulario de factura (opción A del rediseño).
 *
 * Pensado para vender parado frente al cliente: un solo campo para escanear o
 * buscar, la lista de lo que se lleva y el cobro siempre a la vista, con el
 * vuelto calculado. Se maneja entero con el teclado (F2 cliente, F4 descuento,
 * F8 medio de pago, F9 cobrar) y al terminar deja la pantalla lista para la
 * venta siguiente en vez de navegar al detalle.
 *
 * Igual que la carga rápida, no tiene estado de negocio propio: el formulario,
 * los cálculos, el submit y el cobro viven en InvoiceFormPage.
 */

interface Props {
  // ── Comprobante ──
  customers: Customer[];
  customerId: string;
  selectedCustomer?: Customer;
  onCustomerChange: (id: string, picked?: Customer) => void;
  customerError?: string;
  type: string;
  typeOptions: Array<{ value: string; label: string }>;
  onTypeChange: (value: string) => void;
  isTypeC: boolean;
  warehouses: Warehouse[];
  effectiveWarehouseId: string;
  onWarehouseChange: (id: string) => void;
  saleCondition: string;
  onSaleConditionChange: (cuentaCorriente: boolean) => void;
  needsCustomerId: boolean;
  cashIdThreshold: number;

  // ── Ítems ──
  products: Product[];
  fields: Array<{ id: string }>;
  items: CounterItem[];
  itemsError?: string;
  findProduct: (productId: string) => Product | undefined;
  variantsByProduct: Record<string, ProductVariant[]>;
  stockFor: (productId: string, variantId: string | null) =>
    { state: 'loading' | 'error' } | { state: 'ok'; available: number };
  /** Detalle libre de la línea (servicios), o null. */
  renderItemDetail?: (index: number) => ReactNode;
  calcItemAmounts: (index: number) => { total: number };
  onAddProduct: (product: Product, qty?: number) => void;
  onQuantityChange: (index: number, quantity: number) => void;
  onVariantChange: (index: number, variantId: string) => void;
  onRemoveItem: (index: number) => void;
  onOpenCatalog: () => void;

  // ── Totales ──
  totals: { subtotal: number; discountAmount: number; taxAmount: number };
  grandTotal: number;
  discountType: '%' | '$';
  discountValue: number;
  onDiscountChange: (type: '%' | '$', value: number) => void;

  // ── Cobro ──
  payment: CounterPayment;
  onPaymentChange: (patch: Partial<CounterPayment>) => void;
  cashRegisters: CashRegister[];
  bankAccounts: BankAccount[];

  // ── Acciones ──
  withArca: boolean;
  arcaDisabledReason?: string;
  onWithArcaChange: (next: boolean) => void;
  isLoading: boolean;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
  lastSale: CounterLastSale | null;
  onDismissLastSale: () => void;
}

const TENDERS: Array<{ value: CounterTender; label: string; icon: typeof Banknote }> = [
  { value: 'CASH',          label: 'Efectivo',      icon: Banknote },
  { value: 'CARD',          label: 'Tarjeta',       icon: CreditCard },
  { value: 'BANK_TRANSFER', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'MERCADO_PAGO',  label: 'Mercado Pago',  icon: Smartphone },
  { value: 'CHECK',         label: 'Cheque',        icon: FileText },
  { value: 'CC',            label: 'Cta. cte.',     icon: Wallet },
];

const parseQuantityPrefix = (raw: string): { qty: number; term: string } => {
  const m = raw.match(/^(\d+)\s*\*\s*(.+)$/);
  if (!m) return { qty: 1, term: raw };
  return { qty: Math.max(1, parseInt(m[1], 10) || 1), term: m[2].trim() };
};

/** Texto que se busca por nombre mientras se tipea: los códigos (solo dígitos) esperan al Enter. */
const isNameSearch = (term: string) => term.length >= 3 && !/^\d+$/.test(term);

const matchesCode = (p: Product, code: string) =>
  (!!p.barcode && p.barcode === code) || p.sku.toLowerCase() === code.toLowerCase();

/** Montos redondos para el efectivo: los billetes con los que el cliente probablemente paga. */
function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  for (const step of [1000, 5000, 10000, 20000]) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) out.add(rounded);
  }
  return Array.from(out).sort((a, b) => a - b).slice(0, 3);
}


function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={clsx(
      'inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md border border-b-2 font-mono text-[11px] font-semibold',
      'border-gray-300 bg-white text-gray-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
      className,
    )}>
      {children}
    </kbd>
  );
}

export default function InvoiceCounterLayout(props: Props) {
  const {
    customers, customerId, selectedCustomer, onCustomerChange, customerError,
    type, typeOptions, onTypeChange, isTypeC, warehouses, effectiveWarehouseId, onWarehouseChange,
    saleCondition, onSaleConditionChange, needsCustomerId, cashIdThreshold,
    products, fields, items, itemsError, findProduct, variantsByProduct, stockFor, renderItemDetail, calcItemAmounts,
    onAddProduct, onQuantityChange, onVariantChange, onRemoveItem, onOpenCatalog,
    totals, grandTotal, discountType, discountValue, onDiscountChange,
    payment, onPaymentChange, cashRegisters, bankAccounts,
    withArca, arcaDisabledReason, onWithArcaChange, isLoading, onSubmit, onSaveDraft, onCancel,
    lastSale, onDismissLastSale,
  } = props;

  const scanRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const [scan, setScan] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'searching' | 'notfound'>('idle');
  const [results, setResults] = useState<Product[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);
  const searchSeq = useRef(0);

  const tender: CounterTender = saleCondition === 'CUENTA_CORRIENTE' ? 'CC' : payment.method;
  const unitsCount = items.reduce((sum, it) => sum + (it.productId ? Number(it.quantity) || 0 : 0), 0);
  const received = parseAmount(payment.received);
  const change = tender === 'CASH' && received > 0 ? received - grandTotal : 0;

  const focusScan = () => requestAnimationFrame(() => scanRef.current?.focus());

  useEffect(() => { focusScan(); }, []);
  useEffect(() => { if (lastSale) focusScan(); }, [lastSale]);

  const add = (product: Product, qty: number) => {
    onAddProduct(product, qty);
    setLastAddedId(product.id);
    setScan('');
    setResults([]);
    setScanStatus('idle');
    playScanSuccess();
    focusScan();
  };

  /** Cambia la cantidad del último producto agregado (teclas + y − con el buscador vacío). */
  const bumpLast = (delta: number) => {
    const index = lastAddedId
      ? items.findIndex((it) => it.productId === lastAddedId)
      : items.map((it) => !!it.productId).lastIndexOf(true);
    if (index < 0) return;
    const next = (Number(items[index].quantity) || 0) + delta;
    if (next <= 0) onRemoveItem(index);
    else onQuantityChange(index, next);
  };

  const searchProducts = async (term: string) => {
    const seq = ++searchSeq.current;
    setScanStatus('searching');
    try {
      const res = await productsService.getAll({ search: term, limit: 8, isActive: true });
      if (seq !== searchSeq.current) return null;
      setScanStatus('idle');
      return res.data;
    } catch {
      if (seq === searchSeq.current) setScanStatus('idle');
      return null;
    }
  };

  // Búsqueda por nombre mientras se tipea. Los lectores de código escriben
  // solo dígitos y a ráfagas: esos se resuelven al llegar el Enter.
  useEffect(() => {
    const { term } = parseQuantityPrefix(scan.trim());
    if (!isNameSearch(term)) return;
    // Una respuesta que llega después de seguir tipeando ya no corresponde.
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchProducts(term);
      if (found && !cancelled) { setResults(found); setActiveResult(0); }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scan]);

  const onScanChange = (next: string) => {
    setScan(next);
    if (!isNameSearch(parseQuantityPrefix(next.trim()).term)) setResults([]);
  };

  const onScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!scan && (e.key === '+' || e.key === '-')) {
      e.preventDefault();
      bumpLast(e.key === '+' ? 1 : -1);
      return;
    }
    if (e.key === 'Escape' && scan) {
      e.stopPropagation();
      setScan('');
      setResults([]);
      return;
    }
    if (results.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveResult((i) => (i + delta + results.length) % results.length);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const { qty, term } = parseQuantityPrefix(scan.trim());
    if (!term) return;

    // Lectores defectuosos mandan el Enter dos veces.
    const now = Date.now();
    if (lastScanRef.current?.code === term && now - lastScanRef.current.ts < 250) { setScan(''); return; }
    lastScanRef.current = { code: term, ts: now };

    // 1) Código exacto en la precarga, 2) resultado resaltado de la lista,
    // 3) búsqueda en el servidor: código exacto o resultado único.
    const exact = products.find((p) => matchesCode(p, term));
    if (exact) { add(exact, qty); return; }
    if (results.length > 0) { add(results[activeResult] ?? results[0], qty); return; }

    const found = await searchProducts(term);
    if (!found) return;
    const byCode = found.find((p) => matchesCode(p, term));
    if (byCode) { add(byCode, qty); return; }
    if (found.length === 1) { add(found[0], qty); return; }
    if (found.length > 1) { setResults(found); setActiveResult(0); return; }
    setScanStatus('notfound');
    playScanError();
    setTimeout(() => setScanStatus('idle'), 2000);
  };

  const chooseTender = (next: CounterTender) => {
    if (next === 'CC') {
      if (!customerId) return;
      onSaleConditionChange(true);
      return;
    }
    if (saleCondition === 'CUENTA_CORRIENTE') onSaleConditionChange(false);
    onPaymentChange({ method: next });
  };

  // Atajos propios del mostrador. Los globales del formulario (Ctrl+Enter,
  // Ctrl+B, Escape) siguen funcionando por useFormKeyboardShortcuts.
  const keyRef = useRef({ chooseTender, tender, onSubmit, onOpenCatalog, customerId });
  useEffect(() => {
    keyRef.current = { chooseTender, tender, onSubmit, onOpenCatalog, customerId };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if (e.key === 'F1') { e.preventDefault(); scanRef.current?.focus(); return; }
      if (e.key === 'F2') {
        e.preventDefault();
        customerRef.current?.querySelector<HTMLElement>('input, button')?.focus();
        customerRef.current?.querySelector<HTMLElement>('button')?.click();
        return;
      }
      if (e.key === 'F3') { e.preventDefault(); k.onOpenCatalog(); return; }
      if (e.key === 'F4') { e.preventDefault(); discountRef.current?.focus(); discountRef.current?.select(); return; }
      if (e.key === 'F8') {
        e.preventDefault();
        const order = TENDERS.map((t) => t.value).filter((v) => v !== 'CC' || k.customerId);
        const next = order[(order.indexOf(k.tender) + 1) % order.length];
        k.chooseTender(next);
        return;
      }
      if (e.key === 'F9') { e.preventDefault(); k.onSubmit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleRows = fields
    .map((field, index) => ({ field, index, item: items[index] }))
    .filter((row) => row.item?.productId);

  const finalUnitPrice = (item: CounterItem) =>
    (Number(item.unitPrice) || 0) * (isTypeC ? 1 : 1 + (Number(item.taxRate) || 0) / 100);

  const submitLabel = tender === 'CC'
    ? (withArca ? 'Facturar en ARCA a cuenta' : 'Emitir a cuenta corriente')
    : (withArca ? 'Cobrar y facturar en ARCA' : 'Cobrar y emitir');

  const selectClass = 'h-10 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-slate-200 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
      {/* ── Izquierda: cliente, buscador e ítems ─────────────────────────── */}
      <div className="space-y-3 min-w-0">
        {lastSale && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-900 dark:text-emerald-200 min-w-0 flex-1">
              <span className="font-semibold">{lastSale.label}</span> por {formatCurrency(lastSale.total, 'ARS')}
              {lastSale.paid ? ' · cobrada' : ''}
              {lastSale.change > 0 && <> · vuelto <span className="font-semibold tabular-nums">{formatCurrency(lastSale.change, 'ARS')}</span></>}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => window.open(`/print/invoice/${lastSale.id}`, '_blank', 'width=420,height=700,scrollbars=yes')}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir ticket
              </button>
              <a
                href={`/invoices/${lastSale.id}`}
                className="text-xs font-medium px-2 py-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              >
                Ver factura
              </a>
              <button type="button" onClick={onDismissLastSale} aria-label="Cerrar aviso" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div id="invoice-meta" className="flex flex-wrap items-start gap-2">
          <div ref={customerRef} className="w-full sm:w-80">
            <CustomerSearchSelect
              customers={customers}
              value={customerId}
              onChange={onCustomerChange}
              placeholder="Consumidor final  ·  F2"
              error={customerError}
            />
          </div>
          <label className="sr-only" htmlFor="counter-type">Tipo de comprobante</label>
          <select id="counter-type" value={type} onChange={(e) => onTypeChange(e.target.value)} className={selectClass}>
            {typeOptions.filter((o) => o.value.startsWith('FACTURA_')).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {warehouses.length > 1 && (
            <>
              <label className="sr-only" htmlFor="counter-warehouse">Depósito</label>
              <select id="counter-warehouse" value={effectiveWarehouseId} onChange={(e) => onWarehouseChange(e.target.value)} className={selectClass}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </>
          )}
        </div>

        {/* Buscador: código de barras, SKU o nombre, con prefijo N* de cantidad. */}
        <div className="relative">
          <label htmlFor="counter-scan" className="sr-only">Escanear o buscar producto</label>
          <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-indigo-500 pointer-events-none" />
          <input
            id="counter-scan"
            ref={scanRef}
            type="text"
            value={scan}
            onChange={(e) => onScanChange(e.target.value)}
            onKeyDown={onScanKeyDown}
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="counter-scan-results"
            placeholder="Escaneá o escribí código / nombre  ·  3*código suma 3"
            className={clsx(
              'block w-full h-16 rounded-xl border-2 pl-14 pr-36 text-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white',
              'placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 transition-colors',
              scanStatus === 'notfound'
                ? 'border-red-400 focus:ring-red-500/15'
                : 'border-indigo-500 focus:ring-indigo-500/15'
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {scanStatus === 'searching' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            <button
              type="button"
              onClick={onOpenCatalog}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 px-2.5 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              <Search className="w-3.5 h-3.5" /> Catálogo <Kbd>F3</Kbd>
            </button>
          </div>
          {scanStatus === 'notfound' && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">No se encontró ningún producto con “{parseQuantityPrefix(scan.trim()).term}”.</p>
          )}
          {results.length > 0 && (
            <ul
              id="counter-scan-results"
              role="listbox"
              className="absolute z-20 left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
            >
              {results.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === activeResult}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveResult(i)}
                    onClick={() => add(p, parseQuantityPrefix(scan.trim()).qty)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left',
                      i === activeResult ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-slate-400 font-mono">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</span>
                    </span>
                    <span className="text-sm tabular-nums text-gray-700 dark:text-slate-300">{formatCurrency(Number(p.price), 'ARS')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lista de lo que se lleva */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[150px_minmax(0,1fr)_120px_130px_40px] gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            <span>Cantidad</span><span>Producto</span><span className="text-right">Precio</span><span className="text-right">Subtotal</span><span />
          </div>

          {visibleRows.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Barcode className="w-8 h-8 mx-auto text-gray-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Escaneá el primer producto o escribí su nombre.</p>
              {itemsError && <p className="mt-1 text-xs text-red-600">{itemsError}</p>}
            </div>
          ) : (
            <ul>
              {visibleRows.map(({ field, index, item }) => {
                const product = findProduct(item.productId);
                const variants = variantsByProduct[item.productId] ?? [];
                const tracked = product?.trackStock !== false;
                const stock = tracked ? stockFor(item.productId, item.variantId ?? null) : null;
                const qty = Number(item.quantity) || 0;
                const isLast = item.productId === lastAddedId;
                return (
                  <li
                    key={field.id}
                    id={`invoice-item-${index}`}
                    className={clsx(
                      'grid grid-cols-[150px_minmax(0,1fr)] md:grid-cols-[150px_minmax(0,1fr)_120px_130px_40px] gap-3 px-4 py-3 items-center border-b border-gray-50 dark:border-slate-700/60 last:border-0',
                      isLast && 'bg-indigo-50/70 dark:bg-indigo-900/20 shadow-[inset_3px_0_0_theme(colors.indigo.500)]'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="Restar uno" onClick={() => (qty <= 1 ? onRemoveItem(index) : onQuantityChange(index, qty - 1))}
                        className="w-9 h-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-600">
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Cantidad"
                        value={item.quantity}
                        onChange={(e) => onQuantityChange(index, Number(e.target.value))}
                        className="w-12 h-9 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-slate-600 bg-transparent text-center text-base font-semibold tabular-nums text-gray-900 dark:text-white focus:outline-none focus:border-indigo-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button type="button" aria-label="Sumar uno" onClick={() => onQuantityChange(index, qty + 1)}
                        className="w-9 h-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-600">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">{product?.name ?? 'Producto'}</p>
                      <p className="text-xs font-mono text-gray-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                        <span>{product?.barcode || product?.sku}</span>
                        {stock?.state === 'ok' && (
                          <span className={clsx(stock.available - qty < 0 ? 'text-red-600 dark:text-red-400' : stock.available - qty <= 2 ? 'text-amber-600 dark:text-amber-400' : '')}>
                            · Stock {formatNumber(stock.available, 0)}
                          </span>
                        )}
                      </p>
                      {variants.length > 0 && (
                        <select
                          aria-label="Variante"
                          value={item.variantId ?? ''}
                          onChange={(e) => onVariantChange(index, e.target.value)}
                          className="mt-1 h-8 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs px-2 text-gray-700 dark:text-slate-200"
                        >
                          <option value="">Sin variante</option>
                          {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      )}
                      {renderItemDetail?.(index)}
                    </div>

                    <span className="hidden md:block text-right text-sm tabular-nums text-gray-600 dark:text-slate-300">
                      {formatCurrency(finalUnitPrice(item), 'ARS')}
                    </span>
                    <span className="col-start-2 md:col-start-auto text-right text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(calcItemAmounts(index).total, 'ARS')}
                    </span>
                    <button type="button" aria-label="Quitar ítem" onClick={() => onRemoveItem(index)}
                      className="hidden md:flex w-9 h-9 items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="hidden lg:flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-gray-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><Kbd>F1</Kbd> Buscar</span>
          <span className="flex items-center gap-1.5"><Kbd>F2</Kbd> Cliente</span>
          <span className="flex items-center gap-1.5"><Kbd>F3</Kbd> Catálogo</span>
          <span className="flex items-center gap-1.5"><Kbd>F4</Kbd> Descuento</span>
          <span className="flex items-center gap-1.5"><Kbd>+</Kbd><Kbd>−</Kbd> Cantidad del último</span>
          <span className="flex items-center gap-1.5"><Kbd>F8</Kbd> Medio de pago</span>
          <span className="flex items-center gap-1.5"><Kbd>F9</Kbd> Cobrar</span>
          <span className="flex items-center gap-1.5 ml-auto"><Kbd>Esc</Kbd> Salir</span>
        </div>
      </div>

      {/* ── Derecha: total y cobro ───────────────────────────────────────── */}
      <aside className="xl:sticky xl:top-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            Total · {formatNumber(unitsCount, 0)} {unitsCount === 1 ? 'unidad' : 'unidades'}
          </p>
          <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums text-gray-900 dark:text-white">
            {formatCurrency(grandTotal, 'ARS')}
          </p>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400 tabular-nums">
            {isTypeC
              ? 'Factura C: sin IVA discriminado'
              : `Neto ${formatCurrency(totals.subtotal - totals.discountAmount, 'ARS')} · IVA ${formatCurrency(totals.taxAmount, 'ARS')}`}
            {totals.discountAmount > 0 && ` · Descuento −${formatCurrency(totals.discountAmount, 'ARS')}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="counter-discount" className="text-sm text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
            Descuento <Kbd>F4</Kbd>
          </label>
          <input
            id="counter-discount"
            ref={discountRef}
            type="number"
            min="0"
            step="any"
            value={discountValue || ''}
            placeholder="0"
            onChange={(e) => onDiscountChange(discountType, Math.max(0, Number(e.target.value) || 0))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusScan(); } }}
            className="w-24 h-9 ml-auto rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-right text-sm tabular-nums text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <div className="flex rounded-lg border border-gray-300 dark:border-slate-600 p-0.5">
            {(['%', '$'] as const).map((t) => (
              <button key={t} type="button" onClick={() => onDiscountChange(t, discountValue)}
                className={clsx('w-8 h-7 text-xs font-semibold rounded-md', discountType === t ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-slate-400')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
            Medio de pago <Kbd>F8</Kbd>
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {TENDERS.map(({ value, label, icon: Icon }) => {
              const disabled = value === 'CC' && !customerId;
              const active = tender === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  title={disabled ? 'La cuenta corriente requiere elegir un cliente' : undefined}
                  onClick={() => chooseTender(value)}
                  className={clsx(
                    'h-16 rounded-xl flex flex-col items-center justify-center gap-1 text-[13px] transition-colors',
                    active
                      ? 'border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : disabled
                        ? 'border border-dashed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600 cursor-not-allowed'
                        : 'border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 font-medium'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {tender === 'CASH' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="counter-received" className="block mb-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300">Recibido</label>
                <input
                  id="counter-received"
                  type="text"
                  inputMode="decimal"
                  value={payment.received}
                  placeholder={formatNumber(grandTotal, 2)}
                  onChange={(e) => onPaymentChange({ received: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }}
                  className="w-full h-12 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-xl font-semibold tabular-nums text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300">Vuelto</p>
                <p className={clsx(
                  'h-12 rounded-xl px-3 flex items-center text-xl font-semibold tabular-nums',
                  change < 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                )}>
                  {change < 0 ? `Faltan ${formatCurrency(-change, 'ARS')}` : formatCurrency(change, 'ARS')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onPaymentChange({ received: '' })}
                className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100">
                Justo
              </button>
              {cashSuggestions(grandTotal).map((amount) => (
                <button key={amount} type="button" onClick={() => onPaymentChange({ received: String(amount) })}
                  className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm tabular-nums text-gray-700 dark:text-slate-200 hover:bg-gray-100">
                  {formatCurrency(amount, 'ARS').replace(/,00$/, '')}
                </button>
              ))}
            </div>
            {cashRegisters.length > 1 && (
              <select aria-label="Caja" value={payment.cashRegisterId} onChange={(e) => onPaymentChange({ cashRegisterId: e.target.value })} className={clsx(selectClass, 'w-full')}>
                {cashRegisters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {cashRegisters.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">No hay cajas abiertas: el cobro en efectivo no se va a poder registrar.</p>
            )}
          </div>
        )}

        {tender === 'BANK_TRANSFER' && (
          <div className="space-y-2">
            <select aria-label="Cuenta bancaria" value={payment.bankAccountId} onChange={(e) => onPaymentChange({ bankAccountId: e.target.value })} className={clsx(selectClass, 'w-full')}>
              {bankAccounts.length === 0 && <option value="">Sin cuentas bancarias</option>}
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.bank}</option>)}
            </select>
            <input type="text" aria-label="Referencia" placeholder="N° de operación (opcional)" value={payment.reference}
              onChange={(e) => onPaymentChange({ reference: e.target.value })} className={clsx(selectClass, 'w-full')} />
          </div>
        )}

        {tender === 'MERCADO_PAGO' && (
          <input type="text" aria-label="Referencia" placeholder="N° de operación de Mercado Pago (opcional)" value={payment.reference}
            onChange={(e) => onPaymentChange({ reference: e.target.value })} className={clsx(selectClass, 'w-full')} />
        )}

        {(tender === 'CARD' || tender === 'CHECK') && (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Al confirmar se abre el cobro para completar {tender === 'CARD' ? 'la tarjeta, las cuotas y el recargo' : 'los datos del cheque'}.
          </p>
        )}

        {tender === 'CC' && (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Queda en la cuenta corriente de <span className="font-semibold text-gray-700 dark:text-slate-200">{selectedCustomer?.name}</span>: no se registra cobro ahora.
          </p>
        )}

        {needsCustomerId && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Supera {formatCurrency(cashIdThreshold, 'ARS')}: ARCA exige identificar al comprador (F2).
          </p>
        )}

        <div className="space-y-2.5 pt-1">
          <label className={clsx('flex items-center gap-2 text-sm', arcaDisabledReason ? 'text-gray-400 dark:text-slate-500' : 'text-gray-700 dark:text-slate-300')} title={arcaDisabledReason}>
            <input
              type="checkbox"
              checked={withArca}
              disabled={!!arcaDisabledReason}
              onChange={(e) => onWithArcaChange(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500"
            />
            Pedir CAE a ARCA{arcaDisabledReason ? ` (${arcaDisabledReason.toLowerCase()})` : ''}
          </label>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading}
            className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-lg font-semibold flex items-center justify-center gap-3 transition-colors"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {submitLabel}
            <Kbd className="bg-white/15 border-white/30 text-white dark:bg-white/15 dark:border-white/30 dark:text-white">F9</Kbd>
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onSaveDraft} disabled={isLoading}
              className="flex-1 h-10 rounded-xl border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
              Guardar borrador
            </button>
            <button type="button" onClick={onCancel}
              className="h-10 px-4 rounded-xl text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700">
              Cancelar
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
