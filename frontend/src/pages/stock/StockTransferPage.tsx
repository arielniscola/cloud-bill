import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ArrowRight } from 'lucide-react';
import { Button, Input, Select, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { stockService, productsService, warehousesService } from '../../services';
import type { Product, Warehouse } from '../../types';

const transferSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  fromWarehouseId: z.string().min(1, 'Selecciona el almacén origen'),
  toWarehouseId: z.string().min(1, 'Selecciona el almacén destino'),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  reason: z.string().optional(),
}).refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
  message: 'Los almacenes origen y destino deben ser diferentes',
  path: ['toWarehouseId'],
});

type TransferFormData = z.output<typeof transferSchema>;

export default function StockTransferPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStock, setCurrentStock] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema) as any,
  });

  const productId = watch('productId') || '';
  const fromWarehouseId = watch('fromWarehouseId') || '';
  const toWarehouseId = watch('toWarehouseId') || '';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsData, warehousesData] = await Promise.all([
          productsService.getAll({ limit: 1000 }),
          warehousesService.getAll(),
        ]);
        setProducts(productsData.data);
        setWarehouses(warehousesData);
      } catch (error) {
        toast.error('Error al cargar datos');
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (productId && fromWarehouseId) {
      const fetchStock = async () => {
        try {
          const stock = await stockService.getStock(productId, fromWarehouseId);
          setCurrentStock(stock.quantity);
        } catch {
          setCurrentStock(0);
        }
      };
      fetchStock();
    } else {
      setCurrentStock(null);
    }
  }, [productId, fromWarehouseId]);

  const onSubmit = async (data: TransferFormData) => {
    setIsLoading(true);
    try {
      await stockService.transfer(data);
      toast.success('Transferencia realizada');
      navigate('/stock/movements');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al realizar transferencia');
    } finally {
      setIsLoading(false);
    }
  };

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.sku} - ${p.name}`,
  }));

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  return (
    <div>
      <PageHeader
        title="Transferencia de Stock"
        subtitle="Mover productos entre almacenes"
        backTo="/stock"
      />

      <Card className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Select
            label="Producto *"
            options={productOptions}
            value={productId}
            onChange={(value) => setValue('productId', value)}
            error={errors.productId?.message}
          />

          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
            <Select
              label="Almacén origen *"
              options={warehouseOptions}
              value={fromWarehouseId}
              onChange={(value) => setValue('fromWarehouseId', value)}
              error={errors.fromWarehouseId?.message}
            />
            <ArrowRight className="w-5 h-5 text-gray-400 mb-2" />
            <Select
              label="Almacén destino *"
              options={warehouseOptions}
              value={toWarehouseId}
              onChange={(value) => setValue('toWarehouseId', value)}
              error={errors.toWarehouseId?.message}
            />
          </div>

          {currentStock !== null && (
            <p className="text-sm text-gray-500">
              Stock disponible en origen: <strong>{currentStock}</strong> unidades
            </p>
          )}

          <Input
            label="Cantidad a transferir *"
            type="number"
            step="1"
            {...register('quantity')}
            error={errors.quantity?.message}
          />

          <Input
            label="Motivo"
            {...register('reason')}
            error={errors.reason?.message}
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isLoading}>
              Realizar transferencia
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/stock')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
