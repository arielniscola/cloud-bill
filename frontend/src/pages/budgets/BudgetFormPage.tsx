import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea } from '../../components/ui';
import { PageHeader, BarcodeProductInput, ProductSearchSelect, CustomerSearchSelect, ConfirmDialog } from '../../components/shared';
import type { BarcodeProductInputHandle } from '../../components/shared';
import { useFormKeyboardShortcuts } from '../../hooks/useFormKeyboardShortcuts';
import { budgetsService, customersService, productsService, appSettingsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { CURRENCY_OPTIONS, PAYMENT_TERMS_OPTIONS, DEFERRED_PAYMENT_DAYS } from '../../utils/constants';
import { getDefaultInvoiceType } from '../../utils/getDefaultInvoiceType';
import type { Customer, Product, Currency, InvoiceType } from '../../types';

const budgetItemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().min(1, 'Requerida'),
  quantity: z.coerce.number().positive('> 0'),
  unitPrice: z.coerce.number().min(0, '>= 0'),
  taxRate: z.coerce.number().min(0).max(100),
});

const budgetSchema = z.object({
  type: z.enum([
    'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
    'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C',
    'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C',
  ]).default('FACTURA_B'),
  customerId: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  items: z.array(budgetItemSchema).min(1, 'Agrega al menos un ítem'),
});

type BudgetFormData = z.output<typeof budgetSchema>;

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

export default function BudgetFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companyTaxCondition, setCompanyTaxCondition] = useState<string>('RESPONSABLE_INSCRIPTO');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const {
    register, control, handleSubmit, setValue, watch, reset, getValues,
    formState: { errors },
  } = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema) as any,
    defaultValues: {
      type: 'FACTURA_B',
      currency: 'ARS',
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

  const type = watch('type') || 'FACTURA_B';
  const customerId = watch('customerId') || '';
  const currency = watch('currency') || 'ARS';
  const items = watch('items');

  // Auto-select invoice type + payment terms from customer
  useEffect(() => {
    if (isEditing) return;
    const customer = customers.find((c) => c.id === customerId);
    if (type.startsWith('FACTURA_')) {
      const autoType = getDefaultInvoiceType(customer?.taxCondition ?? null, companyTaxCondition);
      if (autoType !== type) setValue('type', autoType);
    }
    if (customer?.saleCondition === 'CUENTA_CORRIENTE') {
      setValue('paymentTerms', 'Cuenta Corriente');
    } else {
      setValue('paymentTerms', null);
    }
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When currency changes, update item prices to match (USD ↔ ARS)
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
    const fetchBudget = async () => {
      try {
        const budget = await budgetsService.getById(id);
        if (budget.status !== 'DRAFT') {
          toast.error('Solo se pueden editar presupuestos en borrador');
          navigate(`/budgets/${id}`);
          return;
        }
        reset({
          type: budget.type,
          customerId: budget.customerId,
          validUntil: budget.validUntil ? budget.validUntil.substring(0, 10) : null,
          notes: budget.notes,
          paymentTerms: budget.paymentTerms,
          currency: budget.currency,
          items: budget.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            taxRate: Number(item.taxRate),
          })),
        });
      } catch {
        toast.error('Error al cargar presupuesto');
        navigate('/budgets');
      } finally {
        setIsFetching(false);
      }
    };
    fetchBudget();
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

  const buildItemDTO = (item: typeof items[0]) => {
    const subtotal = item.quantity * item.unitPrice;
    const taxAmount = subtotal * (item.taxRate / 100);
    return { productId: item.productId || null, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, subtotal, taxAmount, total: subtotal + taxAmount };
  };

  const onSubmit = async (data: BudgetFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        type: data.type,
        customerId: data.customerId || null,
        validUntil: data.validUntil || null,
        notes: data.notes || null,
        paymentTerms: data.paymentTerms || null,
        currency: data.currency,
        exchangeRate: 1,
        items: data.items.map(buildItemDTO),
      };
      if (isEditing) {
        await budgetsService.update(id, payload);
        toast.success('Presupuesto actualizado');
        navigate(`/budgets/${id}`);
      } else {
        const budget = await budgetsService.create(payload);
        toast.success('Presupuesto creado');
        navigate(`/budgets/${budget.id}`);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar presupuesto');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) return (
    <div>
      <PageHeader title={isEditing ? 'Editar Presupuesto' : 'Nuevo Presupuesto'} backTo={isEditing ? `/budgets/${id}` : '/budgets'} />
      <SkeletonForm />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
        backTo={isEditing ? `/budgets/${id}` : '/budgets'}
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
                  {fields.map((field, index) => (
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
                  ))}
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
                placeholder="Condiciones de pago, aclaraciones, vigencia..."
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
                label="Válido hasta"
                type="date"
                {...register('validUntil')}
              />

              <Select
                label="Condición de venta"
                options={PAYMENT_TERMS_OPTIONS}
                value={watch('paymentTerms') ?? ''}
                onChange={(v) => {
                  if (DEFERRED_PAYMENT_DAYS[v]) {
                    setValue('paymentTerms', v);
                    const due = new Date();
                    due.setDate(due.getDate() + DEFERRED_PAYMENT_DAYS[v]);
                    setValue('validUntil', due.toISOString().substring(0, 10));
                  } else {
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

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <Button type="submit" isLoading={isLoading} className="w-full justify-center">
                {isEditing ? 'Guardar cambios' : 'Crear presupuesto'}
                <kbd className="ml-1.5 text-[10px] font-mono font-normal opacity-60 px-1 py-0.5 rounded bg-white/20 border border-white/30 leading-none">Ctrl+↵</kbd>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => navigate(isEditing ? `/budgets/${id}` : '/budgets')}
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
        onConfirm={() => navigate(isEditing ? `/budgets/${id}` : '/budgets')}
        variant="warning"
        title="¿Salir sin guardar?"
        message="Los cambios que no hayas guardado se perderán."
        confirmText="Salir"
        cancelText="Seguir editando"
      />

    </div>
  );
}
