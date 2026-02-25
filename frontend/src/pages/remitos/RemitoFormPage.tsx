import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { remitosService, customersService, productsService } from '../../services';
import { STOCK_BEHAVIOR_OPTIONS } from '../../utils/constants';
import type { Customer, Product, StockBehavior } from '../../types';

const remitoItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
});

const remitoSchema = z.object({
  customerId: z.string().min(1, 'Selecciona un cliente'),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']),
  notes: z.string().optional().nullable(),
  items: z.array(remitoItemSchema).min(1, 'Agrega al menos un item'),
});

type RemitoFormData = z.output<typeof remitoSchema>;

export default function RemitoFormPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
      stockBehavior: 'DISCOUNT',
      items: [{ productId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const customerId = watch('customerId') || '';
  const stockBehavior = watch('stockBehavior') || 'DISCOUNT';
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
      } catch (error) {
        toast.error('Error al cargar datos');
      }
    };
    fetchData();
  }, []);

  const onSubmit = async (data: RemitoFormData) => {
    setIsLoading(true);
    try {
      const remito = await remitosService.create({
        customerId: data.customerId,
        stockBehavior: data.stockBehavior,
        notes: data.notes || undefined,
        items: data.items,
      });
      toast.success('Remito creado');
      navigate(`/remitos/${remito.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al crear remito');
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

  return (
    <div>
      <PageHeader title="Nuevo Remito" backTo="/remitos" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Cliente *"
              options={customerOptions}
              value={customerId}
              onChange={(value) => setValue('customerId', value)}
              error={errors.customerId?.message}
            />

            <Select
              label="Comportamiento de stock *"
              options={STOCK_BEHAVIOR_OPTIONS}
              value={stockBehavior}
              onChange={(value) => setValue('stockBehavior', value as StockBehavior)}
              error={errors.stockBehavior?.message}
            />
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
                <div className="col-span-7">
                  <Select
                    label="Producto"
                    options={productOptions}
                    value={items[index]?.productId || ''}
                    onChange={(value) => setValue(`items.${index}.productId`, value)}
                    error={errors.items?.[index]?.productId?.message}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    label="Cantidad"
                    type="number"
                    step="1"
                    {...register(`items.${index}.quantity`)}
                    error={errors.items?.[index]?.quantity?.message}
                  />
                </div>
                <div className="col-span-2">
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
            onClick={() => append({ productId: '', quantity: 1 })}
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar item
          </Button>
          {errors.items?.message && (
            <p className="text-sm text-red-600 mt-2">{errors.items.message}</p>
          )}
        </Card>

        <Card>
          <Textarea
            label="Notas"
            {...register('notes')}
            rows={3}
          />
        </Card>

        <div className="flex gap-3">
          <Button type="submit" isLoading={isLoading}>
            Crear remito
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/remitos')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
