import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Calculator, AlertTriangle, Info, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Modal } from '../../components/ui';
import { PageHeader, BarcodeProductInput, ProductSearchSelect, CustomerSearchSelect, ConfirmDialog, ImportFromOPModal } from '../../components/shared';
import type { ImportedItem } from '../../components/shared';
import type { BarcodeProductInputHandle } from '../../components/shared';
import { useFormKeyboardShortcuts } from '../../hooks/useFormKeyboardShortcuts';
import { invoicesService, customersService, productsService, appSettingsService, stockService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { INVOICE_TYPE_OPTIONS, PAYMENT_TERMS_OPTIONS, CASH_ID_THRESHOLD, DEFERRED_PAYMENT_DAYS } from '../../utils/constants';
import { getDefaultInvoiceType } from '../../utils/getDefaultInvoiceType';
import type { Customer, Product, InvoiceType, Invoice, CreateReciboDTO } from '../../types';
import { INVOICE_TYPES } from '../../utils/constants';

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

const invoiceItemSchema = z.object({
  productId: z.string().min(1, 'Seleccioná un producto'),
  quantity: z.coerce.number().positive('> 0'),
  unitPrice: z.coerce.number().min(0, '>= 0'),
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
      items: [{ productId: '', quantity: 1, unitPrice: 0, taxRate: 21 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const barcodeRef = useRef<BarcodeProductInputHandle>(null);
  const prefilledRef = useRef(false);

  const appendItem = () => append({ productId: '', quantity: 1, unitPrice: 0, taxRate: 21 });

  useFormKeyboardShortcuts({
    onSubmit: () => handleSubmit(onSubmit)(),
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
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        taxRate: Number(item.taxRate),
      })),
    });
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
    const customer = customers.find((c) => c.id === customerId);
    if (type.startsWith('FACTURA_')) {
      const autoType = getDefaultInvoiceType(customer?.taxCondition ?? null, companyTaxCondition);
      if (autoType !== type) setValue('type', autoType);
    }
    if (customer?.saleCondition === 'CUENTA_CORRIENTE') {
      setValue('saleCondition', 'CUENTA_CORRIENTE');
      setValue('paymentTerms', 'Cuenta Corriente');
    } else {
      setValue('saleCondition', 'CONTADO');
      setValue('paymentTerms', null);
    }
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersData, productsData, settingsData] = await Promise.all([
          customersService.getAll({ limit: 1000, isActive: true }),
          productsService.getAll({ limit: 1000 }),
          appSettingsService.get().catch(() => null),
        ]);
        setCustomers(customersData.data);
        setProducts(productsData.data);
        if (settingsData?.companyTaxCondition) {
          setCompanyTaxCondition(settingsData.companyTaxCondition);
        }
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
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            taxRate: Number(item.taxRate),
          })),
        });
      } catch {
        toast.error('Error al cargar factura');
        navigate('/invoices');
      } finally {
        setIsFetching(false);
      }
    };
    fetchInvoice();
  }, [id, isEditing, reset, navigate]);

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.productId`, productId);
      setValue(`items.${index}.unitPrice`, product.price);
      setValue(`items.${index}.taxRate`, product.taxRate);
    }
  };

  const handleBarcodeAdd = (product: Product) => {
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      setValue(`items.${existingIndex}.quantity`, Number(items[existingIndex].quantity) + 1);
    } else {
      append({ productId: product.id, quantity: 1, unitPrice: product.price, taxRate: product.taxRate });
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
        append({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate });
      }
    });
    if (skippedCount > 0) {
      toast(`${importedItems.length} ítem${importedItems.length !== 1 ? 's' : ''} importado${importedItems.length !== 1 ? 's' : ''}. ${skippedCount} omitido${skippedCount !== 1 ? 's' : ''} por no tener producto.`, { icon: '⚠️' });
    } else {
      toast.success(`${importedItems.length} ítem${importedItems.length !== 1 ? 's' : ''} importado${importedItems.length !== 1 ? 's' : ''}`);
    }
  };

  const calcItemTotal = (item: typeof items[0]) => {
    const sub = item.quantity * item.unitPrice;
    return sub + sub * (item.taxRate / 100);
  };

  const totals = items.reduce(
    (acc, item) => {
      const sub = item.quantity * item.unitPrice;
      const tax = sub * (item.taxRate / 100);
      return { subtotal: acc.subtotal + sub, taxAmount: acc.taxAmount + tax };
    },
    { subtotal: 0, taxAmount: 0 }
  );
  const grandTotal = totals.subtotal + totals.taxAmount;

  // ── Derived warnings ────────────────────────────────────────────────────
  const selectedCustomer = customers.find((c) => c.id === customerId);
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
      const productQuantities = new Map<string, number>();
      for (const item of data.items) {
        if (item.productId) {
          productQuantities.set(item.productId, (productQuantities.get(item.productId) ?? 0) + item.quantity);
        }
      }
      if (productQuantities.size > 0) {
        const checks = await Promise.all(
          Array.from(productQuantities.entries()).map(async ([productId, requestedQty]) => {
            try {
              const stocks = await stockService.getProductStock(productId);
              const available = stocks.reduce((sum, s) => sum + (Number(s.quantity) - Number(s.reservedQuantity)), 0);
              return { productId, requestedQty, available };
            } catch {
              return { productId, requestedQty, available: Infinity };
            }
          })
        );
        const warnings = checks
          .filter(({ requestedQty, available }) => requestedQty > available)
          .map(({ productId, requestedQty, available }) => {
            const product = products.find((p) => p.id === productId);
            return { productName: product?.name ?? productId, requested: requestedQty, available };
          });
        if (warnings.length > 0) {
          setStockWarnings(warnings);
          return;
        }
      }
    }
    setIsLoading(true);
    try {
      if (isEditing) {
        await invoicesService.update(id, { ...data, currency: 'ARS', exchangeRate: 1, saleCondition: data.saleCondition, stockBehavior: data.stockBehavior, date: data.date, originInvoiceId: data.originInvoiceId ?? null });
        toast.success('Factura actualizada');
        navigate(`/invoices/${id}`);
      } else {
        const invoice = await invoicesService.create({ ...data, currency: 'ARS', exchangeRate: 1, saleCondition: data.saleCondition, stockBehavior: data.stockBehavior, date: data.date, originInvoiceId: data.originInvoiceId ?? null });
        toast.success('Factura creada');
        if (registerPayment) {
          setCreatedInvoiceId(invoice.id);
        } else {
          navigate(`/invoices/${invoice.id}`);
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar factura');
    } finally {
      setIsLoading(false);
    }
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

  return (
    <div>
      <PageHeader
        title={pageTitle}
        backTo={isEditing ? `/invoices/${id}` : '/invoices'}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── Left: items + notes ── */}
          <div className="space-y-4 min-w-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ítems</h2>
                <div className="flex items-center gap-2">
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
                <div className="hidden md:grid grid-cols-[3fr_72px_104px_60px_88px_32px] gap-3 pb-2 mb-1 border-b border-gray-100 dark:border-slate-700">
                  {['Producto', 'Cant.', 'Precio unit.', 'IVA %', 'Total', ''].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Item rows */}
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 md:grid-cols-[3fr_72px_104px_60px_88px_32px] gap-3 items-center py-3"
                    >
                      {/* Product */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Producto *</label>
                        <ProductSearchSelect
                          products={products}
                          value={items[index]?.productId || ''}
                          onChange={(value) => handleProductChange(index, value)}
                          error={errors.items?.[index]?.productId?.message}
                        />
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

                      {/* Tax rate */}
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

                      {/* Total */}
                      <div className="text-right">
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Total</label>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(
                            calcItemTotal(items[index] || { quantity: 0, unitPrice: 0, taxRate: 0 }),
                            'ARS'
                          )}
                        </span>
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
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
              <CustomerSearchSelect
                customers={customers}
                value={customerId}
                onChange={(id) => setValue('customerId', id)}
                label="Cliente *"
                error={errors.customerId?.message}
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

              <Select
                label="Condición de venta"
                options={PAYMENT_TERMS_OPTIONS}
                value={
                  saleCondition === 'CUENTA_CORRIENTE' && watch('paymentTerms') === 'Cuenta Corriente'
                    ? 'CUENTA_CORRIENTE'
                    : (watch('paymentTerms') ?? '')
                }
                onChange={(v) => {
                  if (v === 'CUENTA_CORRIENTE') {
                    setValue('saleCondition', 'CUENTA_CORRIENTE');
                    setValue('paymentTerms', 'Cuenta Corriente');
                  } else if (DEFERRED_PAYMENT_DAYS[v]) {
                    setValue('saleCondition', 'CUENTA_CORRIENTE');
                    setValue('paymentTerms', v);
                    const due = new Date();
                    due.setDate(due.getDate() + DEFERRED_PAYMENT_DAYS[v]);
                    setValue('dueDate', due.toISOString().substring(0, 10));
                  } else {
                    setValue('saleCondition', 'CONTADO');
                    setValue('paymentTerms', v || null);
                  }
                }}
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
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-slate-400">IVA</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(totals.taxAmount, 'ARS')}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-gray-200 dark:border-slate-700">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {formatCurrency(grandTotal, 'ARS')}
                  </span>
                </div>
              </div>
            </div>

            {/* Register payment at creation — hidden for CC/deferred (movement auto-created) */}
            {!isEditing && saleCondition !== 'CUENTA_CORRIENTE' && (
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
                    checked={registerPayment}
                    onChange={(e) => setRegisterPayment(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Registrar pago al crear</span>
                </label>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <Button type="submit" isLoading={isLoading} className="w-full justify-center">
                {isEditing ? 'Guardar cambios' : 'Crear factura'}
                <kbd className="ml-1.5 text-[10px] font-mono font-normal opacity-60 px-1 py-0.5 rounded bg-white/20 border border-white/30 leading-none">Ctrl+↵</kbd>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => navigate(isEditing ? `/invoices/${id}` : '/invoices')}
              >
                Cancelar
              </Button>
            </div>
          </div>

        </div>
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

      <ConfirmDialog
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={() => navigate(isEditing ? `/invoices/${id}` : '/invoices')}
        variant="warning"
        title="¿Salir sin guardar?"
        message="Los cambios que no hayas guardado se perderán."
        confirmText="Salir"
        cancelText="Seguir editando"
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
