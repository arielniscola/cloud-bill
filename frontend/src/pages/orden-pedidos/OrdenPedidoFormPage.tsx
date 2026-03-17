import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { clsx } from 'clsx';
import { Plus, Trash2, Calculator, Info, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Modal } from '../../components/ui';
import { PageHeader, BarcodeProductInput, ProductSearchSelect, CustomerSearchSelect, ConfirmDialog, PaymentModal } from '../../components/shared';
import type { BarcodeProductInputHandle } from '../../components/shared';
import { useFormKeyboardShortcuts } from '../../hooks/useFormKeyboardShortcuts';
import { ordenPedidosService, customersService, productsService, appSettingsService, stockService, budgetsService } from '../../services';
import type { CreateReciboDTO, Budget, AppSettings } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { CURRENCY_OPTIONS, PAYMENT_TERMS_OPTIONS, DEFERRED_PAYMENT_DAYS } from '../../utils/constants';
import type { Customer, Product, Currency } from '../../types';

const ordenPedidoItemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().min(1, 'Requerida'),
  quantity: z.coerce.number().positive('> 0'),
  unitPrice: z.coerce.number().min(0, '>= 0'),
  taxRate: z.coerce.number().min(0).max(100),
});

const ordenPedidoSchema = z.object({
  customerId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).default('DISCOUNT'),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  items: z.array(ordenPedidoItemSchema).min(1, 'Agrega al menos un ítem'),
});

type OrdenPedidoFormData = z.output<typeof ordenPedidoSchema>;

function SkeletonForm() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start animate-pulse">
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-24" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          ))}
        </div>
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

