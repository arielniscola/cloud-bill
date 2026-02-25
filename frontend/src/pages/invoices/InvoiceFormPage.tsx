import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { invoicesService, customersService, productsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { INVOICE_TYPE_OPTIONS, CURRENCY_OPTIONS } from '../../utils/constants';
import type { Customer, Product, InvoiceType, Currency } from '../../types';

const invoiceItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  unitPrice: z.coerce.number().min(0, 'Precio debe ser mayor o igual a 0'),
  taxRate: z.coerce.number().min(0).max(100),
});

const invoiceSchema = z.object({
  type: z.enum([
    'FACTURA_A',
    'FACTURA_B',
    'FACTURA_C',
    'NOTA_CREDITO_A',
    'NOTA_CREDITO_B',
    'NOTA_CREDITO_C',
    'NOTA_DEBITO_A',
    'NOTA_DEBITO_B',
    'NOTA_DEBITO_C',
  ]),
  customerId: z.string().min(1, 'Selecciona un cliente'),
  date: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.coerce.number().positive('Tipo de cambio debe ser mayor a 0').default(1),
  items: z.array(invoiceItemSchema).min(1, 'Agrega al menos un item'),
});

type InvoiceFormData = z.output<typeof invoiceSchema>;

export default function InvoiceFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema) as any,
    defaultValues: {
      type: 'FACTURA_B',
      currency: 'ARS',
      exchangeRate: 1,
      items: [{ productId: '', quantity: 1, unitPrice: 0, taxRate: 21 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const type = watch('type') || 'FACTURA_B';
  const customerId = watch('customerId') || '';
  const currency = watch('currency') || 'ARS';
  const items = watch('items');

  useEffect(() => {
    if (currency === 'ARS') {
      setValue('exchangeRate', 1);
    }
  }, [currency, setValue]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersData, productsData] = await Promise.all([
          customersService.getAll({ limit: 1000 }),
          productsService.getAll({ limit: 1000 }),
        ]);
        setCustomers(customersData.data);
        setProducts(productsData.data);
      } catch (error) {
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
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate,
          items: invoice.items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            taxRate: Number(item.taxRate),
          })),
        });
      } catch (error) {
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

  const calculateItemTotal = (item: typeof items[0]) => {
    const subtotal = item.quantity * item.unitPrice;
    const taxAmount = subtotal * (item.taxRate / 100);
    return subtotal + taxAmount;
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      const itemSubtotal = item.quantity * item.unitPrice;
      subtotal += itemSubtotal;
      taxAmount += itemSubtotal * (item.taxRate / 100);
    });

    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
    };
  };

  const totals = calculateTotals();

  const onSubmit = async (data: InvoiceFormData) => {
    setIsLoading(true);
    try {
      if (isEditing) {
        await invoicesService.update(id, data);
        toast.success('Factura actualizada');
        navigate(`/invoices/${id}`);
      } else {
        const invoice = await invoicesService.create(data);
        toast.success('Factura creada');
        navigate(`/invoices/${invoice.id}`);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar factura');
    } finally {
      setIsLoading(false);
    }
  };

  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: `${c.name}${c.taxId ? ` (${c.taxId})` : ''}`,
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.sku} - ${p.name}`,
  }));

  if (isFetching) {
    return <div className="p-6">Cargando...</div>;
  }

  return (
    <div>
      <PageHeader title={isEditing ? 'Editar Factura' : 'Nueva Factura'} backTo={isEditing ? `/invoices/${id}` : '/invoices'} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Tipo de comprobante *"
              options={INVOICE_TYPE_OPTIONS}
              value={type}
              onChange={(value) => setValue('type', value as InvoiceType)}
              error={errors.type?.message}
            />

            <Select
              label="Cliente *"
              options={customerOptions}
              value={customerId}
              onChange={(value) => setValue('customerId', value)}
              error={errors.customerId?.message}
            />

            <Input
              label="Fecha de vencimiento"
              type="date"
              {...register('dueDate')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Select
              label="Moneda"
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(value) => setValue('currency', value as Currency)}
            />

            {currency === 'USD' && (
              <Input
                label="Tipo de cambio"
                type="number"
                step="0.0001"
                {...register('exchangeRate')}
                error={errors.exchangeRate?.message}
              />
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-12 gap-3 items-end p-4 bg-gray-50 rounded-lg"
              >
                <div className="col-span-4">
                  <Select
                    label="Producto"
                    options={productOptions}
                    value={items[index]?.productId || ''}
                    onChange={(value) => handleProductChange(index, value)}
                    error={errors.items?.[index]?.productId?.message}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label="Cantidad"
                    type="number"
                    step="1"
                    {...register(`items.${index}.quantity`)}
                    error={errors.items?.[index]?.quantity?.message}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label="Precio unit."
                    type="number"
                    step="0.01"
                    {...register(`items.${index}.unitPrice`)}
                    error={errors.items?.[index]?.unitPrice?.message}
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    label="IVA %"
                    type="number"
                    step="0.01"
                    {...register(`items.${index}.taxRate`)}
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 mb-1">Total</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(calculateItemTotal(items[index] || { quantity: 0, unitPrice: 0, taxRate: 0 }), currency)}
                  </p>
                </div>
                <div className="col-span-1">
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() =>
              append({ productId: '', quantity: 1, unitPrice: 0, taxRate: 21 })
            }
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar item
          </Button>
          {errors.items?.message && (
            <p className="text-sm text-red-600 mt-2">{errors.items.message}</p>
          )}
        </Card>

        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Textarea
              label="Notas"
              {...register('notes')}
              rows={3}
            />

            <div className="space-y-2 text-right">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal:</span>
                <span className="font-medium">{formatCurrency(totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA:</span>
                <span className="font-medium">{formatCurrency(totals.taxAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-lg border-t pt-2">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-primary-600">
                  {formatCurrency(totals.total, currency)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Guardar cambios' : 'Crear factura'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/invoices')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
