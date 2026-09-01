import { useState } from 'react';
import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import {
  AlertTriangle, ChevronDown, ChevronUp, ClipboardList, Info, Minus, Plus, Search, Trash2,
} from 'lucide-react';
import { Input, Select, Textarea } from '../../components/ui';
import { CustomerSearchSelect, ProductSearchSelect } from '../../components/shared';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import type { Customer, Invoice, Product, Warehouse } from '../../types';
import type { ProductVariant } from '../../types/product-variant.types';

/**
 * Layout "carga rápida" del formulario de factura (opción B del rediseño).
 *
 * La apuesta es que en la mayoría de las facturas los datos del comprobante ya
 * vienen bien por defecto: se pliegan en una línea y la pantalla queda para el
 * buscador de producto y la lista de ítems. Precio, IVA y descuento no
 * desaparecen — se abren en la propia fila, sin modal y sin perder el foco —, y
 * para las facturas donde hay que tocar todos los precios el interruptor de
 * "precios editables" pasa la lista a columnas.
 *
 * No tiene estado de negocio propio: todo lo recibe de InvoiceFormPage, que
 * sigue siendo el dueño del formulario, los cálculos y el submit.
 */

export interface FastLayoutItem {
  productId: string;
  variantId?: string | null;
  quantity: number | string;
  unitPrice: number | string;
  discountPct: number | string;
  taxRate: number | string;
}

export interface InvoiceFastLayoutProps {
  // ── Comprobante ──
  customers: Customer[];
  customerId: string;
  selectedCustomer?: Customer;
  onCustomerChange: (id: string, picked?: Customer) => void;
  customerError?: string;
  type: string;
  typeOptions: Array<{ value: string; label: string }>;
  onTypeChange: (value: string) => void;
  typeError?: string;
  isNcNd: boolean;
  isTypeC: boolean;
  originInvoices: Invoice[];
  originInvoiceId?: string | null;
  onOriginChange: (id: string) => void;
  originError?: string;
  paymentTermsValue: string;
  paymentTermsOptions: Array<{ value: string; label: string }>;
  onPaymentTermsChange: (value: string) => void;
  saleCondition: string;
  invoiceDate?: string;
  dueDate?: string | null;
  isService: boolean;
  stockBehavior: 'DISCOUNT' | 'RESERVE';
  onStockBehaviorChange: (next: 'DISCOUNT' | 'RESERVE') => void;
  warehouses: Warehouse[];
  warehouseId: string;
  effectiveWarehouseId: string;
  onWarehouseChange: (id: string) => void;
  needsCustomerId: boolean;
  cashIdThreshold: number;
  dateAdvanceWarning: boolean;
  advanceDaysLimit: number;

  // ── Ítems ──
  register: (name: string) => UseFormRegisterReturn;
  products: Product[];
  fields: Array<{ id: string }>;
  items: FastLayoutItem[];
  itemErrors: Array<{ productId?: { message?: string }; quantity?: { message?: string }; unitPrice?: { message?: string } } | undefined>;
  itemsError?: string;
  findProduct: (productId: string) => Product | undefined;
  variantsByProduct: Record<string, ProductVariant[]>;
  stockFor: (productId: string, variantId: string | null) =>
    { state: 'loading' | 'error' } | { state: 'ok'; available: number };
  calcItemAmounts: (index: number) => { base: number; discount: number; net: number; tax: number; total: number };
  itemDiscountPct: (index: number) => number;
  onProductChange: (index: number, productId: string, picked?: Product) => void;
  onVariantChange: (index: number, variantId: string) => void;
  onAddProduct: (product: Product, quantity?: number) => void;
  onQuantityChange: (index: number, quantity: number) => void;
  onItemDiscountChange: (index: number, pct: number) => void;
  onRemoveItem: (index: number) => void;
  onOpenCatalog: () => void;
  onOpenImport?: () => void;
  barcodeSlot?: ReactNode;

