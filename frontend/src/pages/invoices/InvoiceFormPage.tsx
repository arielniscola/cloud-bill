import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import type { FieldErrors, UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Calculator, AlertTriangle, Info, ClipboardList, Search, ChevronDown, FileText, Send, Zap, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Modal } from '../../components/ui';
import { PageHeader, BarcodeProductInput, ProductSearchSelect, ProductCatalogModal, CustomerSearchSelect, ConfirmDialog, ImportFromOPModal } from '../../components/shared';
import type { ImportedItem } from '../../components/shared';
import type { BarcodeProductInputHandle } from '../../components/shared';
import { useFormKeyboardShortcuts } from '../../hooks/useFormKeyboardShortcuts';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAuthStore } from '../../stores/auth.store';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import { invoicesService, customersService, productsService, appSettingsService, stockService, productVariantsService, warehousesService, afipService } from '../../services';
import type { ProductVariant } from '../../types/product-variant.types';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { INVOICE_TYPE_OPTIONS, PAYMENT_TERMS_OPTIONS, CASH_ID_THRESHOLD, DEFERRED_PAYMENT_DAYS } from '../../utils/constants';
import { getDefaultInvoiceType } from '../../utils/getDefaultInvoiceType';
import type { Customer, Product, InvoiceType, Invoice, CreateReciboDTO, Warehouse, Stock } from '../../types';
import { INVOICE_TYPES } from '../../utils/constants';
import InvoiceFastLayout from './InvoiceFastLayout';

const NC_TYPE_MAP: Partial<Record<InvoiceType, InvoiceType>> = {
  FACTURA_A: 'NOTA_CREDITO_A',
  FACTURA_B: 'NOTA_CREDITO_B',
  FACTURA_C: 'NOTA_CREDITO_C',
};

const ND_TYPE_MAP: Partial<Record<InvoiceType, InvoiceType>> = {
  FACTURA_A: 'NOTA_DEBITO_A',
  FACTURA_B: 'NOTA_DEBITO_B',
  FACTURA_C: 'NOTA_DEBITO_C',
};
import { PaymentModal } from '../../components/shared';

/** Qué hacer al confirmar el formulario. */
type SubmitAction = 'draft' | 'issue' | 'arca';

const SUBMIT_ACTION_KEY = 'cloud-bill:invoice-submit-action';
/**
 * Layout del formulario, elegido por el usuario y recordado en este navegador.
 * `classic` es la vista de siempre (grilla + sidebar); `fast` es la carga
 * rápida: comprobante plegado, buscador protagonista y filas grandes.
 */
const LAYOUT_KEY = 'cloud-bill:invoice-layout';
type FormLayout = 'classic' | 'fast';
/**
 * Dentro de la carga rápida, si la lista arranca en modo columnas editables.
 * Es preferencia del usuario, no de la factura: quien negocia precios lo deja
 * prendido y nunca ve el modo compacto.
 */
const PRICE_EDIT_KEY = 'cloud-bill:invoice-price-edit';
/**
 * Borrador local de la factura nueva, por si se cierra la pestaña sin guardar.
 * La clave se scopea por empresa y modo fiscal: con el selector de empresa un
 * borrador de otra empresa trae un `customerId` que ahí no existe, y un
 * borrador FORMAL no corresponde ofrecerlo en INFORMAL (ni al revés).
 */
const localDraftKey = (companyId: string | null | undefined, fiscalMode: string) =>
  `cloud-bill:invoice-draft:new:${companyId ?? 'sin-empresa'}:${fiscalMode}`;
/** Pasado un día el borrador local deja de ofrecerse: ya no es lo que el usuario tenía en mente. */
const LOCAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface LocalDraft {
  savedAt: number;
  customerName: string;
  itemCount: number;
  values: Partial<InvoiceFormData>;
  discountType: '%' | '$';
  discountValue: number;
  hasPerItemDiscount: boolean;
  warehouseId: string;
}

function readLocalDraft(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as LocalDraft;
    if (!draft?.savedAt || Date.now() - draft.savedAt > LOCAL_DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function clearLocalDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

/**
 * Disponible = Σ (cantidad − reservado). Un registro con la cantidad o el
 * reservado nulos no debe envenenar la suma con NaN (se mostraba "Disp. NaN").
 */
function sumAvailable(stocks: Stock[]): number {
  return stocks.reduce((sum, s) => {
    const qty = Number(s.quantity);
    const reserved = Number(s.reservedQuantity);
    return sum + ((Number.isFinite(qty) ? qty : 0) - (Number.isFinite(reserved) ? reserved : 0));
  }, 0);
}

function errorMessage(error: unknown): string | undefined {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
}

const invoiceItemSchema = z.object({
  productId: z.string().min(1, 'Seleccioná un producto'),
  variantId: z.string().nullable().optional(),
  quantity: z.coerce.number().positive('> 0'),
  unitPrice: z.coerce.number().min(0, '>= 0'),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxRate: z.coerce.number().min(0).max(100),
});

const invoiceSchema = z.object({
  type: z.enum([
    'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
    'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C',
    'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C',
  ]),
  customerId: z.string().min(1, 'Seleccioná un cliente'),
  date: z.string().optional(),
  isService: z.boolean().default(false),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).default('DISCOUNT'),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  originInvoiceId: z.string().uuid().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, 'Agrega al menos un ítem'),
}).superRefine((data, ctx) => {
  const isNcNd = data.type.startsWith('NOTA_CREDITO_') || data.type.startsWith('NOTA_DEBITO_');
  if (isNcNd && !data.originInvoiceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Seleccioná el comprobante de origen',
      path: ['originInvoiceId'],
    });
  }
});

type InvoiceFormData = z.output<typeof invoiceSchema>;

function SkeletonForm() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start animate-pulse">
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-16" />
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
      </div>
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-32" />
        <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
        <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
        <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
        <div className="h-24 bg-gray-100 dark:bg-slate-700 rounded-lg mt-4" />
      </div>
    </div>
  );
}

/**
 * Botón partido de confirmación: la acción principal es la última que usó el
 * usuario y el resto queda en el desplegable. Evita el rodeo de crear el
 * borrador y tener que emitirlo desde la pantalla de detalle.
 */
