import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Repeat, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { PageHeader, CustomerSearchSelect, ProductSearchSelect } from '../../components/shared';
import { recurringInvoicesService, customersService, productsService, warehousesService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { RECURRING_FREQUENCY_LABELS, type RecurringFrequency } from '../../types/recurring-invoice.types';
import type { Customer, Product, Warehouse } from '../../types';

const itemSchema = z.object({
  productId: z.string().min(1, 'Seleccioná un producto'),
  quantity: z.coerce.number().positive('> 0'),
  unitPrice: z.coerce.number().min(0, '>= 0'),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(21),
});

const formSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  customerId: z.string().min(1, 'Seleccioná un cliente'),
  type: z.enum(['FACTURA_A', 'FACTURA_B', 'FACTURA_C']),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional().nullable(),
  useCurrentPrices: z.boolean().default(false),
  startDate: z.string().min(1, 'Requerida'),
  endDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'Agregá al menos un ítem'),
});

type FormData = z.infer<typeof formSchema>;

const TYPE_OPTIONS = [
  { value: 'FACTURA_A', label: 'Factura A' },
  { value: 'FACTURA_B', label: 'Factura B' },
  { value: 'FACTURA_C', label: 'Factura C' },
];

const FREQUENCY_OPTIONS = (Object.keys(RECURRING_FREQUENCY_LABELS) as RecurringFrequency[])
  .map((f) => ({ value: f, label: RECURRING_FREQUENCY_LABELS[f] }));

