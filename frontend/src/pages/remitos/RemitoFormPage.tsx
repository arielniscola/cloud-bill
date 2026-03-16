import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Truck, FileText, Calculator, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea } from '../../components/ui';
import { PageHeader, BarcodeProductInput, CustomerSearchSelect } from '../../components/shared';
import { remitosService, customersService, productsService, invoicesService, budgetsService } from '../../services';
import type { Customer, Product, Invoice, Budget } from '../../types';

const remitoItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
});

const remitoSchema = z.object({
  customerId: z.string().min(1, 'Selecciona un cliente'),
  notes: z.string().optional().nullable(),
  items: z.array(remitoItemSchema).min(1, 'Agrega al menos un item'),
});

type RemitoFormData = z.output<typeof remitoSchema>;

function SkeletonForm() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 animate-pulse">
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-16" />
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
        </div>
      </div>
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export default function RemitoFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get('invoiceId') || undefined;
  const budgetId = searchParams.get('budgetId') || undefined;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceDoc, setSourceDoc] = useState<Invoice | Budget | null>(null);
  const [sourceProducts, setSourceProducts] = useState<{ id: string; name: string; sku: string; maxQty: number }[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RemitoFormData>({
    resolver: zodResolver(remitoSchema) as any,
    defaultValues: {
      items: [{ productId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const customerId = watch('customerId') || '';
  const items = watch('items');

  useEffect(() => {
    const load = async () => {
      setIsLoadingData(true);
      try {
        if (invoiceId) {
          const [inv, customersData] = await Promise.all([
            invoicesService.getById(invoiceId),
            customersService.getAll({ limit: 1000 }),
          ]);
          setSourceDoc(inv as Invoice);
          setCustomers(customersData.data);
          setValue('customerId', inv.customerId);

          // Build source products from invoice items
          const sp = inv.items
            .filter((item) => item.product)
            .map((item) => ({
              id: item.product!.id,
              name: item.product!.name,
              sku: item.product!.sku ?? '',
              maxQty: Number(item.quantity),
            }));
          setSourceProducts(sp);

          // Pre-fill items from invoice
          if (sp.length > 0) {
            const prefilled = sp.map((p) => ({ productId: p.id, quantity: p.maxQty }));
            setValue('items', prefilled);
          }
        } else if (budgetId) {
          const [bud, customersData] = await Promise.all([
            budgetsService.getById(budgetId),
            customersService.getAll({ limit: 1000 }),
          ]);
          setSourceDoc(bud as Budget);
          setCustomers(customersData.data);
          if (bud.customerId) {
            setValue('customerId', bud.customerId);
          }

          // Build source products from budget items that have productId
          const sp = bud.items
            .filter((item) => item.productId && item.product)
            .map((item) => ({
              id: item.product!.id,
              name: item.product!.name,
              sku: item.product!.sku ?? '',
              maxQty: Number(item.quantity),
            }));
          setSourceProducts(sp);

          // Pre-fill items from budget
          if (sp.length > 0) {
            const prefilled = sp.map((p) => ({ productId: p.id, quantity: p.maxQty }));
            setValue('items', prefilled);
          }
        } else {
          const [customersData, productsData] = await Promise.all([
            customersService.getAll({ limit: 1000 }),
            productsService.getAll({ limit: 1000 }),
          ]);
          setCustomers(customersData.data);
          setProducts(productsData.data);
        }
      } catch {
        toast.error('Error al cargar datos');
      } finally {
        setIsLoadingData(false);
      }
    };
    load();
  }, [invoiceId, budgetId, setValue]);

  const handleBarcodeAdd = (product: Product) => {
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      setValue(`items.${existingIndex}.quantity`, Number(items[existingIndex].quantity) + 1);
    } else {
      append({ productId: product.id, quantity: 1 });
    }
  };

  const onSubmit = async (data: RemitoFormData) => {
    setIsSubmitting(true);
    try {
      const remito = await remitosService.create({
        customerId: data.customerId,
        notes: data.notes || undefined,
        invoiceId: invoiceId || undefined,
        budgetId: budgetId || undefined,
        items: data.items,
      });
      toast.success('Remito creado');
      navigate(`/remitos/${remito.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al crear remito');
    } finally {
      setIsSubmitting(false);
    }
  };

  const freeProductOptions = [
    { value: '', label: 'Seleccioná un producto' },
    ...products.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` })),
  ];

  const sourceProductOptions = [
    { value: '', label: 'Seleccioná un producto' },
    ...sourceProducts.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` })),
  ];

  const hasSource = !!(invoiceId || budgetId);
  const sourceLabel = invoiceId ? 'Factura' : 'Presupuesto';
  const sourceNumber = sourceDoc
    ? (sourceDoc as any).number
    : null;

  const canAddItem = !hasSource || items.length < sourceProducts.length;

  if (isLoadingData) {
    return (
      <div>
        <PageHeader title="Nuevo Remito" backTo="/remitos" />
        <SkeletonForm />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Nuevo Remito" backTo="/remitos" />

      {/* Source document banner */}
      {hasSource && sourceNumber && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm text-indigo-800 dark:text-indigo-300">
          {invoiceId ? <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" /> : <Calculator className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />}
          <span>
            Remito generado desde <strong>{sourceLabel} {sourceNumber}</strong>.
            Solo se pueden entregar productos incluidos en ese documento.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── Left: items ── */}
          <div>
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                  Ítems a entregar
                </h3>
              </div>

              {/* Barcode input — only in free mode */}
              {!hasSource && (
                <div className="px-5 pt-4">
                  <BarcodeProductInput products={products} onAdd={handleBarcodeAdd} />
                </div>
              )}

              {/* Items grid */}
              <div className="p-5 space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_80px_32px] gap-3 px-1">
                  <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Producto</span>
                  <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider text-right">Cantidad</span>
                  <span />
                </div>

                {fields.map((field, index) => {
                  const maxQty = hasSource
                    ? sourceProducts.find((p) => p.id === items[index]?.productId)?.maxQty
                    : undefined;
                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-[1fr_80px_32px] gap-3 items-center py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                    >
                      <div>
                        <Select
                          options={hasSource ? sourceProductOptions : freeProductOptions}
                          value={items[index]?.productId || ''}
                          onChange={(value) => setValue(`items.${index}.productId`, value)}
                          error={errors.items?.[index]?.productId?.message}
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          step="1"
                          min={1}
                          max={maxQty}
                          {...register(`items.${index}.quantity`)}
                          error={errors.items?.[index]?.quantity?.message}
                        />
                        {maxQty !== undefined && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 text-right">máx. {maxQty}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150 disabled:opacity-20 disabled:pointer-events-none active:scale-[0.98]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {errors.items?.message && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errors.items.message}
                  </div>
                )}

                {canAddItem && (
                  <button
                    type="button"
                    onClick={() => append({ productId: '', quantity: 1 })}
                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.98] mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: config + submit ── */}
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Config panel */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Configuración</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <CustomerSearchSelect
                    customers={customers}
                    value={customerId}
                    onChange={(id) => setValue('customerId', id)}
                    label="Cliente *"
                    error={errors.customerId?.message}
                    disabled={hasSource && !!sourceDoc && !!(sourceDoc as any).customerId}
                  />
                </div>
                <div>
                  <Textarea
                    label="Notas"
                    {...register('notes')}
                    rows={3}
                    placeholder="Observaciones internas..."
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex flex-col gap-2">
              <Button type="submit" isLoading={isSubmitting} className="w-full justify-center">
                <Truck className="w-4 h-4 mr-2" />
                Crear remito
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/remitos')}
                className="w-full justify-center"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