export default function OrdenPedidoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const fromBudget = (location.state as { fromBudget?: Budget } | null)?.fromBudget ?? null;
  const isEditing = !!id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceSettings, setPriceSettings] = useState<Pick<AppSettings, 'stalePriceWarnDays1' | 'stalePriceWarnDays2'>>({ stalePriceWarnDays1: 10, stalePriceWarnDays2: 20 });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<Array<{ productName: string; requested: number; available: number }>>([]);
  const [registerPayment, setRegisterPayment] = useState(false);
  const [createdOpId, setCreatedOpId] = useState<string | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  const {
    register, control, handleSubmit, setValue, watch, reset, getValues,
    formState: { errors },
  } = useForm<OrdenPedidoFormData>({
    resolver: zodResolver(ordenPedidoSchema) as any,
    defaultValues: {
      currency: 'ARS',
      saleCondition: 'CONTADO',
      stockBehavior: 'DISCOUNT',
      items: [{ productId: null, description: '', quantity: 1, unitPrice: 0, taxRate: 21 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const barcodeRef = useRef<BarcodeProductInputHandle>(null);

  const appendItem = () => append({ productId: null, description: '', quantity: 1, unitPrice: 0, taxRate: 21 });

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

  const customerId = watch('customerId') || '';
  const currency = watch('currency') || 'ARS';
  const saleCondition = watch('saleCondition') || 'CONTADO';
  const items = watch('items');
  const stockBehavior = watch('stockBehavior') || 'DISCOUNT';

  // Auto-fill sale condition from customer
  useEffect(() => {
    if (isEditing) return;
    const customer = customers.find((c) => c.id === customerId);
    if (customer?.saleCondition === 'CUENTA_CORRIENTE') {
      setValue('saleCondition', 'CUENTA_CORRIENTE');
      setValue('paymentTerms', 'Cuenta Corriente');
    } else {
      setValue('saleCondition', 'CONTADO');
      setValue('paymentTerms', null);
    }
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When currency changes, update item prices
  useEffect(() => {
    if (products.length === 0) return;
    getValues('items').forEach((item, index) => {
      if (!item.productId) return;
      const product = products.find((p) => p.id === item.productId);
      if (!product) return;
      setValue(`items.${index}.unitPrice`, currency === 'USD' ? (product.salePriceUSD ?? 0) : product.price);
    });
  }, [currency]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (settingsData) {
          setPriceSettings({
            stalePriceWarnDays1: settingsData.stalePriceWarnDays1 ?? 10,
            stalePriceWarnDays2: settingsData.stalePriceWarnDays2 ?? 20,
          });
        }

        // Pre-fill from budget if navigated from a presupuesto
        if (fromBudget && !isEditing) {
          reset({
            customerId: fromBudget.customerId,
            notes: fromBudget.notes,
            paymentTerms: fromBudget.paymentTerms,
            saleCondition: 'CONTADO',
            stockBehavior: 'DISCOUNT',
            currency: fromBudget.currency,
            items: fromBudget.items.map((item) => ({
              productId: item.productId,
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              taxRate: Number(item.taxRate),
            })),
          });
        }
      } catch {
        toast.error('Error al cargar datos');
      }
    };
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isEditing) return;
    const fetchOp = async () => {
      try {
        const op = await ordenPedidosService.getById(id);
        if (op.status !== 'DRAFT') {
          toast.error('Solo se pueden editar órdenes en borrador');
          navigate(`/orden-pedidos/${id}`);
          return;
        }
        reset({
          customerId: op.customerId,
          dueDate: op.dueDate ? op.dueDate.substring(0, 10) : null,
          notes: op.notes,
          paymentTerms: op.paymentTerms,
          saleCondition: op.saleCondition ?? 'CONTADO',
          stockBehavior: (op.stockBehavior as 'DISCOUNT' | 'RESERVE') ?? 'DISCOUNT',
          currency: op.currency,
          items: op.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            taxRate: Number(item.taxRate),
          })),
        });
      } catch {
        toast.error('Error al cargar orden de pedido');
        navigate('/orden-pedidos');
      } finally {
        setIsFetching(false);
      }
    };
    fetchOp();
  }, [id, isEditing, reset, navigate]);

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.productId`, productId);
      setValue(`items.${index}.description`, product.name);
      setValue(`items.${index}.unitPrice`, currency === 'USD' ? (product.salePriceUSD ?? 0) : product.price);
      setValue(`items.${index}.taxRate`, product.taxRate);
    } else {
      setValue(`items.${index}.productId`, null);
    }
  };

  const handleBarcodeAdd = (product: Product) => {
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      setValue(`items.${existingIndex}.quantity`, Number(items[existingIndex].quantity) + 1);
    } else {
      append({ productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, taxRate: product.taxRate });
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

  // Returns 0 = ok, 1 = amber warning, 2 = red warning
  const getPriceStaleness = (productId: string | null | undefined): 0 | 1 | 2 => {
    if (!productId) return 0;
    const product = products.find((p) => p.id === productId);
    if (!product?.priceUpdatedAt) return 0;
    const days = Math.floor((Date.now() - new Date(product.priceUpdatedAt).getTime()) / 86_400_000);
    if (days >= priceSettings.stalePriceWarnDays2) return 2;
    if (days >= priceSettings.stalePriceWarnDays1) return 1;
    return 0;
  };

  const buildItemDTO = (item: typeof items[0]) => {
    const subtotal = item.quantity * item.unitPrice;
    const taxAmount = subtotal * (item.taxRate / 100);
    return {
      productId: item.productId || null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
    };
  };

  const onSubmit = async (data: OrdenPedidoFormData) => {
    if (data.stockBehavior === 'DISCOUNT') {
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
      const payload = {
        customerId: data.customerId || null,
        dueDate: data.dueDate || null,
        notes: data.notes || null,
        paymentTerms: data.paymentTerms || null,
        saleCondition: data.saleCondition,
        stockBehavior: data.stockBehavior,
        currency: data.currency,
        exchangeRate: 1,
        items: data.items.map(buildItemDTO),
      };
      if (isEditing) {
        await ordenPedidosService.update(id, payload);
        toast.success('Orden de pedido actualizada');
        navigate(`/orden-pedidos/${id}`);
      } else {
        const op = await ordenPedidosService.create(payload);
        // If created from a budget, mark it as CONVERTED
        if (fromBudget) {
          await budgetsService.updateStatus(fromBudget.id, { status: 'CONVERTED' }).catch(() => null);
        }
        toast.success('Orden de pedido creada');
        if (registerPayment) {
          setCreatedOpId(op.id);
        } else {
          navigate(`/orden-pedidos/${op.id}`);
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar orden de pedido');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentConfirm = async (data: CreateReciboDTO) => {
    if (!createdOpId) return;
    setIsPaymentLoading(true);
    try {
      await ordenPedidosService.pay(createdOpId, data);
      toast.success('Pago registrado');
      navigate(`/orden-pedidos/${createdOpId}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setIsPaymentLoading(false);
    }
  };

  if (isFetching) return (
    <div>
      <PageHeader title={isEditing ? 'Editar Orden de Pedido' : fromBudget ? `Nueva Orden de Pedido (desde ${fromBudget.number})` : 'Nueva Orden de Pedido'} backTo={isEditing ? `/orden-pedidos/${id}` : '/orden-pedidos'} />
      <SkeletonForm />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Orden de Pedido' : fromBudget ? `Nueva Orden de Pedido (desde ${fromBudget.number})` : 'Nueva Orden de Pedido'}
        backTo={isEditing ? `/orden-pedidos/${id}` : '/orden-pedidos'}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── Left column: items + notes ── */}
          <div className="space-y-4 min-w-0">
            {/* Items card */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ítems</h2>
                <BarcodeProductInput ref={barcodeRef} products={products} onAdd={handleBarcodeAdd} />
              </div>

              <div className="px-5 py-3">
                {/* Column headers */}
                <div className="hidden md:grid grid-cols-[2fr_3fr_72px_104px_60px_88px_32px] gap-3 pb-2 mb-1 border-b border-gray-100 dark:border-slate-700">
                  {['Producto', 'Descripción', 'Cant.', 'Precio unit.', 'IVA %', 'Total', ''].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Item rows */}
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {fields.map((field, index) => {
                    const staleness = getPriceStaleness(items[index]?.productId);
                    return (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 md:grid-cols-[2fr_3fr_72px_104px_60px_88px_32px] gap-3 items-center py-3"
                    >
                      {/* Product */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Producto</label>
                        <ProductSearchSelect
                          products={products}
                          value={items[index]?.productId || ''}
                          onChange={(value) => handleProductChange(index, value)}
                          optional
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 dark:text-slate-500 mb-1">Descripción *</label>
                        <Input
                          placeholder="Descripción del ítem"
                          {...register(`items.${index}.description`)}
                          error={errors.items?.[index]?.description?.message}
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
                        <div className={clsx(
                          'relative rounded-lg',
                          staleness === 2 && 'ring-2 ring-red-400 dark:ring-red-500',
                          staleness === 1 && 'ring-2 ring-amber-400 dark:ring-amber-400',
                        )}>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            {...register(`items.${index}.unitPrice`)}
                            error={errors.items?.[index]?.unitPrice?.message}
                          />
                          {staleness > 0 && (
                            <span
                              className={clsx(
                                'absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border border-white dark:border-slate-800',
                                staleness === 2 ? 'bg-red-500' : 'bg-amber-400',
                              )}
                              title={staleness === 2
                                ? `Precio sin actualizar hace más de ${priceSettings.stalePriceWarnDays2} días`
                                : `Precio sin actualizar hace más de ${priceSettings.stalePriceWarnDays1} días`
                              }
                            />
                          )}
                        </div>
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
                            currency
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
                    );
                  })}
                </div>

                {/* Add item button */}
                <div className="pt-3 border-t border-gray-100 dark:border-slate-700 mt-2">
                  <button
                    type="button"
                    onClick={appendItem}
                    className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors duration-150 py-1"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                    <kbd className="ml-1 text-[10px] font-mono font-normal text-indigo-400 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 leading-none">Alt+A</kbd>
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
                label="Notas internas"
                placeholder="Condiciones de entrega, aclaraciones..."
                {...register('notes')}
                rows={3}
              />
            </div>
          </div>

          {/* ── Right column: sticky metadata + totals + actions ── */}
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Metadata card */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
              <CustomerSearchSelect
                customers={customers}
                value={customerId}
                onChange={(id) => setValue('customerId', id || null)}
                label="Cliente"
                clearLabel="Sin cliente (consumidor final)"
              />

              <Input
                label="Fecha de entrega (opcional)"
                type="date"
                {...register('dueDate')}
              />

              <Select
                label="Condición de venta"
                options={PAYMENT_TERMS_OPTIONS}
                value={
                  watch('saleCondition') === 'CUENTA_CORRIENTE' && watch('paymentTerms') === 'Cuenta Corriente'
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

              <Select
                label="Moneda"
                options={CURRENCY_OPTIONS}
                value={watch('currency') || 'ARS'}
                onChange={(value) => setValue('currency', value as Currency)}
              />
              {currency === 'USD' && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 -mt-1">
                  La cotización se aplica al momento del pago (Banco Nación).
                </p>
              )}

              {/* Stock behavior */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
                  checked={stockBehavior === 'DISCOUNT'}
                  onChange={(e) => setValue('stockBehavior', e.target.checked ? 'DISCOUNT' : 'RESERVE')}
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Descontar stock al crear</span>
                <span className="ml-auto">
                  <Info className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" title={stockBehavior === 'DISCOUNT' ? 'El stock se descuenta inmediatamente al crear la orden.' : 'El stock se reserva al crear. Se descuenta al confirmar la entrega por remito.'} />
                </span>
              </label>

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
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-200 tabular-nums">
                    {formatCurrency(totals.subtotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-slate-400">IVA</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-200 tabular-nums">
                    {formatCurrency(totals.taxAmount, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-gray-200 dark:border-slate-700 mt-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {formatCurrency(grandTotal, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Register payment at creation */}
            {!isEditing && !!customerId && saleCondition !== 'CUENTA_CORRIENTE' && (
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
                {isEditing ? 'Guardar cambios' : 'Crear orden de pedido'}
                <kbd className="ml-1.5 text-[10px] font-mono font-normal opacity-60 px-1 py-0.5 rounded bg-white/20 border border-white/30 leading-none">Ctrl+↵</kbd>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => navigate(isEditing ? `/orden-pedidos/${id}` : '/orden-pedidos')}
              >
                Cancelar
              </Button>
            </div>
          </div>

        </div>
      </form>

      <ConfirmDialog
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={() => navigate(isEditing ? `/orden-pedidos/${id}` : '/orden-pedidos')}
        variant="warning"
        title="¿Salir sin guardar?"
        message="Los cambios que no hayas guardado se perderán."
        confirmText="Salir"
        cancelText="Seguir editando"
      />

      <PaymentModal
        open={createdOpId !== null}
        onClose={() => {
          if (createdOpId) navigate(`/orden-pedidos/${createdOpId}`);
          setCreatedOpId(null);
        }}
        onSubmit={handlePaymentConfirm}
        remaining={grandTotal}
        currency={currency}
        isLoading={isPaymentLoading}
        title="Registrar pago"
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