  // ── Descuento global y totales ──
  discountType: '%' | '$';
  discountValue: number;
  hasPerItemDiscount: boolean;
  onGlobalDiscountChange: (type: '%' | '$', value: number) => void;
  totals: { subtotal: number; discountAmount: number; taxAmount: number };
  grandTotal: number;

  // ── Modo precios editables (preferencia por usuario) ──
  priceEditMode: boolean;
  onPriceEditModeChange: (next: boolean) => void;

  // ── Pie ──
  /** Botones de confirmación, que siguen siendo del formulario. */
  actions: ReactNode;
  /** Casilla "registrar pago al crear", cuando corresponde. */
  paymentToggle?: ReactNode;
}

const chipClass =
  'inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-full px-3 py-1';
const markedChipClass =
  'inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1';

export default function InvoiceFastLayout(props: InvoiceFastLayoutProps) {
  const {
    customers, customerId, selectedCustomer, onCustomerChange, customerError,
    type, typeOptions, onTypeChange, typeError, isNcNd, isTypeC,
    originInvoices, originInvoiceId, onOriginChange, originError,
    paymentTermsValue, paymentTermsOptions, onPaymentTermsChange, saleCondition,
    invoiceDate, isService, stockBehavior, onStockBehaviorChange,
    warehouses, warehouseId, effectiveWarehouseId, onWarehouseChange,
    needsCustomerId, cashIdThreshold, dateAdvanceWarning, advanceDaysLimit,
    register, products, fields, items, itemErrors, itemsError,
    findProduct, variantsByProduct, stockFor, calcItemAmounts, itemDiscountPct,
    onProductChange, onVariantChange, onAddProduct, onQuantityChange,
    onItemDiscountChange, onRemoveItem, onOpenCatalog, onOpenImport, barcodeSlot,
    discountType, discountValue, hasPerItemDiscount, onGlobalDiscountChange,
    totals, grandTotal, priceEditMode, onPriceEditModeChange, actions, paymentToggle,
  } = props;

  // Lo que el usuario decidió explícitamente sobre el panel del comprobante
  // (null = todavía no lo tocó para este cliente: manda el criterio automático).
  const [metaOverride, setMetaOverride] = useState<boolean | null>(null);
  // Cambiar de cliente devuelve la decisión al criterio automático: el cliente
  // nuevo puede traer un aviso que no corresponde dejar plegado.
  const [lastCustomerId, setLastCustomerId] = useState(customerId);
  if (lastCustomerId !== customerId) {
    setLastCustomerId(customerId);
    setMetaOverride(null);
  }
  // Abierto mientras no haya cliente — sin cliente no hay comprobante que
  // plegar — y también cuando quedó un aviso fiscal que atender.
  const metaOpen = metaOverride ?? (!customerId || needsCustomerId);
  // Una sola fila abierta a la vez; abrir otra cierra la anterior.
  const [openRow, setOpenRow] = useState<number | null>(null);

  const typeLabel = typeOptions.find((o) => o.value === type)?.label ?? type;
  const warehouseName = warehouses.find((w) => w.id === effectiveWarehouseId)?.name;
  const today = new Date().toISOString().substring(0, 10);
  const dateIsToday = !invoiceDate || invoiceDate === today;
  const stockWarningCount = items.reduce((acc, item, index) => {
    if (isNcNd || !item.productId) return acc;
    if (findProduct(item.productId)?.trackStock === false) return acc;
    const stock = stockFor(item.productId, item.variantId ?? null);
    if (stock.state !== 'ok') return acc;
    return (Number(items[index]?.quantity) || 0) > stock.available ? acc + 1 : acc;
  }, 0);

  const unitCount = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const filledCount = items.filter((item) => item.productId).length;

  const renderStockBadge = (index: number) => {
    const item = items[index];
    if (isNcNd || !item?.productId) return null;
    if (findProduct(item.productId)?.trackStock === false) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-full px-2 py-0.5">
          No descuenta stock
        </span>
      );
    }
    const stock = stockFor(item.productId, item.variantId ?? null);
    if (stock.state !== 'ok') {
      return (
        <span className="text-[11px] text-gray-300 dark:text-slate-600">
          {stock.state === 'loading' ? 'Consultando stock…' : 'Stock no disponible'}
        </span>
      );
    }
    const requested = Number(item.quantity) || 0;
    const short = requested > stock.available;
    return (
      <span
        title={`Disponible en ${warehouseName ?? 'el depósito'} (cantidad menos reservado)`}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border leading-tight ${
          short
            ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800'
            : stock.available <= 0
              ? 'text-gray-500 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600'
              : 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800'
        }`}
      >
        {short && <AlertTriangle className="w-3 h-3" />}
        {short
          ? `Faltan ${formatNumber(requested - stock.available, 0)} · ${
              stock.available <= 0 ? 'sin stock' : `disp. ${formatNumber(stock.available, 0)}`
            }`
          : stock.available <= 0
            ? 'Sin stock'
            : `Disp. ${formatNumber(stock.available, Number.isInteger(stock.available) ? 0 : 2)}`}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* ── Línea de comprobante ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setMetaOverride(!metaOpen)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors"
        >
          <span className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-sm font-bold shrink-0">
            {(selectedCustomer?.name ?? '?').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">
              {selectedCustomer?.name ?? 'Sin cliente seleccionado'}
            </span>
            <span className="block text-xs text-gray-500 dark:text-slate-400 truncate">
              {typeLabel}
              {paymentTermsValue ? ` · ${paymentTermsOptions.find((o) => o.value === paymentTermsValue)?.label ?? paymentTermsValue}` : ''}
              {warehouseName && !isNcNd ? ` · depósito ${warehouseName}` : ''}
            </span>
          </span>
          <span className="hidden md:flex items-center gap-2 shrink-0">
            {stockBehavior === 'RESERVE' && !isNcNd && <span className={markedChipClass}>Reserva stock</span>}
            {isService && <span className={markedChipClass}>Servicios</span>}
            {!dateIsToday && <span className={markedChipClass}>{invoiceDate}</span>}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 shrink-0">
            {metaOpen ? 'Cerrar' : 'Cambiar datos del comprobante'}
            {metaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {metaOpen && (
          <div id="invoice-meta" className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <CustomerSearchSelect
                  customers={customers}
                  value={customerId}
                  onChange={onCustomerChange}
                  label="Cliente *"
                  error={customerError}
                  serverSearch
                  searchParams={{ isActive: true }}
                />
              </div>
              <Select
                label="Tipo de comprobante"
                options={typeOptions}
                value={type}
                onChange={onTypeChange}
                error={typeError}
              />
              <Select
                label="Condición de venta"
                options={paymentTermsOptions}
                value={paymentTermsValue}
                onChange={onPaymentTermsChange}
              />
            </div>

            {isNcNd && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Comprobante de origen *
                </label>
                <select
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white dark:bg-slate-700 dark:text-slate-200 ${
                    originError ? 'border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-900/10' : 'border-gray-300 dark:border-slate-600'
                  }`}
                  value={originInvoiceId ?? ''}
                  onChange={(e) => onOriginChange(e.target.value)}
                >
                  <option value="">— Seleccionar factura —</option>
                  {originInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.number} · {inv.customer?.name ?? ''} · ${Number(inv.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
                {!customerId && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Seleccioná un cliente primero</p>}
                {customerId && originInvoices.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Sin facturas disponibles para este cliente</p>
                )}
                {originError && <p className="mt-1 text-xs text-red-500">{originError}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input
                label="Fecha de emisión"
                type="date"
                readOnly
                title="La fecha de emisión no es editable"
                className="bg-gray-50 dark:bg-slate-800 cursor-not-allowed text-gray-500 dark:text-slate-400"
                {...register('date')}
              />
              <Input label="Fecha de vencimiento" type="date" {...register('dueDate')} />
              {!isNcNd && warehouses.length > 1 && (
                <Select
                  label="Depósito de stock"
                  options={warehouses.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} (por defecto)` : w.name }))}
                  value={warehouseId}
                  onChange={onWarehouseChange}
                />
              )}
            </div>

            {needsCustomerId && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-400">
                  Ventas en efectivo superiores a ${cashIdThreshold.toLocaleString('es-AR')} requieren identificar al cliente (CUIT/DNI). El cliente seleccionado no tiene CUIT registrado.
                </p>
              </div>
            )}

            {dateAdvanceWarning && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-400">
                  La fecha seleccionada supera el límite de anticipación permitido ({advanceDaysLimit} días para {isService ? 'servicios' : 'bienes'}).
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1 border-t border-dashed border-gray-200 dark:border-slate-700">
              <label className="flex items-center gap-2.5 cursor-pointer select-none mt-3">
                <input type="checkbox" className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500" {...register('isService')} />
                <span className="text-sm text-gray-700 dark:text-slate-300">Comprobante de servicios</span>
                <span title="Servicios permiten hasta 10 días de anticipación; bienes hasta 5 días.">
                  <Info className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
                </span>
              </label>
              {!isNcNd && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none mt-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
                    checked={stockBehavior === 'DISCOUNT'}
                    onChange={(e) => onStockBehaviorChange(e.target.checked ? 'DISCOUNT' : 'RESERVE')}
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-300">Descontar stock al crear</span>
                  <span title={stockBehavior === 'DISCOUNT'
                    ? 'El stock se descuenta inmediatamente al crear la factura.'
                    : 'El stock se reserva al crear. Se descuenta al confirmar la entrega por remito.'}>
                    <Info className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
                  </span>
                </label>
              )}
            </div>

            <Textarea label="Notas" placeholder="Condiciones, aclaraciones..." rows={2} {...register('notes')} />
          </div>
        )}
      </div>

      {/* ── Buscador protagonista ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex-1 min-w-0">
            <ProductSearchSelect
              products={products}
              value=""
              onChange={(_id, picked) => { if (picked) onAddProduct(picked, 1); }}
              placeholder="Buscar producto y agregar…"
              serverSearch
              searchParams={{ isActive: true }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {barcodeSlot}
            <button
              type="button"
              onClick={onOpenCatalog}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2.5 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              Catálogo
            </button>
            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2.5 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Importar desde OP
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Ítems ────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-700">
          <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            Ítems · {filledCount}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">
            {formatNumber(unitCount, Number.isInteger(unitCount) ? 0 : 2)} unidades
          </span>
          <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-gray-600 dark:text-slate-300">Precios editables</span>
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
              checked={priceEditMode}
              onChange={(e) => onPriceEditModeChange(e.target.checked)}
            />
          </label>
        </div>

        {priceEditMode ? (
          <div className="px-4 py-3">
            <div className={`hidden md:grid ${isTypeC ? 'grid-cols-[3fr_72px_104px_72px_104px_32px]' : 'grid-cols-[3fr_72px_104px_60px_72px_104px_32px]'} gap-3 pb-2 border-b border-gray-100 dark:border-slate-700`}>
              {(isTypeC
                ? ['Producto', 'Cant.', 'Precio unit.', 'Desc. %', 'Total', '']
                : ['Producto', 'Cant.', 'Precio unit.', 'IVA %', 'Desc. %', 'Total', '']
              ).map((h, i) => (
                <span key={`${h}-${i}`} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  id={`invoice-item-${index}`}
                  className={`grid grid-cols-1 ${isTypeC ? 'md:grid-cols-[3fr_72px_104px_72px_104px_32px]' : 'md:grid-cols-[3fr_72px_104px_60px_72px_104px_32px]'} gap-3 items-center py-3`}
                >
                  <div className="min-w-0">
                    <ProductSearchSelect
                      products={products}
                      value={items[index]?.productId || ''}
                      onChange={(value, picked) => onProductChange(index, value, picked)}
                      error={itemErrors[index]?.productId?.message}
                      serverSearch
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">{renderStockBadge(index)}</div>
                  </div>
                  <Input type="number" step="1" min="1" {...register(`items.${index}.quantity`)} error={itemErrors[index]?.quantity?.message} />
                  <Input type="number" step="0.01" min="0" {...register(`items.${index}.unitPrice`)} error={itemErrors[index]?.unitPrice?.message} />
                  {!isTypeC && <Input type="number" step="0.01" min="0" max="100" {...register(`items.${index}.taxRate`)} />}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={itemDiscountPct(index)}
                    onChange={(e) => onItemDiscountChange(index, Number(e.target.value) || 0)}
                  />
                  <div className="text-right text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(calcItemAmounts(index).total, 'ARS')}
                  </div>
                  <div className="flex justify-end">
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveItem(index)}
                        className="p-1.5 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {fields.map((field, index) => {
              const item = items[index];
              const product = item?.productId ? findProduct(item.productId) : undefined;
              const variants = item?.productId ? (variantsByProduct[item.productId] ?? []) : [];
              const amounts = calcItemAmounts(index);
              const isOpen = openRow === index;

              // Fila todavía sin producto: se resuelve con el buscador de la
              // propia fila en vez de mostrar una fila fantasma.
              if (!item?.productId) {
                return (
                  <div key={field.id} id={`invoice-item-${index}`} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <ProductSearchSelect
                          products={products}
                          value=""
                          onChange={(value, picked) => onProductChange(index, value, picked)}
                          error={itemErrors[index]?.productId?.message}
                          placeholder="Elegí un producto para esta línea…"
                          serverSearch
                        />
                      </div>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveItem(index)}
                          className="p-2 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={field.id}
                  id={`invoice-item-${index}`}
                  className={isOpen ? 'bg-indigo-50/40 dark:bg-indigo-900/10 border-l-[3px] border-l-indigo-500' : ''}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && isOpen) { e.stopPropagation(); setOpenRow(null); }
                  }}
                >
                  <div className="flex items-center gap-4 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpenRow(isOpen ? null : index)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {product?.name ?? 'Producto'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 tabular-nums truncate">
                        {product?.sku ? `${product.sku} · ` : ''}
                        {formatCurrency(Number(item.unitPrice) || 0, 'ARS')} c/u
                        {!isTypeC ? ` · IVA ${formatNumber(Number(item.taxRate) || 0, 0)}%` : ''}
                        {itemDiscountPct(index) > 0 ? ` · -${formatNumber(itemDiscountPct(index), 2)}%` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">{renderStockBadge(index)}</div>
                    </button>

                    <div className="flex items-center border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden shrink-0">
                      <button
                        type="button"
                        aria-label="Restar uno"
                        onClick={() => onQuantityChange(index, Math.max(1, (Number(item.quantity) || 1) - 1))}
                        className="w-11 h-11 flex items-center justify-center text-gray-500 dark:text-slate-300 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="w-16 h-11 text-center text-sm font-semibold tabular-nums bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                        {...register(`items.${index}.quantity`)}
                      />
                      <button
                        type="button"
                        aria-label="Sumar uno"
                        onClick={() => onQuantityChange(index, (Number(item.quantity) || 0) + 1)}
                        className="w-11 h-11 flex items-center justify-center text-gray-500 dark:text-slate-300 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="w-32 text-right text-sm font-bold text-gray-900 dark:text-white tabular-nums shrink-0">
                      {formatCurrency(amounts.total, 'ARS')}
                    </span>

                    <button
                      type="button"
                      aria-label={isOpen ? 'Cerrar edición de la línea' : 'Editar precio, IVA y descuento'}
                      onClick={() => setOpenRow(isOpen ? null : index)}
                      className="p-2 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors shrink-0"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        aria-label="Quitar el ítem"
                        onClick={() => { if (openRow === index) setOpenRow(null); onRemoveItem(index); }}
                        className="p-2 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-dashed border-indigo-200 dark:border-indigo-900">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
                        <Input
                          label="Precio unit."
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus
                          {...register(`items.${index}.unitPrice`)}
                          error={itemErrors[index]?.unitPrice?.message}
                        />
                        {!isTypeC && (
                          <Input label="IVA %" type="number" step="0.01" min="0" max="100" {...register(`items.${index}.taxRate`)} />
                        )}
                        <Input
                          label="Descuento %"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={itemDiscountPct(index)}
                          onChange={(e) => onItemDiscountChange(index, Number(e.target.value) || 0)}
                        />
                        {variants.length > 0 && (
                          <Select
                            label="Variante"
                            options={[{ value: '', label: '— Sin variante —' }, ...variants.map((v) => ({ value: v.id, label: `${v.name} (${v.sku})` }))]}
                            value={item.variantId ?? ''}
                            onChange={(value) => onVariantChange(index, value)}
                          />
                        )}
                        <div className="text-right">
                          <span className="block text-xs text-gray-400 dark:text-slate-500">Neto de la línea</span>
                          <span className="block text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                            {formatCurrency(amounts.total, 'ARS')}
                          </span>
                          {amounts.discount > 0 && (
                            <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                              -{formatCurrency(amounts.discount, 'ARS')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-[11px] text-gray-400 dark:text-slate-500">
                          Tab recorre los campos · Esc cierra la fila
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpenRow(null)}
                          className="ml-auto text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        >
                          Listo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {itemsError && <p className="px-4 pb-3 text-xs text-red-500">{itemsError}</p>}
      </div>

      {/* ── Descuento global ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Descuento global</span>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-semibold">
          <button
            type="button"
            onClick={() => onGlobalDiscountChange('%', discountValue)}
            className={`px-3 py-2 transition-colors ${discountType === '%' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}
          >%</button>
          <button
            type="button"
            onClick={() => onGlobalDiscountChange('$', discountValue)}
            className={`px-3 py-2 border-l border-gray-200 dark:border-slate-600 transition-colors ${discountType === '$' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}
          >$</button>
        </div>
        <input
          type="number"
          min={0}
          max={discountType === '%' ? 100 : undefined}
          step={0.01}
          value={discountValue || ''}
          onChange={(e) => onGlobalDiscountChange(discountType, Number(e.target.value) || 0)}
          placeholder="0"
          className="w-28 px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white tabular-nums outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        {hasPerItemDiscount ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Este comprobante tiene descuentos distintos por línea. Un valor acá los unifica.
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-slate-500">Se reparte por ítem</span>
        )}
        {paymentToggle && <div className="ml-auto">{paymentToggle}</div>}
      </div>

      {/* ── Pie fijo ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 md:mx-0 bg-white dark:bg-slate-800 border-t md:border border-gray-200 dark:border-slate-700 md:rounded-xl shadow-[0_-1px_3px_rgba(15,23,42,0.06)] px-4 py-3 z-10">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {stockWarningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-full px-3 py-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Stock insuficiente en {stockWarningCount} {stockWarningCount === 1 ? 'ítem' : 'ítems'}
            </span>
          )}
          {saleCondition === 'CUENTA_CORRIENTE' && (
            <span className={chipClass}>Suma a la cuenta corriente del cliente</span>
          )}

          <div className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-xs text-gray-500 dark:text-slate-400">
              Subtotal <span className="ml-1 font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(totals.subtotal, 'ARS')}</span>
            </span>
            {totals.discountAmount > 0 && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Descuento <span className="ml-1 font-semibold tabular-nums">-{formatCurrency(totals.discountAmount, 'ARS')}</span>
              </span>
            )}
            {!isTypeC && (
              <span className="text-xs text-gray-500 dark:text-slate-400">
                IVA <span className="ml-1 font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(totals.taxAmount, 'ARS')}</span>
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Total <span className="ml-1.5 text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(grandTotal, 'ARS')}</span>
            </span>
          </div>

          <div className="w-full md:w-auto md:ml-4">{actions}</div>
        </div>
      </div>
    </div>
  );
}
