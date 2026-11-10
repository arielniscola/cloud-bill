import { useState, useEffect, useMemo, useRef } from 'react';
import SupplierSearchSelect from './SupplierSearchSelect';
import { X, ArrowLeft, Receipt, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle, Package } from 'lucide-react';
import { Button } from '../ui';
import ProductPickerModal from './ProductPickerModal';
import { productCostIn } from '../../utils/productCost';
import { PurchaseCostReview, type CostCandidate } from './PurchaseCostReview';
import ProvinciaSelect from './ProvinciaSelect';
import { formatCurrency } from '../../utils/formatters';
import { purchaseInvoicesService, productsService } from '../../services';
import type {
  PurchaseInvoice,
  CreatePurchaseInvoiceDTO,
  CreatePurchaseInvoiceItemDTO,
  CreatePurchaseInvoiceTributoDTO,
  TributoType,
  Product,
} from '../../types';

// Fila de ítem en el formulario. `productId` autocompleta descripción/precio/IVA
// y se guarda con la línea: al guardar se ofrece actualizar el costo del producto.
type PurchaseInvoiceItemRow = CreatePurchaseInvoiceItemDTO;

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

const TRIBUTO_TYPE_OPTIONS: { value: TributoType; label: string }[] = [
  { value: 'PERCEPCION_IVA',    label: 'Percepción IVA' },
  { value: 'PERCEPCION_IIBB',   label: 'Percepción IIBB' },
  { value: 'IMPUESTOS_INTERNOS', label: 'Imp. internos' },
  { value: 'OTRO',              label: 'Otro tributo' },
];

// ── Empty state ───────────────────────────────────────────────────────────────

const EMPTY_FORM: Omit<CreatePurchaseInvoiceDTO, 'items'> = {
  number:         '',
  type:           'FACTURA_A',
  subtotal:       0,
  taxRate:        21,
  taxAmount:      0,
  discountPct:    0,
  discountAmount: 0,
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
  discountPct: 0,
  taxRate:     21,
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
  // 'page': se renderiza dentro de la página /purchase-invoices/new|:id/edit
  // (sin overlay; Escape no sale de la página).
  variant?: 'modal' | 'page';
}

const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'ARS — Peso' },
  { value: 'USD', label: 'USD — Dólar' },
];

const todayISO = () => new Date().toISOString().split('T')[0];

// Completa con ceros a la izquierda "5-8899" → "00005-00008899" al perder el foco.
// Si no matchea el patrón "dígitos-dígitos" se deja el valor tal cual escribió el usuario.
const formatInvoiceNumberInput = (raw: string): string => {
  const parts = raw.trim().split('-');
  if (parts.length !== 2) return raw.trim();
  const [left, right] = parts;
  if (!/^\d{1,5}$/.test(left) || !/^\d{1,8}$/.test(right)) return raw.trim();
  return `${left.padStart(5, '0')}-${right.padStart(8, '0')}`;
};

// ── Component ────────────────────────────────────────────────────────────────