function SubmitSplitButton({
  action, options, isLoading, disabled, onSelect, onSubmit,
}: {
  action: SubmitAction;
  options: Array<{ value: SubmitAction; label: string; hint: string; icon: typeof Send; disabledReason?: string }>;
  isLoading: boolean;
  disabled?: boolean;
  onSelect: (action: SubmitAction) => void;
  onSubmit: (action: SubmitAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape cierra el menú y no debe llegar al atajo global de "cancelar",
    // que abriría la confirmación de salida.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === action) ?? options[0];

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex">
        <Button
          type="button"
          isLoading={isLoading}
          disabled={disabled}
          onClick={() => onSubmit(current.value)}
          className="flex-1 justify-center rounded-r-none"
        >
          {current.label}
          <kbd className="ml-1.5 text-[10px] font-mono font-normal opacity-60 px-1 py-0.5 rounded bg-white/20 border border-white/30 leading-none">Ctrl+↵</kbd>
        </Button>
        <Button
          type="button"
          disabled={disabled || isLoading}
          aria-label="Más opciones de guardado"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          className="rounded-l-none border-l border-white/25 px-2.5"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 w-full min-w-[260px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-20"
        >
          {options.map((option) => {
            const Icon = option.icon;
            const isDisabled = !!option.disabledReason;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                disabled={isDisabled}
                title={option.disabledReason}
                onClick={() => {
                  setOpen(false);
                  onSelect(option.value);
                  onSubmit(option.value);
                }}
                className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-indigo-50 dark:hover:bg-slate-700/60'
                } ${option.value === action ? 'bg-indigo-50/60 dark:bg-slate-700/40' : ''}`}
              >
                <Icon className="w-4 h-4 mt-0.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">{option.label}</span>
                  <span className="block text-xs text-gray-500 dark:text-slate-400 leading-snug">
                    {option.disabledReason ?? option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InvoiceFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditing = !!id;
  const creditNoteFrom = (location.state as { creditNoteFrom?: Invoice; debitNoteFrom?: Invoice } | null)?.creditNoteFrom;
  const debitNoteFrom = (location.state as { creditNoteFrom?: Invoice; debitNoteFrom?: Invoice } | null)?.debitNoteFrom;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [originInvoices, setOriginInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companyTaxCondition, setCompanyTaxCondition] = useState<string>('RESPONSABLE_INSCRIPTO');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [registerPayment, setRegisterPayment] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<Array<{ productName: string; requested: number; available: number }>>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [discountType, setDiscountType] = useState<'%' | '$'>('%');
  const [discountValue, setDiscountValue] = useState(0);
  // El comprobante cargado puede traer un descuento distinto por línea (p. ej.
  // generado por un abono). Mientras sea así se respeta tal cual: el control
  // global recién los unifica cuando el usuario lo toca.
  const [hasPerItemDiscount, setHasPerItemDiscount] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  // Los productos elegidos con búsqueda server-side no están en `products`;
  // se cachean para poder nombrarlos en los avisos de stock.
  const [productCache, setProductCache] = useState<Record<string, Product>>({});
  const [customerCache, setCustomerCache] = useState<Record<string, Customer>>({});
  const [submitAction, setSubmitAction] = useState<SubmitAction>(() => {
    const stored = localStorage.getItem(SUBMIT_ACTION_KEY);
    return stored === 'draft' || stored === 'issue' || stored === 'arca' ? stored : 'issue';
  });
  const [showArcaConfirm, setShowArcaConfirm] = useState(false);
  const [layout, setLayout] = useState<FormLayout>(() =>
    localStorage.getItem(LAYOUT_KEY) === 'fast' ? 'fast' : 'classic'
  );
  const [priceEditMode, setPriceEditMode] = useState(() => localStorage.getItem(PRICE_EDIT_KEY) === '1');

  const chooseLayout = (next: FormLayout) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* noop */ }
  };

  const choosePriceEditMode = (next: boolean) => {
    setPriceEditMode(next);
    try { localStorage.setItem(PRICE_EDIT_KEY, next ? '1' : '0'); } catch { /* noop */ }
  };

  const { isInternetOnline } = useOnlineStatus();
  const fiscalMode = useFiscalModeStore((s) => s.mode);
  const companyId = useAuthStore((s) => s.user?.companyId ?? null);
  const draftKey = localDraftKey(companyId, fiscalMode);

  // Se lee de forma sincrónica en el primer render: el auto-guardado no debe
  // pisar el borrador antes de que el usuario decida si lo restaura.
  const [pendingDraft, setPendingDraft] = useState<LocalDraft | null>(
    () => (isEditing || creditNoteFrom || debitNoteFrom ? null : readLocalDraft(draftKey))
  );

  const {
    register, control, handleSubmit, setValue, watch, reset,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema) as any,
    defaultValues: {
      type: 'FACTURA_B',
      date: new Date().toISOString().substring(0, 10),
      isService: false,
      stockBehavior: 'DISCOUNT',
      saleCondition: 'CONTADO',
      paymentTerms: 'Contado',
      items: [{ productId: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 21 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const barcodeRef = useRef<BarcodeProductInputHandle>(null);
  const prefilledRef = useRef(false);
  const submitActionRef = useRef<SubmitAction>(submitAction);
  // Restaurar un borrador no debe disparar la autoselección por cliente: pisaría
  // el tipo de comprobante y la condición de venta que el usuario había elegido.
  // Se guarda el customerId restaurado en vez de un booleano "saltear una vez":
  // si el efecto no llega a dispararse (el cliente restaurado coincide con el
  // actual), un flag suelto se comería la siguiente autoselección legítima.
  const skipCustomerAutoForRef = useRef<string | null>(null);

  const appendItem = () => append({ productId: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 21 });

  useFormKeyboardShortcuts({
    onSubmit: () => runSubmit(effectiveAction),
    onAddItem: appendItem,
    onCancel: () => setShowExitConfirm(true),
    onDuplicateLastItem: () => {
      if (items.length === 0) return;
      append({ ...items[items.length - 1] });
    },
    onDeleteLastItem: () => {
      if (fields.length > 1) remove(fields.length - 1);
    },
    onFocusBarcode: () => barcodeRef.current?.focus(),
  });

  const type = watch('type') || 'FACTURA_B';
  const customerId = watch('customerId') || '';
  const items = watch('items');
  const saleCondition = watch('saleCondition');
  const stockBehavior = watch('stockBehavior') || 'DISCOUNT';
  const invoiceDate = watch('date');
  const isService = watch('isService');
  const originInvoiceId = watch('originInvoiceId');
  const isNcNd = type.startsWith('NOTA_CREDITO_') || type.startsWith('NOTA_DEBITO_');

  /**
   * Refleja en el control de descuento los porcentajes que trae un comprobante
   * cargado. Si todas las líneas comparten el mismo, se muestra como descuento
   * global; si difieren, se marca `hasPerItemDiscount` para no pisarlos.
   */
  const syncDiscountFromItems = (loaded: Array<{ discountPct?: number | string | null }>) => {
    const pcts = loaded.map((item) => Number(item.discountPct) || 0);
    const uniform = pcts.length > 0 && pcts.every((pct) => pct === pcts[0]);
    setHasPerItemDiscount(!uniform);
    setDiscountType('%');
    setDiscountValue(uniform ? pcts[0] : 0);
  };

  const cacheProducts = (loaded: Array<{ productId: string; product?: Product }>) => {
    const found = loaded.filter((item) => item.product);
    if (found.length === 0) return;
    setProductCache((prev) => ({
      ...prev,
      ...Object.fromEntries(found.map((item) => [item.productId, item.product as Product])),
    }));
  };

  const findProduct = (productId: string) =>
    productCache[productId] ?? products.find((p) => p.id === productId);

  // El cliente elegido por búsqueda server-side puede no estar en `customers`.
  const findCustomer = useCallback(
    (id: string) => customerCache[id] ?? customers.find((c) => c.id === id),
    [customerCache, customers]
  );

  // Pre-fill from credit/debit note origin once products are loaded
  useEffect(() => {
    const origin = creditNoteFrom ?? debitNoteFrom;
    if (!origin || isEditing || products.length === 0 || prefilledRef.current) return;
    prefilledRef.current = true;
    const noteType = creditNoteFrom
      ? NC_TYPE_MAP[origin.type as InvoiceType]
      : ND_TYPE_MAP[origin.type as InvoiceType];
    if (!noteType) return;
    const prefix = creditNoteFrom ? 'NC' : 'ND';
    reset({
      type: noteType,
      customerId: origin.customerId,
      date: new Date().toISOString().substring(0, 10),
      isService: false,
      saleCondition: (origin.saleCondition ?? 'CONTADO') as 'CONTADO' | 'CUENTA_CORRIENTE',
      originInvoiceId: origin.id,
      notes: `${prefix} por ${INVOICE_TYPES[origin.type]} ${origin.number}`,
      items: origin.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountPct: Number(item.discountPct) || 0,
        taxRate: Number(item.taxRate),
      })),
    });
    cacheProducts(origin.items);
    syncDiscountFromItems(origin.items);
    if (origin.customer) setCustomerCache((prev) => ({ ...prev, [origin.customerId]: origin.customer! }));
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load facturas available as origin for NC/ND
  useEffect(() => {
    if (!isNcNd || !customerId) {
      setOriginInvoices([]);
      return;
    }
    invoicesService.getAll({ customerId, limit: 500 })
      .then((res) => setOriginInvoices(
        res.data.filter((inv) => inv.type.startsWith('FACTURA_') && ['ISSUED', 'PAID', 'PARTIALLY_PAID'].includes(inv.status))
      ))
      .catch(() => {});
  }, [customerId, isNcNd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select invoice type + sale condition from customer
  useEffect(() => {
    if (isEditing || creditNoteFrom || debitNoteFrom) return;
    if (skipCustomerAutoForRef.current === customerId) { skipCustomerAutoForRef.current = null; return; }
    const customer = findCustomer(customerId);
    if (type.startsWith('FACTURA_')) {
      const autoType = getDefaultInvoiceType(customer?.taxCondition ?? null, companyTaxCondition);
      if (autoType !== type) setValue('type', autoType);
    }
    if (customer?.saleCondition === 'CUENTA_CORRIENTE') {
      setValue('saleCondition', 'CUENTA_CORRIENTE');
      setValue('paymentTerms', 'Cuenta Corriente');
    } else {
      setValue('saleCondition', 'CONTADO');
      setValue('paymentTerms', 'Contado');
    }
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersData, productsData, settingsData, warehousesData] = await Promise.all([
          // Solo la lista inicial del desplegable: el resto lo resuelve la
          // búsqueda server-side, que no está limitada por esta precarga.
          customersService.getAll({ limit: 50, isActive: true }),
          productsService.getAll({ limit: 1000 }),
          appSettingsService.get().catch(() => null),
          warehousesService.getAll().catch(() => [] as Warehouse[]),
        ]);
        setCustomers(customersData.data);
        setProducts(productsData.data);
        if (settingsData?.companyTaxCondition) {
          setCompanyTaxCondition(settingsData.companyTaxCondition);
        }
        // Depósito de stock: preselecciona el por defecto (o el único activo)
        // sin pisar el que ya trajo una factura en edición.
        const activeWarehouses = warehousesData.filter((w) => w.isActive);
        setWarehouses(activeWarehouses);
        const defWh = activeWarehouses.find((w) => w.isDefault) ?? (activeWarehouses.length === 1 ? activeWarehouses[0] : null);
        if (defWh) setWarehouseId((prev) => prev || defWh.id);
      } catch {
        toast.error('Error al cargar datos');
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    const fetchInvoice = async () => {
      try {
        const invoice = await invoicesService.getById(id);
        if (invoice.status !== 'DRAFT') {
          toast.error('Solo se pueden editar facturas en borrador');
          navigate(`/invoices/${id}`);
          return;
        }
        if ((invoice as any).warehouseId) setWarehouseId((invoice as any).warehouseId);
        reset({
          type: invoice.type,
          customerId: invoice.customerId,
          date: invoice.date ? invoice.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
          isService: false,
          stockBehavior: (invoice.stockBehavior as 'DISCOUNT' | 'RESERVE') ?? 'DISCOUNT',
          dueDate: invoice.dueDate ? invoice.dueDate.substring(0, 10) : null,
          notes: invoice.notes,
          paymentTerms: invoice.paymentTerms,
          saleCondition: invoice.saleCondition ?? 'CONTADO',
          originInvoiceId: invoice.originInvoiceId ?? null,
          items: invoice.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountPct: Number(item.discountPct) || 0,
            taxRate: Number(item.taxRate),
          })),
        });
        cacheProducts(invoice.items);
        syncDiscountFromItems(invoice.items);
        // Con la precarga acotada, el cliente de la factura puede no estar en
        // `customers`: sin esto el aviso de CUIT dispararía de más.
        if (invoice.customer) setCustomerCache((prev) => ({ ...prev, [invoice.customerId]: invoice.customer! }));
      } catch {
        toast.error('Error al cargar factura');
        navigate('/invoices');
      } finally {
        setIsFetching(false);
      }
    };
    fetchInvoice();
  }, [id, isEditing, reset, navigate]);

  // ── Borrador local ──────────────────────────────────────────────────────
  // Red de seguridad ante el cierre accidental de la pestaña. No reemplaza al
  // borrador del servidor: ese recién existe cuando se guarda la factura.
  const isLocalDraftMode = !isEditing && !creditNoteFrom && !debitNoteFrom;
  const draftSnapshot = JSON.stringify({
    values: watch(), discountType, discountValue, hasPerItemDiscount, warehouseId,
  });

  useEffect(() => {
    if (!isLocalDraftMode) return;
    const snapshot = JSON.parse(draftSnapshot) as Omit<LocalDraft, 'savedAt' | 'customerName' | 'itemCount'>;
    const draftItems = snapshot.values.items ?? [];
    // Elegir cliente o producto solo puede venir del usuario: sirve para
    // distinguir una carga real del formulario recién montado.
    const worthSaving = !!snapshot.values.customerId || draftItems.some((item) => item.productId);

    // El banner no puede congelar el auto-guardado. Si el usuario lo ignora y
    // arranca una factura nueva, esa carga pasa a ser el borrador vigente: de
    // lo contrario todo lo que escriba queda sin red hasta que lo conteste.
    if (pendingDraft) {
      if (!worthSaving) return;
      setPendingDraft(null);
      return;
    }

    if (!worthSaving) { clearLocalDraft(draftKey); return; }
    const timer = setTimeout(() => {
      const draft: LocalDraft = {
        ...snapshot,
        savedAt: Date.now(),
        customerName: findCustomer(snapshot.values.customerId ?? '')?.name ?? '',
        itemCount: draftItems.filter((item) => item.productId).length,
      };
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* quota */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [isLocalDraftMode, pendingDraft, draftSnapshot, findCustomer, draftKey]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    skipCustomerAutoForRef.current = pendingDraft.values.customerId ?? '';
    reset(pendingDraft.values as InvoiceFormData);
    setDiscountType(pendingDraft.discountType);
    setDiscountValue(pendingDraft.discountValue);
    setHasPerItemDiscount(pendingDraft.hasPerItemDiscount);
    if (pendingDraft.warehouseId) setWarehouseId(pendingDraft.warehouseId);
    setPendingDraft(null);
    toast.success('Borrador restaurado');
  };

  const discardDraft = () => {
    clearLocalDraft(draftKey);
    setPendingDraft(null);
  };

  // ── Stock por fila ──────────────────────────────────────────────────────
  // Se cachea el stock completo del producto (todos los depósitos y variantes)
  // y se filtra al mostrar, así cambiar de depósito no vuelve a pedir nada.
  const [stockByProduct, setStockByProduct] = useState<Record<string, Stock[] | 'loading' | 'error'>>({});

  const loadStockFor = async (productId: string) => {
    if (productId in stockByProduct) return;
    setStockByProduct((prev) => ({ ...prev, [productId]: 'loading' }));
    try {
      const stocks = await stockService.getProductStock(productId);
      setStockByProduct((prev) => ({ ...prev, [productId]: stocks }));
    } catch {
      // No se marca 0: no saber cuánto hay no es lo mismo que no haber.
      setStockByProduct((prev) => ({ ...prev, [productId]: 'error' }));
    }
  };

  /** Disponible (cantidad − reservado) en el depósito y la variante de la fila. */
  const stockFor = (productId: string, variantId: string | null):
    { state: 'loading' | 'error' } | { state: 'ok'; available: number } => {
    const entry = stockByProduct[productId];
    if (entry === undefined || entry === 'loading') return { state: 'loading' };
    if (entry === 'error') return { state: 'error' };
    return {
      state: 'ok',
      available: sumAvailable(entry
        .filter((s) => (!effectiveWarehouseId || s.warehouseId === effectiveWarehouseId)
          && (s.variantId ?? null) === variantId)),
    };
  };

  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, ProductVariant[]>>({});

  const loadVariantsFor = async (productId: string) => {
    if (variantsByProduct[productId]) return;
    try {
      const list = await productVariantsService.getByProduct(productId);
      setVariantsByProduct((prev) => ({ ...prev, [productId]: list }));
    } catch {
      setVariantsByProduct((prev) => ({ ...prev, [productId]: [] }));
    }
  };

  const handleProductChange = (index: number, productId: string, picked?: Product) => {
    const product = picked ?? products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.productId`, productId);
      setValue(`items.${index}.variantId`, null);
      setValue(`items.${index}.unitPrice`, product.price);
      setValue(`items.${index}.taxRate`, product.taxRate);
      setProductCache((prev) => ({ ...prev, [productId]: product }));
      void loadVariantsFor(productId);
      if (product.trackStock !== false) void loadStockFor(productId);
    }
  };

  // Pre-cargar variantes y stock cuando hay items con productId (modo edit /
  // NC/ND / borrador restaurado, donde no pasaron por handleProductChange).
  // Se depende del set de productos, no de la cantidad de filas: restaurar un
  // borrador de 1 ítem sobre la fila vacía inicial no cambia el largo, y así
  // quedaba sin variantes y con el stock "consultando" para siempre.
  const itemProductIds = Array.from(
    new Set(items.map((it: any) => it.productId).filter(Boolean) as string[])
  );
  const itemProductIdsKey = itemProductIds.join(',');

  useEffect(() => {
    itemProductIds.forEach((pid) => {
      if (!variantsByProduct[pid]) void loadVariantsFor(pid);
      if (!isNcNd && !(pid in stockByProduct)) void loadStockFor(pid);
    });
  }, [itemProductIdsKey, isNcNd]); // eslint-disable-line react-hooks/exhaustive-deps

  // El catálogo supera la precarga de 1000, así que un ítem restaurado de un
  // borrador (o traído de una factura) puede referir a un producto que no está
  // en memoria. La carga rápida muestra el nombre como texto — no dentro de un
  // selector que sepa resolverlo — así que hay que traerlo por id.
  useEffect(() => {
    itemProductIds
      .filter((pid) => !productCache[pid] && !products.some((p) => p.id === pid))
      .forEach((pid) => {
        productsService.getById(pid)
          .then((product) => setProductCache((prev) => (prev[pid] ? prev : { ...prev, [pid]: product })))
          .catch(() => { /* el nombre queda genérico; no bloquea la carga */ });
      });
  }, [itemProductIdsKey, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVariantChange = (index: number, variantId: string) => {
    const item = items[index];
    if (!item?.productId) return;
    const variant = (variantsByProduct[item.productId] ?? []).find((v) => v.id === variantId);
    setValue(`items.${index}.variantId`, variantId || null);
    if (variant && variant.priceOverride !== null && variant.priceOverride !== undefined) {
      setValue(`items.${index}.unitPrice`, Number(variant.priceOverride));
    }
  };

  const handleBarcodeAdd = (product: Product, qty: number = 1) => {
    setProductCache((prev) => ({ ...prev, [product.id]: product }));
    if (!isNcNd && product.trackStock !== false) void loadStockFor(product.id);
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      setValue(`items.${existingIndex}.quantity`, Number(items[existingIndex].quantity) + qty);
      return;
    }
    // Reutilizar la fila vacía inicial: si queda, su producto requerido bloquea el submit
    const emptyIndex = items.findIndex((item) => !item.productId && !Number(item.unitPrice));
    if (emptyIndex >= 0) {
      setValue(`items.${emptyIndex}.productId`, product.id);
      setValue(`items.${emptyIndex}.quantity`, qty);
      setValue(`items.${emptyIndex}.unitPrice`, product.price);
      setValue(`items.${emptyIndex}.discountPct`, 0);
      setValue(`items.${emptyIndex}.taxRate`, product.taxRate);
    } else {
      append({ productId: product.id, quantity: qty, unitPrice: product.price, discountPct: 0, taxRate: product.taxRate });
    }
  };

  const handleImportFromOP = (importedItems: ImportedItem[], skippedCount: number) => {
    // Replace empty placeholder item if form only has one empty item
    const currentItems = items;
    const onlyEmpty = currentItems.length === 1 && !currentItems[0].productId && !currentItems[0].quantity;
    if (onlyEmpty) remove(0);
    importedItems.forEach((item) => {
      const existingIndex = (onlyEmpty ? [] : currentItems).findIndex((i) => i.productId === item.productId);
      if (existingIndex >= 0) {
        setValue(`items.${existingIndex}.quantity`, Number(currentItems[existingIndex].quantity) + item.quantity);
      } else {
        append({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, discountPct: 0, taxRate: item.taxRate });
      }
    });
    if (skippedCount > 0) {
      toast(`${importedItems.length} ítem${importedItems.length !== 1 ? 's' : ''} importado${importedItems.length !== 1 ? 's' : ''}. ${skippedCount} omitido${skippedCount !== 1 ? 's' : ''} por no tener producto.`, { icon: '⚠️' });
    } else {
      toast.success(`${importedItems.length} ítem${importedItems.length !== 1 ? 's' : ''} importado${importedItems.length !== 1 ? 's' : ''}`);
    }
  };

  // Factura C does not carry IVA (no discrimination, no tax)
  const isTypeC = type.endsWith('_C');
  const itemGridCols = isTypeC
    ? 'grid-cols-1 md:grid-cols-[3fr_72px_104px_88px_32px]'
    : 'grid-cols-1 md:grid-cols-[3fr_72px_104px_60px_88px_32px]';
  const headerGridCols = isTypeC
    ? 'grid-cols-[3fr_72px_104px_88px_32px]'
    : 'grid-cols-[3fr_72px_104px_60px_88px_32px]';
  const headerLabels = isTypeC
    ? ['Producto', 'Cant.', 'Precio unit.', 'Total', '']
    : ['Producto', 'Cant.', 'Precio unit.', 'IVA %', 'Total', ''];

  const itemBase = (item: typeof items[0] | undefined) =>
    (Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0);

  const subtotalBase = items.reduce((acc, item) => acc + itemBase(item), 0);

  // El backend guarda el descuento como un porcentaje por ítem, así que el
  // descuento global en $ se expresa como el % equivalente sobre el subtotal.
  // Líneas y resumen se calculan con este mismo porcentaje: es lo que evita
  // que la columna "Total" no cierre con el total del comprobante.
  const globalDiscountPct = discountType === '%'
    ? Math.min(discountValue, 100)
    : (subtotalBase > 0 ? (Math.min(discountValue, subtotalBase) / subtotalBase) * 100 : 0);

  const itemDiscountPct = (index: number) =>
    hasPerItemDiscount ? Number(items[index]?.discountPct) || 0 : globalDiscountPct;

  const calcItemAmounts = (index: number) => {
    const item = items[index];
    const base = itemBase(item);
    const discount = (base * itemDiscountPct(index)) / 100;
    const net = base - discount;
    const tax = isTypeC ? 0 : net * ((Number(item?.taxRate) || 0) / 100);
    return { base, discount, net, tax, total: net + tax };
  };

  const totals = items.reduce(
    (acc, _item, index) => {
      const { base, discount, tax } = calcItemAmounts(index);
      return {
        subtotal: acc.subtotal + base,
        discountAmount: acc.discountAmount + discount,
        taxAmount: acc.taxAmount + tax,
      };
    },
    { subtotal: 0, discountAmount: 0, taxAmount: 0 }
  );
  const grandTotal = totals.subtotal - totals.discountAmount + totals.taxAmount;

  const setGlobalDiscount = (nextType: '%' | '$', nextValue: number) => {
    setHasPerItemDiscount(false);
    setDiscountType(nextType);
    setDiscountValue(nextValue);
  };

  // ── Handlers compartidos por los dos layouts ────────────────────────────
  const paymentTermsValue =
    saleCondition === 'CUENTA_CORRIENTE' && watch('paymentTerms') === 'Cuenta Corriente'
      ? 'CUENTA_CORRIENTE'
      : (watch('paymentTerms') ?? '');

  const handlePaymentTermsChange = (value: string) => {
    if (value === 'CUENTA_CORRIENTE') {
      setValue('saleCondition', 'CUENTA_CORRIENTE');
      setValue('paymentTerms', 'Cuenta Corriente');
    } else if (DEFERRED_PAYMENT_DAYS[value]) {
      setValue('saleCondition', 'CUENTA_CORRIENTE');
      setValue('paymentTerms', value);
      const due = new Date();
      due.setDate(due.getDate() + DEFERRED_PAYMENT_DAYS[value]);
      setValue('dueDate', due.toISOString().substring(0, 10));
    } else {
      setValue('saleCondition', 'CONTADO');
      setValue('paymentTerms', value || null);
    }
  };

  /** Elegir el comprobante de origen de una NC/ND ajusta la letra. */
  const handleOriginChange = (value: string) => {
    setValue('originInvoiceId', value || null);
    const origin = originInvoices.find((inv) => inv.id === value);
    if (!origin) return;
    const letter = origin.type.split('_')[1]; // A, B o C
    if (type.startsWith('NOTA_CREDITO_')) setValue('type', `NOTA_CREDITO_${letter}` as InvoiceType);
    else if (type.startsWith('NOTA_DEBITO_')) setValue('type', `NOTA_DEBITO_${letter}` as InvoiceType);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    setValue(`items.${index}.quantity`, quantity);
  };

  /**
   * Descuento tocado desde una línea. Pasa el comprobante a descuentos por
   * ítem: el control global recién los vuelve a unificar si el usuario lo usa.
   */
  const handleItemDiscountChange = (index: number, pct: number) => {
    if (!hasPerItemDiscount) {
      // Al pasar a por-línea, las demás filas conservan lo que estaban
      // mostrando (el porcentaje global), en vez de volver a cero.
      items.forEach((_item, i) => {
        if (i !== index) setValue(`items.${i}.discountPct`, itemDiscountPct(i));
      });
      setHasPerItemDiscount(true);
      setDiscountValue(0);
    }
    setValue(`items.${index}.discountPct`, Math.min(Math.max(pct, 0), 100));
  };

  // Depósito del que va a salir el stock. Si el comprobante no fija uno, el
  // backend cae al por defecto (o al primero activo): se replica acá para que
  // la verificación de stock mire el mismo depósito que el descuento real.
  const effectiveWarehouseId =
    warehouseId || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '';

  // ── Derived warnings ────────────────────────────────────────────────────
  const selectedCustomer = findCustomer(customerId);
  const needsCustomerId =
    saleCondition === 'CONTADO' &&
    grandTotal > CASH_ID_THRESHOLD &&
    !selectedCustomer?.taxId;

  const advanceDaysLimit = isService ? 10 : 5;
  const dateAdvanceWarning = (() => {
    if (!invoiceDate) return false;
    const diff = (new Date(invoiceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff > advanceDaysLimit;
  })();

  const onSubmit = async (data: InvoiceFormData) => {
    const isNcOrNd = data.type.startsWith('NOTA_CREDITO_') || data.type.startsWith('NOTA_DEBITO_');
    if (data.stockBehavior === 'DISCOUNT' && !isNcOrNd) {
      // El backend descuenta del depósito del comprobante y lleva el stock
      // separado por variante: hay que mirar exactamente ese bucket, no el
      // total del producto en todos los depósitos.
      const requested = new Map<string, { productId: string; variantId: string | null; qty: number }>();
      for (const item of data.items) {
        if (!item.productId) continue;
        const variantId = item.variantId ?? null;
        const key = `${item.productId}|${variantId ?? ''}`;
        const entry = requested.get(key);
        if (entry) entry.qty += Number(item.quantity) || 0;
        else requested.set(key, { productId: item.productId, variantId, qty: Number(item.quantity) || 0 });
      }
      if (requested.size > 0) {
        const productIds = Array.from(new Set(Array.from(requested.values(), (r) => r.productId)));
        const stockByProduct = new Map<string, Stock[] | null>();
        await Promise.all(
          productIds.map(async (productId) => {
            try {
              stockByProduct.set(productId, await stockService.getProductStock(productId));
            } catch {
              stockByProduct.set(productId, null); // sin dato: no bloquear la venta
            }
          })
        );
        const warnings: typeof stockWarnings = [];
        for (const { productId, variantId, qty } of requested.values()) {
          const stocks = stockByProduct.get(productId);
          if (!stocks) continue;
          const available = sumAvailable(stocks
            .filter((s) => (!effectiveWarehouseId || s.warehouseId === effectiveWarehouseId)
              && (s.variantId ?? null) === variantId));
          if (qty > available) {
            const product = findProduct(productId);
            const variant = variantId
              ? (variantsByProduct[productId] ?? []).find((v) => v.id === variantId)
              : null;
            warnings.push({
              productName: `${product?.name ?? productId}${variant ? ` · ${variant.name}` : ''}`,
              requested: qty,
              available,
            });
          }
        }
        if (warnings.length > 0) {
          setStockWarnings(warnings);
          return;
        }
      }
    }
    const action = submitActionRef.current;
    setIsLoading(true);
    try {
      const itemsWithDiscount = data.items.map((item) => ({
        ...item,
        discountPct: hasPerItemDiscount ? Number(item.discountPct) || 0 : globalDiscountPct,
      }));
      const payload = {
        ...data,
        items: itemsWithDiscount,
        currency: 'ARS' as const,
        exchangeRate: 1,
        saleCondition: data.saleCondition,
        stockBehavior: data.stockBehavior,
        date: data.date,
        originInvoiceId: data.originInvoiceId ?? null,
        warehouseId: warehouseId || null,
      };

      let invoiceId = id ?? '';
      try {
        if (isEditing) {
          await invoicesService.update(id, payload);
        } else {
          invoiceId = (await invoicesService.create(payload)).id;
        }
        // Solo el borrador de "factura nueva": editar o emitir una NC no debe
        // descartar una carga a medio hacer que quedó en otra pestaña.
        if (isLocalDraftMode) clearLocalDraft(draftKey);
      } catch (error: unknown) {
        toast.error(errorMessage(error) || 'Error al guardar factura');
        return;
      }

      // La emisión va después de guardar. Si falla, la factura ya quedó
      // persistida como borrador: se avisa y se navega al detalle para
      // reintentar desde ahí, sin perder la carga.
      if (action === 'draft') {
        toast.success(isEditing ? 'Borrador actualizado' : 'Borrador guardado');
      } else {
        try {
          if (action === 'arca') {
            const { invoice: emitted, warnings } = await afipService.emitInvoice(invoiceId);
            toast.success(`Factura emitida ante ARCA. CAE: ${emitted.cae}`);
            if (warnings) toast(`Observaciones ARCA: ${warnings}`, { icon: '⚠️', duration: 8000 });
          } else {
            await invoicesService.updateStatus(invoiceId, { status: 'ISSUED' });
            toast.success('Factura emitida');
          }
        } catch (error: unknown) {
          toast.error(
            `${errorMessage(error) || 'Error al emitir'} — la factura quedó guardada como borrador`,
            { duration: 8000 }
          );
          navigate(`/invoices/${invoiceId}`);
          return;
        }
      }

      if (!isEditing && registerPayment) setCreatedInvoiceId(invoiceId);
      else navigate(`/invoices/${invoiceId}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * React Hook Form ya enfoca el primer input con error, pero solo los que
   * pasan por register(): producto, cliente y comprobante de origen son
   * selects a medida y quedaban afuera, así que el submit no hacía nada
   * visible si el error estaba fuera de pantalla.
   */
  const onInvalid = (formErrors: FieldErrors<InvoiceFormData>) => {
    const itemErrors = Array.isArray(formErrors.items) ? formErrors.items : [];
    const productIndex = itemErrors.findIndex((itemError) => itemError?.productId);
    const targetId = productIndex >= 0
      ? `invoice-item-${productIndex}`
      : formErrors.customerId || formErrors.originInvoiceId
        ? 'invoice-meta'
        : null;
    if (targetId) {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const firstMessage =
      formErrors.customerId?.message ??
      formErrors.originInvoiceId?.message ??
      formErrors.items?.message ??
      itemErrors.find((itemError) => itemError)?.productId?.message ??
      'Revisá los campos marcados en rojo';
    toast.error(firstMessage);
  };

  const runSubmit = (action: SubmitAction) => {
    submitActionRef.current = action;
    // El CAE es irreversible: se confirma antes de crear, no después.
    if (action === 'arca') {
      void handleSubmit(() => setShowArcaConfirm(true), onInvalid)();
      return;
    }
    void handleSubmit(onSubmit, onInvalid)();
  };

  const chooseAction = (action: SubmitAction) => {
    setSubmitAction(action);
    try { localStorage.setItem(SUBMIT_ACTION_KEY, action); } catch { /* noop */ }
  };

  const handlePaymentConfirm = async (data: CreateReciboDTO) => {
    if (!createdInvoiceId) return;
    setIsPaymentLoading(true);
    try {
      await invoicesService.pay(createdInvoiceId, data);
      toast.success('Pago registrado');
      navigate(`/invoices/${createdInvoiceId}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setIsPaymentLoading(false);
    }
  };

  // ARCA no aplica en modo informal (el comprobante no es fiscal) ni sin
  // internet: se ofrece deshabilitado con el motivo, no oculto.
  const arcaDisabledReason = fiscalMode === 'INFORMAL'
    ? 'No disponible en modo informal'
    : !isInternetOnline
      ? 'Sin conexión a internet'
      : undefined;

  const submitOptions = [
    {
      value: 'issue' as const,
      label: isEditing ? 'Guardar y emitir' : 'Crear y emitir',
      hint: 'Genera stock y cuenta corriente. Sin CAE.',
      icon: Send,
    },
    {
      value: 'arca' as const,
      label: isEditing ? 'Guardar y facturar en ARCA' : 'Crear y facturar en ARCA',
      hint: 'Emite y obtiene el CAE en un solo paso.',
      icon: Zap,
      disabledReason: arcaDisabledReason,
    },
    {
      value: 'draft' as const,
      label: isEditing ? 'Guardar cambios' : 'Guardar borrador',
      hint: 'No genera movimientos. Editable después.',
      icon: FileText,
    },
  ];
  const effectiveAction: SubmitAction =
    submitAction === 'arca' && arcaDisabledReason ? 'issue' : submitAction;

  const pageTitle = isEditing ? 'Editar Factura'
    : creditNoteFrom ? 'Nueva Nota de Crédito'
    : debitNoteFrom ? 'Nueva Nota de Débito'
    : 'Nueva Factura';

  if (isFetching) return (
    <div>
      <PageHeader title={pageTitle} backTo={isEditing ? `/invoices/${id}` : '/invoices'} />
      <SkeletonForm />
    </div>
  );

  // Los dos layouts comparten confirmación y cobro: mismos botones, distinta
  // disposición — apilados en el sidebar clásico, en línea en el pie de la
  // carga rápida.
  const renderFormActions = (direction: 'stacked' | 'inline') => (
    <div className={direction === 'stacked' ? 'flex flex-col gap-2.5' : 'flex flex-row-reverse items-center gap-2.5'}>
      <SubmitSplitButton
        action={effectiveAction}
        options={submitOptions}
        isLoading={isLoading}
        onSelect={chooseAction}
        onSubmit={runSubmit}
      />
      <Button
        type="button"
        variant="outline"
        className={direction === 'stacked' ? 'w-full justify-center' : 'justify-center'}
        onClick={() => setShowExitConfirm(true)}
      >
        Cancelar
      </Button>
    </div>
  );

  const paymentToggle = !isEditing && saleCondition !== 'CUENTA_CORRIENTE' ? (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
        checked={registerPayment}
        onChange={(e) => setRegisterPayment(e.target.checked)}
      />
      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Registrar pago al crear</span>
    </label>
  ) : null;

  const layoutSwitch = (
    <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-slate-600 p-0.5 bg-white dark:bg-slate-800">
      {([
        ['classic', 'Clásico'],
        ['fast', 'Carga rápida'],
      ] as Array<[FormLayout, string]>).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => chooseLayout(value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            layout === value
              ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={pageTitle}
        backTo={isEditing ? `/invoices/${id}` : '/invoices'}
      />

      {pendingDraft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
          <RotateCcw className="w-4 h-4 text-indigo-500 shrink-0" />
          <p className="text-sm text-indigo-900 dark:text-indigo-200 min-w-0 flex-1">
            Quedó una factura sin terminar
            {pendingDraft.customerName ? ` de ${pendingDraft.customerName}` : ''}
            {pendingDraft.itemCount > 0
              ? ` con ${pendingDraft.itemCount} ${pendingDraft.itemCount === 1 ? 'ítem' : 'ítems'}`
              : ''}.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" size="sm" onClick={restoreDraft}>Restaurar</Button>
            <button
              type="button"
              onClick={discardDraft}
              className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 px-2 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Descartar
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end mb-3">{layoutSwitch}</div>

      <form onSubmit={(e) => { e.preventDefault(); runSubmit(effectiveAction); }}>
        {layout === 'fast' ? (
          <InvoiceFastLayout
            customers={customers}
            customerId={customerId}
            selectedCustomer={selectedCustomer}
            onCustomerChange={(pickedId, picked) => {
              if (picked) setCustomerCache((prev) => ({ ...prev, [pickedId]: picked }));
              setValue('customerId', pickedId);
            }}
            customerError={errors.customerId?.message}
            type={type}
            typeOptions={INVOICE_TYPE_OPTIONS}
            onTypeChange={(value) => setValue('type', value as InvoiceType)}
            typeError={errors.type?.message}
            isNcNd={isNcNd}
            isTypeC={isTypeC}
            originInvoices={originInvoices}
            originInvoiceId={originInvoiceId}
            onOriginChange={handleOriginChange}
            originError={errors.originInvoiceId?.message}
            paymentTermsValue={paymentTermsValue}
            paymentTermsOptions={PAYMENT_TERMS_OPTIONS}
            onPaymentTermsChange={handlePaymentTermsChange}
            saleCondition={saleCondition}
            invoiceDate={invoiceDate}
            isService={isService}
            stockBehavior={stockBehavior}
            onStockBehaviorChange={(next) => setValue('stockBehavior', next)}
            warehouses={warehouses}
            warehouseId={warehouseId}
            effectiveWarehouseId={effectiveWarehouseId}
            onWarehouseChange={setWarehouseId}
            needsCustomerId={needsCustomerId}
            cashIdThreshold={CASH_ID_THRESHOLD}
            dateAdvanceWarning={dateAdvanceWarning}
            advanceDaysLimit={advanceDaysLimit}
            register={register as unknown as (name: string) => UseFormRegisterReturn}
            products={products}
            fields={fields}
            items={items}
            itemErrors={Array.isArray(errors.items) ? errors.items : []}
            itemsError={errors.items?.message}
            findProduct={findProduct}
            variantsByProduct={variantsByProduct}
            stockFor={stockFor}
            calcItemAmounts={calcItemAmounts}
            itemDiscountPct={itemDiscountPct}
            onProductChange={handleProductChange}
            onVariantChange={handleVariantChange}
            onAddProduct={handleBarcodeAdd}
            onQuantityChange={handleQuantityChange}
            onItemDiscountChange={handleItemDiscountChange}
            onRemoveItem={remove}
            onOpenCatalog={() => setShowCatalog(true)}
            onOpenImport={!isEditing && !isNcNd && customerId ? () => setShowImportModal(true) : undefined}
            barcodeSlot={<BarcodeProductInput ref={barcodeRef} products={products} onAdd={handleBarcodeAdd} />}
            discountType={discountType}
            discountValue={discountValue}
            hasPerItemDiscount={hasPerItemDiscount}
            onGlobalDiscountChange={setGlobalDiscount}
            totals={totals}
            grandTotal={grandTotal}
            priceEditMode={priceEditMode}
            onPriceEditModeChange={choosePriceEditMode}
            actions={renderFormActions('inline')}
            paymentToggle={paymentToggle}
          />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── Left: items + notes ── */}
          <div className="space-y-4 min-w-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ítems</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCatalog(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Buscar producto
                  </button>
                  {!isEditing && !isNcNd && customerId && (
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Importar desde OP
                    </button>
                  )}
                  <BarcodeProductInput ref={barcodeRef} products={products} onAdd={handleBarcodeAdd} />
                </div>
              </div>

              <div className="px-5 py-3">
                {/* Column headers */}
                <div className={`hidden md:grid ${headerGridCols} gap-3 pb-2 mb-1 border-b border-gray-100 dark:border-slate-700`}>
                  {headerLabels.map((h, i) => (
                    <span key={`${h}-${i}`} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Item rows */}
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      id={`invoice-item-${index}`}
                      className={`grid ${itemGridCols} gap-3 items-center py-3`}
                    >
                      {/* Product */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Producto *</label>
                        <ProductSearchSelect
                          products={products}
                          value={items[index]?.productId || ''}
                          onChange={(value, picked) => handleProductChange(index, value, picked)}
                          error={errors.items?.[index]?.productId?.message}
                          serverSearch
                        />
                        {/* Disponible en el depósito y variante de la fila, antes
                            de guardar: el aviso de faltante ya no llega recién
                            al confirmar el comprobante. */}
                        {!isNcNd && items[index]?.productId && findProduct(items[index].productId)?.trackStock !== false && (() => {
                          const stock = stockFor(items[index].productId, items[index].variantId ?? null);
                          if (stock.state !== 'ok') {
                            return (
                              <span className="block mt-1 text-[10px] text-gray-300 dark:text-slate-600">
                                {stock.state === 'loading' ? 'Consultando stock…' : 'Stock no disponible'}
                              </span>
                            );
                          }
                          const available = stock.available;
                          const requested = Number(items[index]?.quantity) || 0;
                          const short = requested > available;
                          return (
                            <span
                              title={`Disponible en ${warehouses.find((w) => w.id === effectiveWarehouseId)?.name ?? 'el depósito'} (cantidad menos reservado)`}
                              className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${
                                short
                                  ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800'
                                  : available <= 0
                                    ? 'text-gray-500 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600'
                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800'
                              }`}
                            >
                              {short && <AlertTriangle className="w-2.5 h-2.5" />}
                              {available <= 0
                                ? 'Sin stock'
                                : `Disp. ${formatNumber(available, Number.isInteger(available) ? 0 : 2)}`}
                            </span>
                          );
                        })()}
                        {items[index]?.productId && (variantsByProduct[items[index].productId]?.length ?? 0) > 0 && (
                          <select
                            className="mt-1 w-full border border-violet-200 dark:border-violet-700 rounded-lg px-2 py-1 text-xs bg-violet-50 dark:bg-violet-900/20 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            value={(items[index] as any)?.variantId ?? ''}
                            onChange={(e) => handleVariantChange(index, e.target.value)}
                          >
                            <option value="">— Sin variante —</option>
                            {(variantsByProduct[items[index].productId] ?? []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.sku})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Cantidad</label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="1"
                          {...register(`items.${index}.quantity`)}
                          error={errors.items?.[index]?.quantity?.message}
                          onKeyDown={index === fields.length - 1 ? (e) => {
                            if (e.key === 'Tab' && !e.shiftKey) {
                              e.preventDefault();
                              appendItem();
                            }
                          } : undefined}
                        />
                      </div>

                      {/* Unit price */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Precio unit.</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...register(`items.${index}.unitPrice`)}
                          error={errors.items?.[index]?.unitPrice?.message}
                        />
                      </div>

                      {/* Tax rate — hidden for Factura C (no IVA) */}
                      {!isTypeC && (
                        <div>
                          <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">IVA %</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            {...register(`items.${index}.taxRate`)}
                          />
                        </div>
                      )}

                      {/* Total — ya neto del descuento, para que cierre con el resumen */}
                      <div className="text-right">
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Total</label>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(calcItemAmounts(index).total, 'ARS')}
                        </span>
                        {calcItemAmounts(index).discount > 0 && (
                          <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight mt-0.5">
                            -{formatCurrency(calcItemAmounts(index).discount, 'ARS')} ({itemDiscountPct(index).toFixed(2).replace(/\.?0+$/, '')}%)
                          </span>
                        )}
                      </div>

                      {/* Remove */}
                      <div className="flex justify-end">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="p-1.5 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add item */}
                <div className="pt-3 border-t border-gray-100 dark:border-slate-700 mt-2">
                  <button
                    type="button"
                    onClick={appendItem}
                    className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors duration-150 py-1"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                    <kbd className="ml-1 text-[10px] font-mono font-normal text-indigo-400 dark:text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 leading-none">Alt+A</kbd>
                  </button>
                  {errors.items?.message && (
                    <p className="text-xs text-red-500 mt-1">{errors.items.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Discount */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Descuento</p>
                  {hasPerItemDiscount ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      Este comprobante tiene descuentos distintos por línea. Si cargás un valor acá, se aplica a todos los ítems.
                    </p>
                  ) : totals.discountAmount > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {discountType === '%'
                        ? `${discountValue}% sobre el subtotal`
                        : `Importe fijo — equivale a ${globalDiscountPct.toFixed(2)}% por ítem`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Type toggle */}
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setGlobalDiscount('%', discountValue)}
                      className={`px-3 py-2 transition-colors ${discountType === '%' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >%</button>
                    <button
                      type="button"
                      onClick={() => setGlobalDiscount('$', discountValue)}
                      className={`px-3 py-2 border-l border-gray-200 dark:border-slate-600 transition-colors ${discountType === '$' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >$</button>
                  </div>
                  {/* Value input */}
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-shadow w-36">
                    <input
                      type="number"
                      min={0}
                      max={discountType === '%' ? 100 : undefined}
                      step={0.01}
                      value={discountValue || ''}
                      onChange={(e) => setGlobalDiscount(discountType, Number(e.target.value) || 0)}
                      placeholder="0"
                      className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none min-w-0"
                    />
                    <span className="flex items-center px-3 text-xs font-medium text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 border-l border-gray-200 dark:border-slate-600 select-none">
                      {discountType}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <Textarea
                label="Notas"
                placeholder="Condiciones, aclaraciones..."
                {...register('notes')}
                rows={3}
              />
            </div>
          </div>

          {/* ── Right: sticky sidebar ── */}
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Metadata */}
            <div id="invoice-meta" className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
              <CustomerSearchSelect
                customers={customers}
                value={customerId}
                onChange={(id, picked) => {
                  if (picked) setCustomerCache((prev) => ({ ...prev, [id]: picked }));
                  setValue('customerId', id);
                }}
                label="Cliente *"
                error={errors.customerId?.message}
                serverSearch
                searchParams={{ isActive: true }}
              />

              <Select
                label="Tipo de comprobante"
                options={INVOICE_TYPE_OPTIONS}
                value={type}
                onChange={(value) => setValue('type', value as InvoiceType)}
                error={errors.type?.message}
              />

              {/* Origin invoice selector for NC/ND */}
              {isNcNd && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                    Comprobante de origen *
                  </label>
                  <select
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150 bg-white dark:bg-slate-700 dark:text-slate-200 ${
                      (errors as any).originInvoiceId ? 'border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-900/10' : 'border-gray-300 dark:border-slate-600'
                    }`}
                    value={originInvoiceId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setValue('originInvoiceId', val || null);
                      const origin = originInvoices.find((inv) => inv.id === val);
                      if (origin) {
                        const letter = origin.type.split('_')[1]; // A, B or C
                        if (type.startsWith('NOTA_CREDITO_')) setValue('type', `NOTA_CREDITO_${letter}` as InvoiceType);
                        else if (type.startsWith('NOTA_DEBITO_')) setValue('type', `NOTA_DEBITO_${letter}` as InvoiceType);
                      }
                    }}
                  >
                    <option value="">— Seleccionar factura —</option>
                    {originInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number} · {inv.customer?.name ?? ''} · ${Number(inv.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                  {!customerId && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Seleccioná un cliente primero</p>
                  )}
                  {customerId && originInvoices.length === 0 && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Sin facturas disponibles para este cliente</p>
                  )}
                  {(errors as any).originInvoiceId && (
                    <p className="mt-1 text-xs text-red-500">{(errors as any).originInvoiceId.message}</p>
                  )}
                </div>
              )}

              {/* Customer ID warning */}
              {needsCustomerId && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-400">
                    Ventas en efectivo superiores a ${CASH_ID_THRESHOLD.toLocaleString('es-AR')} requieren identificar al cliente (CUIT/DNI). El cliente seleccionado no tiene CUIT registrado.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Fecha de emisión"
                  type="date"
                  readOnly
                  title="La fecha de emisión no es editable"
                  className="bg-gray-50 dark:bg-slate-800 cursor-not-allowed text-gray-500 dark:text-slate-400"
                  {...register('date')}
                />
                <Input
                  label="Fecha de vencimiento"
                  type="date"
                  {...register('dueDate')}
                />
              </div>

              {/* Advance date warning */}
              {dateAdvanceWarning && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-400">
                    La fecha seleccionada supera el límite de anticipación permitido ({advanceDaysLimit} días para {isService ? 'servicios' : 'bienes'}).
                  </p>
                </div>
              )}

              {/* Service toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  {...register('isService')}
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Comprobante de servicios</span>
                <span className="ml-auto">
                  <span title="Servicios permiten hasta 10 días de anticipación; bienes hasta 5 días."><Info className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" /></span>
                </span>
              </label>

              {/* Stock behavior — only for FACTURA types */}
              {!isNcNd && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
                    checked={stockBehavior === 'DISCOUNT'}
                    onChange={(e) => setValue('stockBehavior', e.target.checked ? 'DISCOUNT' : 'RESERVE')}
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-300">Descontar stock al crear</span>
                  <span className="ml-auto">
                    <span title={stockBehavior === 'DISCOUNT' ? 'El stock se descuenta inmediatamente al crear la factura.' : 'El stock se reserva al crear. Se descuenta al confirmar la entrega por remito.'}><Info className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" /></span>
                  </span>
                </label>
              )}

              {/* Depósito de stock — visible cuando hay más de uno */}
              {!isNcNd && warehouses.length > 1 && (
                <Select
                  label="Depósito de stock"
                  options={warehouses.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} (por defecto)` : w.name }))}
                  value={warehouseId}
                  onChange={(v) => setWarehouseId(v)}
                />
              )}

              <Select
                label="Condición de venta"
                options={PAYMENT_TERMS_OPTIONS}
                value={paymentTermsValue}
                onChange={handlePaymentTermsChange}
              />

            </div>

            {/* Totals */}
            <div className="bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Resumen</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Subtotal</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(totals.subtotal, 'ARS')}
                  </span>
                </div>
                {totals.discountAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-emerald-600 dark:text-emerald-400">Descuento</span>
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                      -{formatCurrency(totals.discountAmount, 'ARS')}
                    </span>
                  </div>
                )}
                {!isTypeC && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-slate-400">IVA</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                      {formatCurrency(totals.taxAmount, 'ARS')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2.5 border-t border-gray-200 dark:border-slate-700">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {formatCurrency(grandTotal, 'ARS')}
                  </span>
                </div>
              </div>
            </div>

            {/* Register payment at creation — hidden for CC/deferred (movement auto-created) */}
            {paymentToggle && (
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
                {paymentToggle}
              </div>
            )}

            {/* Actions */}
            {renderFormActions('stacked')}
          </div>

        </div>
        )}
      </form>

      <PaymentModal
        open={createdInvoiceId !== null}
        onClose={() => {
          if (createdInvoiceId) navigate(`/invoices/${createdInvoiceId}`);
          setCreatedInvoiceId(null);
        }}
        onSubmit={handlePaymentConfirm}
        remaining={grandTotal}
        currency="ARS"
        isLoading={isPaymentLoading}
        title="Registrar pago"
      />

      <ImportFromOPModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        customerId={customerId}
        onImport={handleImportFromOP}
      />

      <ProductCatalogModal
        isOpen={showCatalog}
        onClose={() => setShowCatalog(false)}
        products={products}
        onAdd={handleBarcodeAdd}
      />

      <ConfirmDialog
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={() => navigate(isEditing ? `/invoices/${id}` : '/invoices')}
        variant="warning"
        title="¿Salir sin guardar?"
        message={isLocalDraftMode
          ? 'La carga queda guardada en este navegador por 24 horas: al volver a "Nueva factura" vas a poder restaurarla.'
          : 'Los cambios que no hayas guardado se perderán.'}
        confirmText="Salir"
        cancelText="Seguir editando"
      />

      <ConfirmDialog
        isOpen={showArcaConfirm}
        onClose={() => setShowArcaConfirm(false)}
        onConfirm={() => { setShowArcaConfirm(false); void handleSubmit(onSubmit)(); }}
        variant="info"
        title="Facturar en ARCA"
        message={`Se va a guardar el comprobante por ${formatCurrency(grandTotal, 'ARS')} y solicitar el CAE a ARCA. Una vez autorizado no se puede anular: la corrección es por nota de crédito.`}
        confirmText="Emitir ante ARCA"
        cancelText="Volver"
      />

      <Modal isOpen={stockWarnings.length > 0} onClose={() => setStockWarnings([])} size="sm">
        <div className="flex flex-col items-center text-center">
          <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Sin stock suficiente</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
            No hay stock disponible para completar la venta de los siguientes productos:
          </p>
          <div className="w-full mb-5 text-left">
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider pb-1 border-b border-gray-100 dark:border-slate-700 mb-2">
              <span className="col-span-1">Producto</span>
              <span className="text-right">Pedido</span>
              <span className="text-right">Disponible</span>
            </div>
            {stockWarnings.map((w, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 text-sm py-1.5 border-b border-gray-50 dark:border-slate-800 last:border-0">
                <span className="col-span-1 font-medium text-gray-800 dark:text-slate-200 truncate" title={w.productName}>{w.productName}</span>
                <span className="text-right tabular-nums text-gray-600 dark:text-slate-300">{w.requested}</span>
                <span className="text-right tabular-nums text-red-600 dark:text-red-400 font-semibold">{w.available <= 0 ? '0' : w.available.toFixed(2).replace(/\.00$/, '')}</span>
              </div>
            ))}
          </div>
          <Button className="w-full justify-center" onClick={() => setStockWarnings([])}>
            Volver y corregir
          </Button>
        </div>
      </Modal>
    </div>
  );
}
