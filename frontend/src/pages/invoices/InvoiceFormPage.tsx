import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea } from '../../components/ui';
import { PageHeader, BarcodeProductInput, ProductSearchSelect, CustomerSearchSelect } from '../../components/shared';
import { invoicesService, customersService, productsService, cashRegistersService, appSettingsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { INVOICE_TYPE_OPTIONS, PAYMENT_METHOD_OPTIONS, PAYMENT_TERMS_OPTIONS, SALE_CONDITION_OPTIONS } from '../../utils/constants';
import type { Customer, Product, InvoiceType, CashRegister } from '../../types';

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
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  items: z.array(invoiceItemSchema).min(1, 'Agrega al menos un ítem'),
});

type InvoiceFormData = z.output<typeof invoiceSchema>;

function SkeletonForm() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start animate-pulse">
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="h-5 bg-gray-100 rounded w-16" />
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="h-5 bg-gray-100 rounded w-32" />
        <div className="h-10 bg-gray-100 rounded-lg" />
        <div className="h-10 bg-gray-100 rounded-lg" />
        <div className="h-10 bg-gray-100 rounded-lg" />
        <div className="h-24 bg-gray-100 rounded-lg mt-4" />
      </div>
    </div>
  );
}

export default function InvoiceFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [registerPayment, setRegisterPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('');

  const {
    register, control, handleSubmit, setValue, watch, reset,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema) as any,
    defaultValues: {
      type: 'FACTURA_B',
      saleCondition: 'CONTADO',
      items: [{ productId: '', quantity: 1, unitPrice: 0, taxRate: 21 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const type = watch('type') || 'FACTURA_B';
  const customerId = watch('customerId') || '';
  const items = watch('items');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersData, productsData] = await Promise.all([
          customersService.getAll({ limit: 1000 }),
          productsService.getAll({ limit: 1000 }),
        ]);
        setCustomers(customersData.data);
        setProducts(productsData.data);
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
          dueDate: invoice.dueDate ? invoice.dueDate.substring(0, 10) : null,
          notes: invoice.notes,
          paymentTerms: invoice.paymentTerms,
          saleCondition: invoice.saleCondition ?? 'CONTADO',
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

  const loadCashRegisters = async () => {
    try {
      const [crs, settings] = await Promise.all([
        cashRegistersService.getAll(true),
        appSettingsService.get().catch(() => null),
      ]);
      setCashRegisters(crs);
      const preferred = settings?.defaultInvoiceCashRegisterId;
      const found = preferred ? crs.find((c) => c.id === preferred) : null;
      setSelectedCashRegisterId(found ? found.id : crs[0]?.id ?? '');
    } catch {
      /* silent */
    }
  };

  const onSubmit = async (data: InvoiceFormData) => {
    setIsLoading(true);
    try {
      if (isEditing) {
        await invoicesService.update(id, { ...data, currency: 'ARS', exchangeRate: 1, saleCondition: data.saleCondition });
        toast.success('Factura actualizada');
        navigate(`/invoices/${id}`);
      } else {
        const invoice = await invoicesService.create({ ...data, currency: 'ARS', exchangeRate: 1, saleCondition: data.saleCondition });
        if (registerPayment && selectedCashRegisterId) {
          try {
            await invoicesService.pay(invoice.id, {
              amount: grandTotal,
              paymentMethod: paymentMethod as any,
              cashRegisterId: selectedCashRegisterId,
            });
            toast.success('Factura creada y pago registrado');
          } catch {
            toast.success('Factura creada');
            toast.error('No se pudo registrar el pago automáticamente');
          }
        } else {
          toast.success('Factura creada');
        }
        navigate(`/invoices/${invoice.id}`);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar factura');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) return (
    <div>
      <PageHeader title={isEditing ? 'Editar Factura' : 'Nueva Factura'} backTo={isEditing ? `/invoices/${id}` : '/invoices'} />
      <SkeletonForm />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Factura' : 'Nueva Factura'}
        backTo={isEditing ? `/invoices/${id}` : '/invoices'}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── Left: items + notes ── */}
          <div className="space-y-4 min-w-0">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Ítems</h2>
                <BarcodeProductInput products={products} onAdd={handleBarcodeAdd} />
              </div>

              <div className="px-5 py-3">
                {/* Column headers */}
                <div className="hidden md:grid grid-cols-[3fr_72px_104px_60px_88px_32px] gap-3 pb-2 mb-1 border-b border-gray-100">
                  {['Producto', 'Cant.', 'Precio unit.', 'IVA %', 'Total', ''].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Item rows */}
                <div className="divide-y divide-gray-100">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 md:grid-cols-[3fr_72px_104px_60px_88px_32px] gap-3 items-center py-3"
                    >
                      {/* Product */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Producto *</label>
                        <ProductSearchSelect
                          products={products}
                          value={items[index]?.productId || ''}
                          onChange={(value) => handleProductChange(index, value)}
                          error={errors.items?.[index]?.productId?.message}
                        />
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Cantidad</label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="1"
                          {...register(`items.${index}.quantity`)}
                          error={errors.items?.[index]?.quantity?.message}
                        />
                      </div>

                      {/* Unit price */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Precio unit.</label>
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
                        <label className="block md:hidden text-xs text-gray-400 mb-1">IVA %</label>
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
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Total</label>
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
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
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors duration-150"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add item */}
                <div className="pt-3 border-t border-gray-100 mt-2">
                  <button
                    type="button"
                    onClick={() => append({ productId: '', quantity: 1, unitPrice: 0, taxRate: 21 })}
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors duration-150 py-1"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                  </button>
                  {errors.items?.message && (
                    <p className="text-xs text-red-500 mt-1">{errors.items.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
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
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <Select
                label="Tipo de comprobante"
                options={INVOICE_TYPE_OPTIONS}
                value={type}
                onChange={(value) => setValue('type', value as InvoiceType)}
                error={errors.type?.message}
              />

              <CustomerSearchSelect
                customers={customers}
                value={customerId}
                onChange={(id) => setValue('customerId', id)}
                label="Cliente *"
                error={errors.customerId?.message}
              />

              <Input
                label="Fecha de vencimiento"
                type="date"
                {...register('dueDate')}
              />

              <Select
                label="Condiciones de venta"
                options={PAYMENT_TERMS_OPTIONS}
                value={watch('paymentTerms') ?? ''}
                onChange={(v) => setValue('paymentTerms', v || null)}
              />

              <Select
                label="Condición de cobro"
                options={SALE_CONDITION_OPTIONS}
                value={watch('saleCondition') ?? 'CONTADO'}
                onChange={(v) => setValue('saleCondition', v as 'CONTADO' | 'CUENTA_CORRIENTE')}
              />

            </div>

            {/* Totals */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumen</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-sm font-medium text-gray-900 tabular-nums">
                    {formatCurrency(totals.subtotal, 'ARS')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">IVA</span>
                  <span className="text-sm font-medium text-gray-900 tabular-nums">
                    {formatCurrency(totals.taxAmount, 'ARS')}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-indigo-600 tabular-nums">
                    {formatCurrency(grandTotal, 'ARS')}
                  </span>
                </div>
              </div>
            </div>

            {/* Register payment at creation */}
            {!isEditing && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    checked={registerPayment}
                    onChange={(e) => {
                      setRegisterPayment(e.target.checked);
                      if (e.target.checked && cashRegisters.length === 0) loadCashRegisters();
                    }}
                  />
                  <span className="text-sm font-medium text-gray-700">Registrar pago al crear</span>
                </label>

                {registerPayment && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Método de pago</label>
                      <div className="grid grid-cols-2 gap-2">
                        {PAYMENT_METHOD_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPaymentMethod(opt.value)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                              paymentMethod === opt.value
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {cashRegisters.length > 0 && (
                      <Select
                        label="Caja"
                        options={cashRegisters.map((cr) => ({ value: cr.id, label: cr.name }))}
                        value={selectedCashRegisterId}
                        onChange={setSelectedCashRegisterId}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <Button type="submit" isLoading={isLoading} className="w-full justify-center">
                {isEditing ? 'Guardar cambios' : 'Crear factura'}
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
    </div>
  );
}