export function AddPurchaseInvoiceModal({
  isOpen, purchaseId, currency, existing, onClose, onSave, isLoading,
  standalone = false, suppliers = [], fromRemito = null, variant = 'modal',
}: Props) {
  const isPage = variant === 'page';
  const [supplierId,    setSupplierId]    = useState('');
  const [currencyState, setCurrencyState] = useState(currency);
  const [saleCondition, setSaleCondition] = useState<'CONTADO' | 'CUENTA_CORRIENTE'>('CONTADO');
  const [date,          setDate]          = useState(todayISO());
  const [exchangeRate,  setExchangeRate]  = useState(1);
  const [rateLoading,   setRateLoading]   = useState(false);
  const [remitoLink,    setRemitoLink]    = useState<{ id: string; number: string } | null>(null);

  // Cotización del día (Banco Nación, venta) — editable
  const fetchDayRate = async (): Promise<number | null> => {
    setRateLoading(true);
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
      const data = await res.json();
      if (data?.venta) {
        setExchangeRate(Number(data.venta));
        return Number(data.venta);
      }
    } catch {
      /* sin conexión: queda el valor actual, editable a mano */
    } finally {
      setRateLoading(false);
    }
    return null;
  };
  const [originInvoiceId, setOriginInvoiceId] = useState<string>('');
  const [originOptions,   setOriginOptions]   = useState<PurchaseInvoice[]>([]);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [items,       setItems]       = useState<PurchaseInvoiceItemRow[]>([]);
  const [products,    setProducts]    = useState<Product[]>([]);
  const [tributos,    setTributos]    = useState<CreatePurchaseInvoiceTributoDTO[]>([]);
  const [showItems,   setShowItems]   = useState(false);
  // Buscador de productos: 'multi' agrega varias líneas; un número edita esa fila.
  const [picker,      setPicker]      = useState<null | 'multi' | number>(null);
  // Productos ya elegidos, para poder rotular la fila.
  const [productById, setProductById] = useState<Record<string, Product>>({});
  // Paso previo al guardado: productos cuyo costo cambia con lo facturado.
  const [costReview, setCostReview] = useState<CostCandidate[] | null>(null);
  const [checkingCosts, setCheckingCosts] = useState(false);
  const [showTribs,   setShowTribs]   = useState(false);
  const [showExtras,  setShowExtras]  = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | 'close' | 'discard'>(null);

  // ── Descuentos ──────────────────────────────────────────────────────────
  // Se cargan de dos formas y son excluyentes: uno global sobre el total
  // (en % o en $) o uno propio por línea. Como el backend guarda el descuento
  // como un porcentaje POR ÍTEM, el global se expresa como el % equivalente
  // sobre el subtotal — así la columna "Total" de cada línea cierra con el
  // total del comprobante. En ambos casos el descuento reduce la BASE
  // IMPONIBLE: el IVA se calcula sobre el neto ya descontado.
  const [discountType,  setDiscountType]  = useState<'%' | '$'>('%');
  const [discountValue, setDiscountValue] = useState(0);
  const [hasPerItemDiscount, setHasPerItemDiscount] = useState(false);
  // Neto gravado ANTES de descuento, para la carga manual (sin ítems).
  const [manualBase, setManualBase] = useState(0);

  // Borrador (solo factura nueva): se persiste en localStorage y se restaura al reabrir.
  const isDraftMode = !existing && !fromRemito;
  const draftKey = `pi-draft:${standalone ? 'standalone' : `purchase:${purchaseId ?? 'none'}`}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readDraft = (): any | null => {
    try { const raw = localStorage.getItem(draftKey); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  };
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* noop */ } };
  // Evita que el primer render tras hidratar pise el borrador con estado vacío.
  const hydratingRef = useRef(false);

  // Reset / populate standalone header fields when opening
  useEffect(() => {
    if (!isOpen) return;
    hydratingRef.current = true;
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
      const draft = readDraft();
      setSupplierId(draft?.supplierId ?? '');
      setCurrencyState(draft?.currencyState ?? currency);
      setSaleCondition(draft?.saleCondition ?? 'CONTADO');
      setDate(draft?.date ?? todayISO());
      setExchangeRate(draft?.exchangeRate ?? 1);
      setRemitoLink(draft?.remitoLink ?? null);
      setOriginInvoiceId(draft?.originInvoiceId ?? '');
      if (!draft && currency !== 'ARS') fetchDayRate();
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
        discountPct: Number(i.discountPct) || 0,
        taxRate:     Number(i.taxRate),
        productId:   i.productId ?? null,
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
      setTributos(existingTribs);
      setShowItems(existingItems.length > 0);
      setShowTribs(existingTribs.length > 0);
      // El comprobante puede traer un descuento distinto por línea. Si todas
      // comparten el mismo, se muestra como descuento global en %.
      syncDiscountFromItems(existingItems, Number(existing.discountPct) || 0);
      setManualBase(Number(existing.subtotal) + (Number(existing.discountAmount) || 0));
    } else if (fromRemito) {
      setForm({ ...EMPTY_FORM, number: '' });
      setItems(fromRemito.items.map((i) => ({ ...i, discountPct: Number(i.discountPct) || 0 })));
      setTributos([]);
      setShowItems(fromRemito.items.length > 0);
      setShowTribs(false);
      setDiscountType('%'); setDiscountValue(0); setHasPerItemDiscount(false);
      setManualBase(0);
    } else {
      const draft = readDraft();
      setForm(draft?.form ?? EMPTY_FORM);
      setItems(draft?.items ?? []);
      setTributos(draft?.tributos ?? []);
      setShowItems(draft?.showItems ?? false);
      setShowTribs(draft?.showTribs ?? false);
      setDiscountType(draft?.discountType ?? '%');
      setDiscountValue(draft?.discountValue ?? 0);
      setHasPerItemDiscount(draft?.hasPerItemDiscount ?? false);
      setManualBase(draft?.manualBase ?? 0);
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

  // Líneas con producto que no está en memoria (factura guardada o borrador
  // restaurado): se traen para rotular la fila y comparar el costo.
  useEffect(() => {
    if (!isOpen) return;
    const missingIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id && !productById[id]))];
    if (missingIds.length === 0) return;
    let cancelled = false;
    Promise.all(missingIds.map((id) => productsService.getById(id).catch(() => null)))
      .then((list) => {
        if (cancelled) return;
        const found = list.filter((p): p is Product => !!p);
        if (found.length) setProductById((prev) => ({ ...prev, ...Object.fromEntries(found.map((p) => [p.id, p])) }));
      });
    return () => { cancelled = true; };
  }, [isOpen, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ¿Hay datos cargados? (para confirmar cierre y decidir si guardar el borrador)
  const isDirty = useMemo(() => (
    !!form.number.trim() || Number(form.amount) > 0 || Number(form.subtotal) > 0 ||
    items.length > 0 || tributos.length > 0 ||
    !!supplierId || !!form.notes || !!originInvoiceId
  ), [form, items, tributos, supplierId, originInvoiceId]);

  // Auto-guardado del borrador (solo factura nueva). Se omite el primer render
  // tras hidratar para no pisar lo restaurado con el estado vacío inicial.
  useEffect(() => {
    if (!isOpen || !isDraftMode) return;
    if (hydratingRef.current) { hydratingRef.current = false; return; }
    if (!isDirty) { clearDraft(); return; }
    const snapshot = {
      supplierId, currencyState, saleCondition, date, exchangeRate, remitoLink,
      originInvoiceId, form, items, tributos, showItems, showTribs,
      discountType, discountValue, hasPerItemDiscount, manualBase,
    };
    try { localStorage.setItem(draftKey, JSON.stringify(snapshot)); } catch { /* quota */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isDraftMode, isDirty, supplierId, currencyState, saleCondition, date,
      exchangeRate, remitoLink, originInvoiceId, form, items, tributos,
      showItems, showTribs, discountType, discountValue, hasPerItemDiscount, manualBase]);

  // Cierre con Escape (respeta la confirmación de borrador)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (costReview) { setCostReview(null); return; }
      if (confirmAction) { setConfirmAction(null); return; }
      if (!isPage) attemptClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isDraftMode, isDirty, confirmAction, costReview]);

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

  // Modo manual (sin ítems) con más de una alícuota: convierte el neto/IVA
  // cargado en una línea de ítem genérica y agrega una segunda vacía, para
  // reusar el desglose por alícuota que ya soportan los ítems (y que además
  // es lo que lee el Libro IVA para reportar netos por tasa).
  const rateLabel = (r: number) => r === 0 ? 'Exento / 0%' : `Gravado ${r}%`;
  const splitIntoTaxLines = () => {
    const first: PurchaseInvoiceItemRow = {
      description: rateLabel(form.taxRate),
      quantity:    1,
      unitPrice:   manualBase,
      taxRate:     form.taxRate,
    };
    const second: PurchaseInvoiceItemRow = { ...EMPTY_ITEM, description: '' };
    setItems([first, second]);
    setShowItems(true);
  };
  const removeItem = (i: number) => setItems((prev) => {
    const next = prev.filter((_, idx) => idx !== i);
    // Sin líneas no hay descuento por ítem que sostener: vuelve al global.
    if (next.length === 0) setHasPerItemDiscount(false);
    return next;
  });
  const setItem = (i: number, field: keyof CreatePurchaseInvoiceItemDTO, val: unknown) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  // Precio unitario de un producto en la moneda del comprobante: en USD toma el
  // costo en dólares del producto (ver productCostIn).
  const unitCostOf = (p: Product): number | null =>
    productCostIn(p, currencyState, currencyState === 'ARS' ? 1 : exchangeRate)?.value ?? null;

  // Al cambiar la moneda, las líneas con producto pasan al costo en esa moneda
  // (en USD, el costo en dólares del producto).
  const repriceItems = (cur: string, rate: number) =>
    setItems((prev) => prev.map((item) => {
      const p = item.productId ? productById[item.productId] : undefined;
      const c = p ? productCostIn(p, cur, cur === 'ARS' ? 1 : rate) : null;
      return c ? { ...item, unitPrice: c.value } : item;
    }));

  // Al elegir un producto: autocompleta descripción, precio unitario (costo) e IVA.
  // El productId queda solo en el estado local (no se envía al backend).
  const selectProduct = (i: number, productId: string, picked?: Product) => {
    const product = picked ?? products.find((p) => p.id === productId);
    if (product) setProductById((prev) => ({ ...prev, [product.id]: product }));
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== i) return item;
      if (!product) return { ...item, productId: null };
      return {
        ...item,
        productId,
        description: product.name,
        unitPrice: unitCostOf(product) || item.unitPrice,
        taxRate: Number(product.taxRate),
      };
    }));
  };

  // Alta desde el buscador de productos: una línea por producto elegido.
  const addItemsFromProducts = (picked: Product[]) => {
    if (picked.length === 0) return;
    setProductById((prev) => ({ ...prev, ...Object.fromEntries(picked.map((p) => [p.id, p])) }));
    setItems((prev) => [
      ...prev,
      ...picked.map((p) => ({
        productId:   p.id,
        description: p.name,
        quantity:    1,
        unitPrice:   unitCostOf(p) || 0,
        taxRate:     Number(p.taxRate),
      })),
    ]);
    setShowItems(true);
  };

  const hasItems = items.length > 0;

  // "Otros tributos" suman al total del comprobante
  const totalTributos = tributos.reduce((s, t) => s + Number(t.amount), 0);

  // ── Descuentos ────────────────────────────────────────────────
  // Dos formas EXCLUYENTES de cargarlo:
  //   · global  → vive en la cabecera del comprobante. Las líneas quedan a
  //               precio de lista y el descuento se muestra como un renglón
  //               aparte, igual que en la factura de papel.
  //   · por ítem → cada línea lleva su propio %, y la cabecera no descuenta.
  // En los dos casos el descuento reduce la BASE IMPONIBLE: el IVA sale del
  // neto ya descontado (prorrateado por alícuota cuando el descuento es global).
  const itemBase = (item: CreatePurchaseInvoiceItemDTO) => item.quantity * item.unitPrice;

  // Descuento PROPIO de la línea (0 mientras el descuento sea global).
  const itemDiscountPct = (item: CreatePurchaseInvoiceItemDTO) =>
    hasPerItemDiscount ? Math.min(Number(item.discountPct) || 0, 100) : 0;
  const itemDiscount = (item: CreatePurchaseInvoiceItemDTO) =>
    itemBase(item) * (itemDiscountPct(item) / 100);

  // Importes de la línea, tal como se muestran en la grilla: sin el descuento
  // global, que se resta una sola vez sobre el total.
  const itemSubtotal = (item: CreatePurchaseInvoiceItemDTO) =>
    itemBase(item) - itemDiscount(item);
  const itemTax = (item: CreatePurchaseInvoiceItemDTO) =>
    itemSubtotal(item) * (item.taxRate / 100);
  const itemTotal = (item: CreatePurchaseInvoiceItemDTO) =>
    itemSubtotal(item) + itemTax(item);

  // Base sobre la que se aplica el descuento global: la suma de las líneas
  // (ya netas de su descuento propio) o el neto cargado a mano.
  const baseAmount = hasItems ? items.reduce((s, it) => s + itemSubtotal(it), 0) : manualBase;

  // Un descuento global en $ se expresa como el % equivalente sobre esa base.
  const globalDiscountPct = hasPerItemDiscount ? 0 : (discountType === '%'
    ? Math.min(discountValue, 100)
    : (baseAmount > 0 ? (Math.min(discountValue, baseAmount) / baseAmount) * 100 : 0));
  const globalFactor = 1 - globalDiscountPct / 100;

  /**
   * Refleja en el control global el descuento que trae un comprobante cargado:
   * si todas las líneas comparten el mismo porcentaje se muestra como global,
   * y si difieren queda en modo "por línea".
   */
  const syncDiscountFromItems = (
    loaded: Array<{ discountPct?: number | string | null }>,
    headerPct = 0,
  ) => {
    setDiscountType('%');
    if (loaded.length === 0) {
      setHasPerItemDiscount(false);
      setDiscountValue(headerPct);
      return;
    }
    const pcts = loaded.map((item) => Number(item.discountPct) || 0);
    const uniform = pcts.every((pct) => Math.abs(pct - pcts[0]) < 0.000001);
    setHasPerItemDiscount(!uniform);
    setDiscountValue(uniform ? pcts[0] : 0);
  };

  const setGlobalDiscount = (nextType: '%' | '$', nextValue: number) => {
    setHasPerItemDiscount(false);
    setDiscountType(nextType);
    setDiscountValue(Math.max(nextValue, 0));
  };

  /**
   * Descuento tocado desde una línea: el comprobante deja de tener descuento
   * global y pasa a descuentos por ítem. El global que había se baja a las
   * demás filas para que el total no salte al cambiar de modo.
   */
  const handleItemDiscountChange = (index: number, pct: number) => {
    const clamped = Math.min(Math.max(pct, 0), 100);
    const heredado = hasPerItemDiscount ? null : globalDiscountPct;
    setItems((prev) => prev.map((item, i) => ({
      ...item,
      discountPct: i === index
        ? clamped
        : (heredado ?? Math.min(Number(item.discountPct) || 0, 100)),
    })));
    if (!hasPerItemDiscount) {
      setHasPerItemDiscount(true);
      setDiscountValue(0);
    }
  };

  // ── Auto-calc totals ────────────────────────────────────────
  // Con ítems los totales se derivan; si no, salen del neto cargado a mano.

  // Suma de las líneas a precio de lista (neta del descuento propio de cada una).
  const itemsGross = items.reduce((s, it) => s + itemSubtotal(it), 0);

  // El descuento global se resta UNA sola vez, sobre el total.
  const discountAmount = baseAmount * (globalDiscountPct / 100);

  // Neto e IVA del comprobante: el descuento global se prorratea por alícuota
  // (no por línea) para que el IVA salga de la base ya descontada.
  const itemsSubtotal  = itemsGross * globalFactor;
  const itemsTaxAmount = items.reduce((s, it) => s + itemTax(it) * globalFactor, 0);
  const itemsTotal     = itemsSubtotal + itemsTaxAmount;

  // Tax breakdown by rate (for display) — netos ya descontados
  const taxByRate = useMemo(() => {
    const map: Record<number, { subtotal: number; tax: number }> = {};
    for (const it of items) {
      const rate = Number(it.taxRate);
      if (!map[rate]) map[rate] = { subtotal: 0, tax: 0 };
      map[rate].subtotal += itemSubtotal(it) * globalFactor;
      map[rate].tax      += itemTax(it) * globalFactor;
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, hasPerItemDiscount, globalFactor]);

  // Sync form totals whenever items change (grand total includes otros tributos)
  useEffect(() => {
    if (!hasItems) return;
    setForm((prev) => ({
      ...prev,
      subtotal:       itemsSubtotal,
      taxAmount:      itemsTaxAmount,
      discountPct:    globalDiscountPct,
      discountAmount: discountAmount,
      amount:         itemsTotal + totalTributos,
    }));
  }, [hasItems, itemsSubtotal, itemsTaxAmount, discountAmount, globalDiscountPct, itemsTotal, totalTributos]);

  // Carga manual (sin ítems): del neto gravado sale todo lo demás.
  useEffect(() => {
    if (hasItems) return;
    const discount  = manualBase * (globalDiscountPct / 100);
    const subtotal  = manualBase - discount;
    const taxAmount = subtotal * (form.taxRate / 100);
    setForm((prev) => ({
      ...prev,
      subtotal,
      taxAmount,
      discountPct:    globalDiscountPct,
      discountAmount: discount,
      amount:         subtotal + taxAmount + totalTributos,
    }));
  }, [hasItems, manualBase, globalDiscountPct, form.taxRate, totalTributos]);

  // Manual total handlers — only used when there are no items
  const handleSubtotalChange = (val: number) => setManualBase(val);
  const handleTaxRateChange  = (val: number) => set('taxRate', val);
  // Escribir el total lo desarma hacia atrás. Solo se habilita sin descuento ni
  // otros tributos, para no tener dos fuentes de verdad del mismo importe.
  const handleTotalChange = (val: number) => setManualBase(val / (1 + form.taxRate / 100));

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

  const isValid = form.number.trim() && form.amount > 0 && (!standalone || !!supplierId);

  // Lo que falta para poder guardar, en los mismos términos que `isValid`.
  // Se muestra en la columna de totales para no obligar a buscar el error.
  const missing: string[] = [];
  if (standalone && !supplierId)  missing.push('Elegí el proveedor');
  if (!form.number.trim())        missing.push('Cargá el número de factura');
  if (!(form.amount > 0))         missing.push('El total tiene que ser mayor a cero');

  const buildPayload = (): CreatePurchaseInvoiceDTO => ({
    ...form,
    // El descuento global viaja en la CABECERA: las líneas van a precio de
    // lista y solo llevan su descuento propio (0 si el descuento es global).
    // Invariante: suma(item.subtotal) − discountAmount = subtotal.
    discountPct:    globalDiscountPct,
    discountAmount: discountAmount,
    items: items.map((item) => ({
      ...item,
      productId:   item.productId || null,
      discountPct: itemDiscountPct(item),
    })),
    tributos,
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

  const resetToEmpty = () => {
    setForm(EMPTY_FORM); setItems([]); setTributos([]);
    setSupplierId(''); setCurrencyState(currency); setSaleCondition('CONTADO');
    setDate(todayISO()); setExchangeRate(1); setRemitoLink(null); setOriginInvoiceId('');
    setShowItems(false); setShowTribs(false);
    setDiscountType('%'); setDiscountValue(0); setHasPerItemDiscount(false);
    setManualBase(0);
  };

  // El click afuera no cierra; cerrar con datos cargados pide confirmación.
  const attemptClose = () => {
    if (isDraftMode && isDirty) { setConfirmAction('close'); return; }
    onClose();
  };

  const handleConfirm = () => {
    if (confirmAction === 'discard') {
      clearDraft();
      resetToEmpty();
      setConfirmAction(null);
      return;
    }
    // 'close' — el borrador queda guardado y se restaura al reabrir
    setConfirmAction(null);
    onClose();
  };

  // Guarda y, solo si el guardado fue exitoso, limpia el borrador.
  const save = async (updateCosts?: { productIds: string[]; keepMargin: boolean }) => {
    try {
      await onSave({ ...buildPayload(), ...(updateCosts?.productIds.length ? { updateCosts } : {}) });
      setCostReview(null);
      if (isDraftMode) clearDraft();
    } catch { /* el padre ya muestra el error y mantiene el modal abierto */ }
  };

  /**
   * Productos cuyo costo cambia con lo facturado. Costo unitario = neto de la
   * línea / cantidad, menos el descuento global, sin IVA (mismo cálculo que el
   * backend). Si un producto está en varias líneas, promedio ponderado. Los
   * productos se releen para comparar contra el costo vigente.
   */
  const findCostChanges = async (): Promise<CostCandidate[]> => {
    if (isNote) return [];
    const byProduct = new Map<string, { qty: number; net: number }>();
    for (const it of items) {
      if (!it.productId || !(Number(it.quantity) > 0)) continue;
      const acc = byProduct.get(it.productId) ?? { qty: 0, net: 0 };
      acc.qty += Number(it.quantity);
      acc.net += itemSubtotal(it) * globalFactor;
      byProduct.set(it.productId, acc);
    }
    if (byProduct.size === 0) return [];

    const fresh = await Promise.all([...byProduct.keys()].map((id) => productsService.getById(id).catch(() => null)));
    const rate = currencyState === 'ARS' ? 1 : (exchangeRate || 1);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const out: CostCandidate[] = [];
    for (const p of fresh) {
      if (!p) continue;
      const { qty, net } = byProduct.get(p.id)!;
      const next = round2(net / qty);
      if (!(next > 0)) continue;
      const current = productCostIn(p, currencyState, rate)?.value ?? null;
      if (current != null && Math.abs(round2(current) - next) < 0.01) continue;
      const oldCost = Number(p.cost) || 0;
      const nextArs = currencyState === 'ARS' ? next : next * rate;
      out.push({
        productId: p.id,
        name:      p.name,
        sku:       p.sku,
        current,
        next,
        price:     Number(p.price) || 0,
        priceKeepingMargin: oldCost > 0 ? round2((Number(p.price) || 0) * nextArs / oldCost) : null,
        usdFromArs: currencyState === 'ARS' && p.costUSD != null,
      });
    }
    return out;
  };

  const handleSaveClick = async () => {
    setCheckingCosts(true);
    let changes: CostCandidate[] = [];
    try { changes = await findCostChanges(); }
    catch { /* sin datos de productos: se guarda sin ofrecer la actualización */ }
    finally { setCheckingCosts(false); }
    if (changes.length > 0) { setCostReview(changes); return; }
    await save();
  };

  // All hooks have been called — safe to early-return now
  if (!isOpen) return null;

  // ── Styles ─────────────────────────────────────────────────────────────────

  const inputCls  = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700';
  const labelCls  = 'block text-xs text-gray-500 dark:text-slate-400 mb-1';
  const tinyInput = 'w-full text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-300';

  // Tipo del comprobante en dos partes: clase (factura / NC / ND / otro) + letra.
  const typeKind: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'OTRO' =
    form.type.startsWith('FACTURA_') ? 'FACTURA'
    : form.type.startsWith('NOTA_CREDITO_') ? 'NOTA_CREDITO'
    : form.type.startsWith('NOTA_DEBITO_') ? 'NOTA_DEBITO'
    : 'OTRO';
  const typeLetter = typeKind === 'OTRO' ? form.type : form.type.slice(form.type.lastIndexOf('_') + 1);
  const letterOptions = typeKind === 'FACTURA' ? ['A', 'B', 'C', 'M'] : typeKind === 'OTRO' ? ['RECIBO', 'OTRO'] : ['A', 'B', 'C'];
  const setTypeKind = (kind: typeof typeKind) => {
    if (kind === 'OTRO') { set('type', 'OTRO'); return; }
    const letter = ['A', 'B', 'C', 'M'].includes(typeLetter) ? typeLetter : 'A';
    set('type', `${kind}_${kind !== 'FACTURA' && letter === 'M' ? 'A' : letter}`);
  };
  const setTypeLetter = (letter: string) => set('type', typeKind === 'OTRO' ? letter : `${typeKind}_${letter}`);

  // Aviso por línea cuando el costo facturado difiere del costo actual del producto.
  const costHint = (item: PurchaseInvoiceItemRow): { text: string; changed: boolean } | null => {
    const p = item.productId ? productById[item.productId] : undefined;
    if (!p) return null;
    const current = productCostIn(p, currencyState, Number(exchangeRate) || 0);
    const net = (Number(item.unitPrice) || 0) * (1 - (itemDiscountPct(item) || 0) / 100);
    if (!current || current.value <= 0 || net <= 0) return { text: p.sku ?? '', changed: false };
    const pct = ((net - current.value) / current.value) * 100;
    if (Math.abs(pct) < 0.5) return { text: `${p.sku ?? ''} · mismo costo`, changed: false };
    return {
      text: `${p.sku ? `${p.sku} · ` : ''}costo actual ${formatCurrency(current.value, currencyState)} (${pct > 0 ? '+' : ''}${pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %)`,
      changed: true,
    };
  };
  const costChanges = items.filter((it) => costHint(it)?.changed).length;

  const segBtn = (active: boolean) =>
    `flex-1 h-9 px-2 rounded-lg border text-sm transition-colors ${
      active
        ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-semibold dark:border-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-200'
        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'
    }`;
  const cardCls = 'rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800';
  const cellInput = 'w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700';

  return (
    <div className={isPage ? '' : 'fixed inset-0 z-50 flex items-center justify-center p-4'}>
      {/* Click afuera NO cierra: evita perder lo cargado por accidente */}
      {!isPage && <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />}

      <div className={isPage
        ? 'relative w-full'
        : 'relative bg-gray-50 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-7xl flex flex-col max-h-[92vh] overflow-hidden'}>
        {/* Header */}
        <div className={`flex items-center gap-3 ${isPage ? 'mb-4' : 'px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
          {isPage && (
            <button onClick={attemptClose} title="Volver" aria-label="Volver"
              className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className={`flex-1 font-bold text-gray-900 dark:text-white ${isPage ? 'text-xl' : 'text-base'}`}>
            {existing ? 'Editar factura de compra' : 'Nueva factura de compra'}
          </h2>
          {isDraftMode && isDirty && (
            <span className="text-xs text-gray-500 dark:text-slate-400">Borrador guardado · se restaura si salís</span>
          )}
          {!isPage && (
            <button onClick={attemptClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body: carga a la izquierda, resumen fijo a la derecha */}
        <div className={isPage ? 'flex flex-col lg:flex-row gap-4 items-start' : 'flex-1 overflow-y-auto p-5 flex flex-col lg:flex-row gap-4 items-start'}>

        <div className="flex-1 min-w-0 w-full space-y-4">

          {/* ── Comprobante ── */}
          <section aria-label="Comprobante" className={`${cardCls} p-4 grid grid-cols-2 md:grid-cols-12 gap-3`}>
            {standalone && (
              <div className="col-span-2 md:col-span-7">
                <label className={labelCls}>Proveedor *</label>
                <SupplierSearchSelect
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(id) => setSupplierId(id)}
                  placeholder="Seleccionar proveedor…"
                  serverSearch
                />
              </div>
            )}
            <div className={standalone ? 'col-span-2 md:col-span-5' : 'col-span-2 md:col-span-12'}>
              <label className={labelCls}>Número *</label>
              <input className={inputCls + ' font-mono'} placeholder="00001-00012345" value={form.number}
                onChange={(e) => set('number', e.target.value)}
                onBlur={(e) => set('number', formatInvoiceNumberInput(e.target.value))} />
            </div>
            <div className="col-span-2 md:col-span-12">
              <span className={labelCls}>Tipo *</span>
              <div className="flex gap-1.5" role="group" aria-label="Tipo de comprobante">
                {([['FACTURA', 'Factura'], ['NOTA_CREDITO', 'N. crédito'], ['NOTA_DEBITO', 'N. débito'], ['OTRO', 'Otro']] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={typeKind === k} onClick={() => setTypeKind(k)} className={segBtn(typeKind === k)}>{l}</button>
                ))}
                <select aria-label="Letra" className={inputCls + ' !w-28 shrink-0'} value={typeLetter} onChange={(e) => setTypeLetter(e.target.value)}>
                  {letterOptions.map((l) => <option key={l} value={l}>{l === 'RECIBO' ? 'Recibo' : l === 'OTRO' ? 'Otro' : l}</option>)}
                </select>
              </div>
            </div>

            {standalone && (
              <div className="md:col-span-3">
                <label className={labelCls}>Fecha</label>
                <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="md:col-span-3">
              <label className={labelCls}>Vencimiento</label>
              <input type="date" className={inputCls} value={form.dueDate ?? ''}
                onChange={(e) => set('dueDate', e.target.value || null)} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Imputación</label>
              <input type="date" className={inputCls} value={form.imputationDate ?? ''}
                onChange={(e) => set('imputationDate', e.target.value || null)} />
            </div>
            {standalone && (
              <div className="md:col-span-3">
                <label className={labelCls}>Moneda</label>
                <select className={inputCls} value={currencyState}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCurrencyState(v);
                    if (v === 'ARS') {
                      setExchangeRate(1);
                      repriceItems('ARS', 1);
                    } else {
                      repriceItems(v, exchangeRate);
                      if (!existing) fetchDayRate().then((r) => { if (r) repriceItems(v, r); });
                    }
                  }}>
                  {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            {standalone && currencyState !== 'ARS' && (
              <div className="col-span-2 md:col-span-6">
                <label className={labelCls}>Cotización (USD → ARS)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step="0.01"
                    className={inputCls + ' text-right'}
                    value={exchangeRate || ''}
                    placeholder="0.00"
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)} />
                  <button type="button" onClick={fetchDayRate} disabled={rateLoading}
                    className="shrink-0 text-xs px-2.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50">
                    {rateLoading ? '…' : 'Dólar de hoy'}
                  </button>
                </div>
              </div>
            )}

            {isNote && (
              <div className="col-span-2 md:col-span-12">
                <label className={labelCls}>Comprobante de origen (opcional)</label>
                <select
                  className={inputCls}
                  value={originInvoiceId}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  disabled={!supplierId}
                >
                  <option value="">{supplierId ? 'Sin imputar a una factura…' : 'Elegí primero el proveedor'}</option>
                  {originOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {formatCurrency(o.amount, o.currency || 'ARS')} · {new Date(o.date).toLocaleDateString('es-AR')}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                  {originInvoiceId
                    ? 'La NC/ND queda vinculada a esta factura del proveedor. La letra se ajusta automáticamente.'
                    : 'Sin seleccionar, la NC/ND se carga directo a la cuenta corriente del proveedor para imputar después.'}
                </p>
              </div>
            )}

            {remitoLink && (
              <p className="col-span-2 md:col-span-12 text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" /> Vinculada al remito {remitoLink.number}
              </p>
            )}
          </section>

          {/* ── Ítems / importes ── */}
          <section aria-label="Ítems" className={`${cardCls} overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
              <h3 className="flex-1 text-sm font-bold text-gray-900 dark:text-white">
                {hasItems || showItems ? <>Ítems <span className="font-medium text-gray-500">· {items.length}</span></> : 'Importes'}
              </h3>
              <div role="group" aria-label="Modo de carga" className="inline-flex rounded-lg border border-gray-200 dark:border-slate-600 p-0.5">
                <button type="button" aria-pressed={hasItems || showItems}
                  onClick={() => { if (!hasItems) { setShowItems(true); setPicker('multi'); } }}
                  className={`h-8 px-3 rounded-md text-xs ${hasItems || showItems ? 'bg-gray-900 text-white font-semibold dark:bg-slate-200 dark:text-slate-900' : 'text-gray-600 dark:text-slate-300'}`}>
                  Con productos
                </button>
                <button type="button" aria-pressed={!hasItems && !showItems}
                  disabled={hasItems}
                  title={hasItems ? 'Quitá los ítems para cargar solo los totales' : undefined}
                  onClick={() => setShowItems(false)}
                  className={`h-8 px-3 rounded-md text-xs disabled:opacity-50 ${!hasItems && !showItems ? 'bg-gray-900 text-white font-semibold dark:bg-slate-200 dark:text-slate-900' : 'text-gray-600 dark:text-slate-300'}`}>
                  Solo totales
                </button>
              </div>
            </div>

            {hasItems || showItems ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[660px] text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      <tr className="text-right">
                        <th className="px-4 py-2 text-left font-semibold">Producto</th>
                        <th className="px-2 py-2 font-semibold w-20">Cant.</th>
                        <th className="px-2 py-2 font-semibold w-28">Costo unit.</th>
                        <th className="px-2 py-2 font-semibold w-16">Desc. %</th>
                        <th className="px-2 py-2 font-semibold w-24">IVA</th>
                        <th className="px-2 py-2 font-semibold w-28">Total</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {items.map((item, i) => {
                        const hint = costHint(item);
                        return (
                          <tr key={i} className="text-right align-top">
                            <td className="px-4 py-2 text-left">
                              {!item.productId ? (
                                <div className="flex items-center gap-1.5">
                                  <input className={cellInput} placeholder="Descripción (línea sin producto)" aria-label="Descripción"
                                    value={item.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                                  <button type="button" onClick={() => setPicker(i)} title="Elegir un producto del catálogo"
                                    className="shrink-0 h-8 px-2 rounded-md border border-dashed border-gray-300 dark:border-slate-600 text-xs text-gray-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-700">
                                    <Package className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPicker(i)}
                                  className={`flex-1 min-w-0 text-left rounded-md px-2 py-1.5 text-sm border transition-colors ${
                                    item.productId
                                      ? 'border-transparent hover:border-indigo-200 font-semibold text-gray-900 dark:text-white'
                                      : 'border-dashed border-gray-300 text-gray-500 hover:border-indigo-300 dark:border-slate-600'
                                  }`}
                                >
                                  <span className="block truncate">
                                    {item.productId ? (productById[item.productId]?.name || item.description || 'Producto') : 'Elegir producto…'}
                                  </span>
                                </button>
                                {item.productId && (
                                  <button type="button" onClick={() => selectProduct(i, '')}
                                    title="Quitar el producto (la línea queda como descripción libre)" aria-label="Quitar el producto"
                                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              )}
                              {hint?.text && (
                                <span className={`block px-2 text-[11px] ${hint.changed ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-slate-400'}`}>{hint.text}</span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min={0} step="0.01" className={cellInput + ' text-right'} placeholder="1" aria-label="Cantidad"
                                value={item.quantity || ''} onChange={(e) => setItem(i, 'quantity', parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min={0} step="0.01" className={cellInput + ' text-right'} placeholder="0.00" aria-label="Costo unitario"
                                value={item.unitPrice || ''} onChange={(e) => setItem(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min={0} max={100} step="0.01" className={cellInput + ' text-right'} placeholder="0" aria-label="Descuento %"
                                value={itemDiscountPct(item) || ''} onChange={(e) => handleItemDiscountChange(i, parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-2 py-2">
                              <select className={cellInput} aria-label="IVA" value={item.taxRate}
                                onChange={(e) => setItem(i, 'taxRate', parseFloat(e.target.value))}>
                                {TAX_RATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2.5 font-semibold tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                              {formatCurrency(itemTotal(item), currencyState)}
                            </td>
                            <td className="py-2 pr-2">
                              <button type="button" onClick={() => removeItem(i)} aria-label="Quitar línea"
                                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                  <button type="button" onClick={() => setPicker('multi')}
                    className="flex-1 min-w-[16rem] flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 text-left">
                    <Package className="w-4 h-4" /> Agregar productos: código, nombre o código de barras…
                  </button>
                  <button type="button" onClick={addItem} className="text-xs font-medium text-gray-600 hover:text-indigo-700 dark:text-slate-300">
                    + Línea en blanco
                  </button>
                  {hasItems && (
                    <span className="ml-auto text-xs text-gray-500 dark:text-slate-400">
                      Subtotal ítems <strong className="text-gray-800 dark:text-slate-200 tabular-nums">{formatCurrency(itemsGross, currencyState)}</strong>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>Neto gravado</label>
                    <input type="number" min={0} step="0.01" className={inputCls + ' text-right'}
                      value={manualBase || ''} placeholder="0.00"
                      onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)} />
                    {discountAmount > 0 && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                        − {formatCurrency(discountAmount, currencyState)} de descuento = {formatCurrency(form.subtotal, currencyState)}
                      </p>
                    )}
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
                  <div>
                    <label className={labelCls + ' font-semibold text-gray-700 dark:text-slate-300'}>Total factura *</label>
                    <input type="number" min={0} step="0.01"
                      className={inputCls + ' text-right font-semibold' + (totalTributos > 0 || discountAmount > 0 ? ' bg-gray-50 dark:bg-slate-600' : '')}
                      value={form.amount ? Number(form.amount).toFixed(2) : ''} placeholder="0.00"
                      readOnly={totalTributos > 0 || discountAmount > 0}
                      onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button type="button" onClick={splitIntoTaxLines}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Agregar otra alícuota
                  </button>
                  <button type="button" onClick={() => { setShowItems(true); setPicker('multi'); }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Cargar con productos (mueve costos)
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Otros tributos + Descuento y notas ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <section aria-label="Otros tributos" className={`${cardCls} px-4 py-3`}>
              <button type="button" onClick={() => setShowTribs((v) => !v)} aria-expanded={showTribs}
                className="w-full flex items-center gap-2 text-left text-sm font-bold text-gray-900 dark:text-white min-h-[32px]">
                {showTribs ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Otros tributos
                <span className="font-medium text-gray-500 dark:text-slate-400">
                  · {totalTributos > 0 ? formatCurrency(totalTributos, currencyState) : 'ninguno'}
                </span>
              </button>
              {showTribs && (
                <div className="mt-2 space-y-2">
                  {tributos.map((trib, i) => (
                    <div key={i} className="grid grid-cols-2 gap-1.5 rounded-lg border border-gray-100 dark:border-slate-700 p-2">
                      <select className={tinyInput} value={trib.type} aria-label="Tipo de tributo"
                        onChange={(e) => setTrib(i, 'type', e.target.value as TributoType)}>
                        {TRIBUTO_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {trib.type === 'PERCEPCION_IIBB' ? (
                        <ProvinciaSelect className={tinyInput} value={trib.jurisdiction}
                          placeholder="Jurisdicción"
                          onChange={(v) => setTrib(i, 'jurisdiction', v)} />
                      ) : (
                        <input className={tinyInput} placeholder="Jurisdicción" aria-label="Jurisdicción"
                          value={trib.jurisdiction ?? ''}
                          onChange={(e) => setTrib(i, 'jurisdiction', e.target.value || null)} />
                      )}
                      <div className="col-span-2 grid grid-cols-[1fr_72px_1fr_32px] gap-1.5 items-center">
                        <input type="number" min={0} step="0.01" className={tinyInput + ' text-right'} placeholder="Base" aria-label="Base"
                          value={trib.base || ''}
                          onChange={(e) => recalcTribAmount(i, parseFloat(e.target.value) || 0, undefined)} />
                        <input type="number" min={0} max={100} step="0.01" className={tinyInput + ' text-right'} placeholder="%" aria-label="Porcentaje"
                          value={trib.percentage || ''}
                          onChange={(e) => recalcTribAmount(i, undefined, parseFloat(e.target.value) || 0)} />
                        <input type="number" min={0} step="0.01" className={tinyInput + ' text-right font-semibold'} placeholder="Importe" aria-label="Importe"
                          value={trib.amount || ''}
                          onChange={(e) => setTrib(i, 'amount', parseFloat(e.target.value) || 0)} />
                        <button type="button" onClick={() => removeTrib(i)} aria-label="Quitar tributo"
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addTrib} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                    + Agregar percepción o tributo
                  </button>
                </div>
              )}
            </section>

            <section aria-label="Descuento y notas" className={`${cardCls} px-4 py-3`}>
              <button type="button" onClick={() => setShowExtras((v) => !v)} aria-expanded={showExtras}
                className="w-full flex items-center gap-2 text-left text-sm font-bold text-gray-900 dark:text-white min-h-[32px]">
                {showExtras ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Descuento y notas
                <span className="font-medium text-gray-500 dark:text-slate-400">
                  · {discountAmount > 0 ? `− ${formatCurrency(discountAmount, currencyState)}` : 'sin descuento'}{form.notes ? ' · con nota' : ''}
                </span>
              </button>
              {showExtras && (
                <div className="mt-2 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={labelCls + ' !mb-0'}>Descuento del comprobante</span>
                      <div className="flex rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
                        {(['%', '$'] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setGlobalDiscount(t, discountValue)}
                            className={`px-2.5 py-1 text-xs font-semibold ${
                              !hasPerItemDiscount && discountType === t
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-600'
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input type="number" min={0} step="0.01" aria-label="Descuento"
                      className={inputCls + ' text-right tabular-nums'}
                      placeholder="0.00"
                      value={hasPerItemDiscount ? '' : (discountValue || '')}
                      onChange={(e) => setGlobalDiscount(discountType, parseFloat(e.target.value) || 0)} />
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                      {hasPerItemDiscount
                        ? 'Hay descuentos distintos por línea. Si cargás un valor acá, se aplica a todos los ítems.'
                        : discountType === '%'
                          ? 'Se aplica a todas las líneas y reduce la base imponible.'
                          : `Importe fijo: equivale a ${globalDiscountPct.toFixed(2)} % por ítem.`}
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>Notas</label>
                    <input className={inputCls} placeholder="Opcional" value={form.notes ?? ''}
                      onChange={(e) => set('notes', e.target.value || null)} />
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── Resumen fijo: totales, pago y guardar ──
            Las retenciones no se cargan acá: se practican al emitir la orden de pago. */}
        <aside aria-label="Resumen" className={`w-full lg:w-[360px] shrink-0 ${cardCls} p-5 space-y-4 ${isPage ? 'lg:sticky lg:top-4' : 'lg:sticky lg:top-0'}`}>
          <dl className="space-y-1.5 text-[13px]">
            {discountAmount > 0 && (
              <>
                <div className="flex justify-between text-gray-600 dark:text-slate-300">
                  <dt>Subtotal sin descuento</dt><dd className="tabular-nums">{formatCurrency(baseAmount, currencyState)}</dd>
                </div>
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 pb-1.5 border-b border-dashed border-gray-200 dark:border-slate-700">
                  <dt>Descuento {globalDiscountPct.toFixed(2)} %</dt><dd className="tabular-nums">− {formatCurrency(discountAmount, currencyState)}</dd>
                </div>
              </>
            )}
            {hasItems ? (
              Object.entries(taxByRate).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, val]) => (
                <div key={rate}>
                  <div className="flex justify-between text-gray-600 dark:text-slate-300">
                    <dt>Neto {Number(rate) === 0 ? '(exento)' : `gravado ${rate} %`}</dt>
                    <dd className="tabular-nums">{formatCurrency(val.subtotal, currencyState)}</dd>
                  </div>
                  {Number(rate) > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 pl-2.5 mt-0.5">
                      <dt>IVA {rate} %</dt><dd className="tabular-nums">{formatCurrency(val.tax, currencyState)}</dd>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                <div className="flex justify-between text-gray-600 dark:text-slate-300">
                  <dt>Neto gravado</dt><dd className="tabular-nums">{formatCurrency(form.subtotal, currencyState)}</dd>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 pl-2.5">
                  <dt>IVA {form.taxRate} %</dt><dd className="tabular-nums">{formatCurrency(form.taxAmount, currencyState)}</dd>
                </div>
              </>
            )}
            {totalTributos > 0 && (
              <div className="flex justify-between text-amber-700 dark:text-amber-400 border-t border-dashed border-gray-200 dark:border-slate-700 pt-2 mt-1">
                <dt>Otros tributos</dt><dd className="tabular-nums">+ {formatCurrency(totalTributos, currencyState)}</dd>
              </div>
            )}
          </dl>

          <div className="border-t border-gray-200 dark:border-slate-700 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">Total</span>
              <span className="text-[26px] font-bold tracking-tight tabular-nums text-gray-900 dark:text-white">{formatCurrency(form.amount, currencyState)}</span>
            </div>
            {currencyState !== 'ARS' && Number(exchangeRate) > 0 && (
              <p className="text-right text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                ≈ {formatCurrency(form.amount * Number(exchangeRate), 'ARS')} a {Number(exchangeRate).toLocaleString('es-AR')}
              </p>
            )}
          </div>

          {/* Condición / forma de pago. "Cuenta corriente" (solo factura standalone)
              equivale a CUENTA_CORRIENTE: genera deuda y se paga luego vía Orden de Pago. */}
          <fieldset className="space-y-2">
            <legend className={labelCls + ' font-semibold text-gray-700 dark:text-slate-300'}>Pago</legend>
            {standalone && (
              <div className="flex gap-1.5">
                <button type="button" aria-pressed={saleCondition === 'CONTADO'} onClick={() => setSaleCondition('CONTADO')} className={segBtn(saleCondition === 'CONTADO')}>Contado</button>
                <button type="button" aria-pressed={saleCondition === 'CUENTA_CORRIENTE'} onClick={() => setSaleCondition('CUENTA_CORRIENTE')} className={segBtn(saleCondition === 'CUENTA_CORRIENTE')}>Cuenta corriente</button>
              </div>
            )}
            {(!standalone || saleCondition === 'CONTADO') && (
              <select className={inputCls} aria-label="Forma de pago" value={form.paymentMethod}
                onChange={(e) => set('paymentMethod', e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              {standalone && saleCondition === 'CUENTA_CORRIENTE'
                ? 'Queda en la cuenta del proveedor, para pagar después con una orden de pago.'
                : 'Pagada al contado (igual figura en la cuenta corriente del proveedor).'}
            </p>
          </fieldset>

          {costChanges > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {costChanges} producto{costChanges === 1 ? '' : 's'} cambia{costChanges === 1 ? '' : 'n'} de costo: al guardar te preguntamos si los actualizás.
            </p>
          )}

          {!isValid && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" /> Falta para poder guardar
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-red-800 dark:text-red-300">
                {missing.map((m) => <li key={m}>· {m}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={attemptClose} disabled={isLoading}>Cancelar</Button>
              <Button className="flex-[2]" onClick={handleSaveClick} isLoading={isLoading || checkingCosts} disabled={!isValid}>
                {existing ? 'Guardar cambios' : 'Guardar factura'}
              </Button>
            </div>
            {isDraftMode && isDirty && (
              <button type="button" onClick={() => setConfirmAction('discard')}
                className="w-full text-xs text-gray-500 hover:text-red-600 transition-colors">
                Descartar borrador
              </button>
            )}
          </div>
        </aside>

        </div>

        {/* Confirmación de cierre / descarte (overlay sobre el panel) */}
        {confirmAction && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmAction(null)} />
            <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
                {confirmAction === 'discard' ? '¿Descartar el borrador?' : 'Cerrar sin guardar'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4 leading-relaxed">
                {confirmAction === 'discard'
                  ? 'Se borrarán los datos cargados de esta factura. Esta acción no se puede deshacer.'
                  : 'Tus datos quedan guardados como borrador y se restauran cuando vuelvas a abrir el formulario.'}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
                  {confirmAction === 'discard' ? 'Cancelar' : 'Seguir editando'}
                </Button>
                <Button
                  size="sm"
                  variant={confirmAction === 'discard' ? 'danger' : 'primary'}
                  onClick={handleConfirm}
                >
                  {confirmAction === 'discard' ? 'Descartar' : 'Cerrar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {costReview && (
          <PurchaseCostReview
            candidates={costReview}
            currency={currencyState}
            isLoading={isLoading}
            onCancel={() => setCostReview(null)}
            onConfirm={(update) => save(update)}
          />
        )}
      </div>

      <ProductPickerModal
        isOpen={picker !== null}
        onClose={() => setPicker(null)}
        multiple={picker === 'multi'}
        selectedId={typeof picker === 'number' ? (items[picker]?.productId ?? null) : null}
        supplierId={supplierId || null}
        supplierName={suppliers.find((s) => s.id === supplierId)?.name}
        currency={currencyState}
        exchangeRate={currencyState === 'ARS' ? 1 : exchangeRate}
        onSelect={(picked) => {
          if (picker === 'multi') addItemsFromProducts(picked);
          else if (typeof picker === 'number' && picked[0]) selectProduct(picker, picked[0].id, picked[0]);
        }}
      />
    </div>
  );
}
