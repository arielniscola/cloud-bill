import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Card, Badge, Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { stockService, productsService, warehousesService } from '../../services';
import { formatNumber, formatDateTime } from '../../utils/formatters';
import { STOCK_MOVEMENT_TYPES, STOCK_MOVEMENT_OPTIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { StockMovement, Product, Warehouse, StockMovementType } from '../../types';

const movementSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  warehouseId: z.string().min(1, 'Selecciona un almacén'),
  type: z.enum([
    'PURCHASE',
    'SALE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'RETURN',
  ]),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  reason: z.string().optional(),
});

type MovementFormData = z.output<typeof movementSchema>;

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<MovementFormData>({
    resolver: zodResolver(movementSchema) as any,
    defaultValues: {
      type: 'PURCHASE',
    },
  });

  const productId = watch('productId') || '';
  const warehouseId = watch('warehouseId') || '';
  const type = watch('type') || 'PURCHASE';

  const fetchMovements = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await stockService.getMovements({ page, limit });
      setMovements(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error('Error al cargar movimientos');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

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
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, []);

  const openModal = () => {
    reset({ type: 'PURCHASE' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const onSubmit = async (data: MovementFormData) => {
    setIsSaving(true);
    try {
      await stockService.addMovement(data);
      toast.success('Movimiento registrado');
      closeModal();
      fetchMovements();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar movimiento');
    } finally {
      setIsSaving(false);
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

  const getMovementColor = (type: StockMovementType): 'success' | 'error' | 'info' | 'warning' => {
    switch (type) {
      case 'PURCHASE':
      case 'ADJUSTMENT_IN':
      case 'TRANSFER_IN':
      case 'RETURN':
        return 'success';
      case 'SALE':
      case 'ADJUSTMENT_OUT':
      case 'TRANSFER_OUT':
        return 'error';
      default:
        return 'info';
    }
  };

  const columns: Column<StockMovement>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (mov) => formatDateTime(mov.createdAt),
    },
    {
      key: 'product.name',
      header: 'Producto',
      render: (mov) => mov.product?.name,
    },
    {
      key: 'warehouse.name',
      header: 'Almacén',
      render: (mov) => mov.warehouse?.name,
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (mov) => (
        <Badge variant={getMovementColor(mov.type)}>
          {STOCK_MOVEMENT_TYPES[mov.type]}
        </Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      render: (mov) => {
        const isPositive = ['PURCHASE', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN'].includes(
          mov.type
        );
        return (
          <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
            {isPositive ? '+' : '-'}
            {formatNumber(mov.quantity, 0)}
          </span>
        );
      },
    },
    {
      key: 'newQuantity',
      header: 'Stock resultante',
      render: (mov) => formatNumber(mov.newQuantity, 0),
    },
    { key: 'reason', header: 'Motivo' },
  ];

  return (
    <div>
      <PageHeader
        title="Movimientos de Stock"
        subtitle="Historial de entradas y salidas"
        actions={
          <Button onClick={openModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Movimiento
          </Button>
        }
      />

      <Card padding="none">
        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
          keyExtractor={(mov) => mov.id}
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (newLimit) => {
              setLimit(newLimit);
              setPage(1);
            },
          }}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Nuevo Movimiento de Stock"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Select
            label="Producto *"
            options={productOptions}
            value={productId}
            onChange={(value) => setValue('productId', value)}
            error={errors.productId?.message}
          />

          <Select
            label="Almacén *"
            options={warehouseOptions}
            value={warehouseId}
            onChange={(value) => setValue('warehouseId', value)}
            error={errors.warehouseId?.message}
          />

          <Select
            label="Tipo de movimiento *"
            options={STOCK_MOVEMENT_OPTIONS}
            value={type}
            onChange={(value) => setValue('type', value as StockMovementType)}
            error={errors.type?.message}
          />

          <Input
            label="Cantidad *"
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
            <Button type="submit" isLoading={isSaving}>
              Registrar
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