const SALE_CONDITION_OPTIONS = [
  { value: 'CONTADO', label: 'Contado' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta Corriente' },
];

export default function RecurringInvoiceFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register, control, handleSubmit, setValue, watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      type: 'FACTURA_B',
      saleCondition: 'CONTADO',
      stockBehavior: 'DISCOUNT',
      frequency: 'MONTHLY',
      dayOfMonth: null,
      useCurrentPrices: false,
      startDate: new Date().toISOString().substring(0, 10),
      items: [{ productId: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 21 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const frequency = watch('frequency');
  const useCurrentPrices = watch('useCurrentPrices');
  const stockBehavior = watch('stockBehavior');

  useEffect(() => {
    Promise.all([
      customersService.getAll({ limit: 1000, isActive: true }),
      productsService.getAll({ limit: 1000 }),
      warehousesService.getAll().catch(() => [] as Warehouse[]),
    ])
      .then(([c, p, w]) => {
        setCustomers(c.data);
        setProducts(p.data);
        const active = w.filter((x) => x.isActive);
        setWarehouses(active);
        const def = active.find((x) => x.isDefault) ?? (active.length === 1 ? active[0] : null);
        if (def) setWarehouseId((prev) => prev || def.id);
      })
      .catch(() => toast.error('Error al cargar datos'));
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    recurringInvoicesService.getById(id)
      .then((rec) => {
        if (rec.warehouseId) setWarehouseId(rec.warehouseId);
        setValue('name', rec.name);
        setValue('customerId', rec.customerId);
        setValue('type', rec.type);
        setValue('saleCondition', rec.saleCondition);
        setValue('stockBehavior', rec.stockBehavior);
        setValue('frequency', rec.frequency);
        setValue('dayOfMonth', rec.dayOfMonth);
        setValue('useCurrentPrices', rec.useCurrentPrices);
        setValue('startDate', rec.startDate.substring(0, 10));
        setValue('endDate', rec.endDate ? rec.endDate.substring(0, 10) : null);
        setValue('notes', rec.notes);
        setValue('items', (rec.items ?? []).map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPct: i.discountPct,
          taxRate: i.taxRate,
        })));
      })
      .catch(() => {
        toast.error('Error al cargar el abono');
        navigate('/recurring-invoices');
      })
      .finally(() => setIsFetching(false));
  }, [id, isEditing, setValue, navigate]);

  const totals = (() => {
    let subtotal = 0;
    let tax = 0;
    for (const item of items ?? []) {
      const base = (item.quantity || 0) * (item.unitPrice || 0);
      const withDiscount = base * (1 - (item.discountPct || 0) / 100);
      subtotal += withDiscount;
      tax += withDiscount * ((item.taxRate || 0) / 100);
    }
    return { subtotal, tax, total: subtotal + tax };
  })();

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        endDate: data.endDate || null,
        notes: data.notes || null,
        dayOfMonth: frequency === 'WEEKLY' ? null : (data.dayOfMonth ?? null),
        warehouseId: warehouseId || null,
      };
      if (isEditing) {
        await recurringInvoicesService.update(id, payload);
        toast.success('Abono actualizado');
      } else {
        await recurringInvoicesService.create(payload);
        toast.success('Abono creado — la primera factura se genera en la fecha de inicio');
      }
      navigate('/recurring-invoices');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar el abono');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div>
        <PageHeader title="Abono" backTo="/recurring-invoices" />
        <Card className="max-w-3xl animate-pulse">
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar abono' : 'Nuevo abono'}
        subtitle="Genera facturas en borrador automáticamente según la frecuencia"
        backTo="/recurring-invoices"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre del abono *"
                placeholder="Ej: Abono mensual mantenimiento"
                {...register('name')}
                error={errors.name?.message}
                autoFocus={!isEditing}
              />
              <CustomerSearchSelect
                label="Cliente *"
                customers={customers}
                value={watch('customerId') || ''}
                onChange={(v) => setValue('customerId', v)}
                error={errors.customerId?.message}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Tipo de comprobante"
                options={TYPE_OPTIONS}
                value={watch('type')}
                onChange={(v) => setValue('type', v as FormData['type'])}
              />
              <Select
                label="Condición de cobro"
                options={SALE_CONDITION_OPTIONS}
                value={watch('saleCondition')}
                onChange={(v) => setValue('saleCondition', v as FormData['saleCondition'])}
              />
              {warehouses.length > 1 ? (
                <Select
                  label="Depósito de stock"
                  options={warehouses.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} (por defecto)` : w.name }))}
                  value={warehouseId}
                  onChange={setWarehouseId}
                />
              ) : <div />}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                label="Frecuencia *"
                options={FREQUENCY_OPTIONS}
                value={frequency}
                onChange={(v) => setValue('frequency', v as RecurringFrequency)}
              />
              {frequency !== 'WEEKLY' && (
                <Input
                  label="Día del mes (1-28)"
                  type="number" min={1} max={28}
                  placeholder="Ej: 1"
                  {...register('dayOfMonth')}
                  error={errors.dayOfMonth?.message}
                />
              )}
              <Input
                label="Primera factura *"
                type="date"
                {...register('startDate')}
                error={errors.startDate?.message}
              />
              <Input
                label="Finaliza (opcional)"
                type="date"
                {...register('endDate')}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
                  checked={useCurrentPrices}
                  onChange={(e) => setValue('useCurrentPrices', e.target.checked)}
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Usar precio de lista al generar</span>
                <span title="Con esto activado, cada factura toma el precio actual del producto (útil con listas que se actualizan). Desactivado, usa el precio fijado en el abono.">
                  <Info className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:bg-slate-700"
                  checked={stockBehavior === 'DISCOUNT'}
                  onChange={(e) => setValue('stockBehavior', e.target.checked ? 'DISCOUNT' : 'RESERVE')}
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Descontar stock al emitir</span>
              </label>
            </div>

            <Textarea
              label="Notas (van en cada factura)"
              rows={2}
              {...register('notes')}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Repeat className="w-4 h-4 text-indigo-500" />
              Ítems del abono
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 21 })}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Agregar ítem
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 sm:col-span-5">
                  <ProductSearchSelect
                    products={products}
                    value={watch(`items.${index}.productId`) || ''}
                    onChange={(productId, product) => {
                      setValue(`items.${index}.productId`, productId);
                      if (product) {
                        setValue(`items.${index}.unitPrice`, Number(product.price));
                        setValue(`items.${index}.taxRate`, Number(product.taxRate ?? 21));
                      }
                    }}
                    serverSearch
                    searchParams={{ isActive: true }}
                    error={errors.items?.[index]?.productId?.message}
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input type="number" step="0.01" placeholder="Cant." {...register(`items.${index}.quantity`)} error={errors.items?.[index]?.quantity?.message} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input type="number" step="0.01" placeholder="Precio" disabled={useCurrentPrices} {...register(`items.${index}.unitPrice`)} error={errors.items?.[index]?.unitPrice?.message} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input type="number" step="0.01" placeholder="IVA %" {...register(`items.${index}.taxRate`)} />
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end pt-1.5">
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(index)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 flex justify-end">
            <div className="text-right space-y-0.5">
              <p className="text-xs text-gray-400 dark:text-slate-500">Subtotal {formatCurrency(totals.subtotal)} · IVA {formatCurrency(totals.tax)}</p>
              <p className="text-base font-bold text-gray-900 dark:text-white">
                {formatCurrency(totals.total)} <span className="text-xs font-normal text-gray-400">/ {RECURRING_FREQUENCY_LABELS[frequency].toLowerCase()}</span>
              </p>
              {useCurrentPrices && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Los precios se recalculan con la lista vigente al generar cada factura</p>
              )}
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/recurring-invoices')}>Cancelar</Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Guardar cambios' : 'Crear abono'}
          </Button>
        </div>
      </form>
    </div>
  );
}
