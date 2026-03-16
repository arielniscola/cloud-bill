import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ArrowRight, AlertTriangle, CheckCircle2, Building2 } from 'lucide-react';
import { Button, Input, Select } from '../../components/ui';
import { PageHeader, ProductSearchSelect } from '../../components/shared';
import { stockService, productsService, warehousesService } from '../../services';
import { formatNumber } from '../../utils/formatters';
import type { Product, Warehouse } from '../../types';

const transferSchema = z.object({
  productId:       z.string().min(1, 'Seleccioná un producto'),
  fromWarehouseId: z.string().min(1, 'Seleccioná el almacén origen'),
  toWarehouseId:   z.string().min(1, 'Seleccioná el almacén destino'),
  quantity:        z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  reason:          z.string().optional(),
}).refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
  message: 'El origen y destino deben ser diferentes',
  path: ['toWarehouseId'],
});

type TransferFormData = z.output<typeof transferSchema>;

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function StockTransferPage() {
  const navigate = useNavigate();
  const [products,       setProducts]       = useState<Product[]>([]);
  const [warehouses,     setWarehouses]     = useState<Warehouse[]>([]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [currentStock,   setCurrentStock]   = useState<number | null>(null);
  const [isFetchingStock,setIsFetchingStock]= useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } =
    useForm<TransferFormData>({ resolver: zodResolver(transferSchema) as any });

  const productId       = watch('productId')       || '';
  const fromWarehouseId = watch('fromWarehouseId') || '';
  const toWarehouseId   = watch('toWarehouseId')   || '';
  const quantity        = Number(watch('quantity')) || 0;

  useEffect(() => {
    Promise.all([
      productsService.getAll({ limit: 1000 }),
      warehousesService.getAll(),
    ]).then(([p, w]) => {
      setProducts(p.data);
      setWarehouses(w);
    }).catch(() => toast.error('Error al cargar datos'));
  }, []);

  useEffect(() => {
    if (!productId || !fromWarehouseId) { setCurrentStock(null); return; }
    setIsFetchingStock(true);
    stockService.getStock(productId, fromWarehouseId)
      .then((s) => setCurrentStock(Number(s.quantity) - Number(s.reservedQuantity)))
      .catch(() => setCurrentStock(0))
      .finally(() => setIsFetchingStock(false));
  }, [productId, fromWarehouseId]);

  const onSubmit = async (data: TransferFormData) => {
    setIsLoading(true);
    try {
      await stockService.transfer(data);
      toast.success('Transferencia realizada');
      navigate('/stock/movements');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al realizar transferencia');
    } finally {
      setIsLoading(false);
    }
  };

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const fromWarehouse    = warehouses.find((w) => w.id === fromWarehouseId);
  const toWarehouse      = warehouses.find((w) => w.id === toWarehouseId);
  const selectedProduct  = products.find((p) => p.id === productId);

  const stockInsufficient = currentStock !== null && quantity > 0 && quantity > currentStock;
  const stockLevel =
    currentStock === null   ? null :
    currentStock <= 0       ? 'empty' :
    currentStock < 5        ? 'low' : 'ok';

  return (
    <div>
      <PageHeader
        title="Transferencia de stock"
        subtitle="Mover productos entre almacenes"
        backTo="/stock"
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* ── Product ── */}
          <SectionCard title="Producto">
            <ProductSearchSelect
              products={products}
              value={productId}
              onChange={(v) => setValue('productId', v)}
              error={errors.productId?.message}
            />
          </SectionCard>

          {/* ── Transfer route ── */}
          <SectionCard title="Ruta de transferencia">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_44px_1fr] gap-2 items-start">

              {/* From */}
              <div className="space-y-2">
                <Select
                  label="Origen *"
                  options={[{ value: '', label: 'Seleccionar…' }, ...warehouseOptions]}
                  value={fromWarehouseId}
                  onChange={(v) => setValue('fromWarehouseId', v)}
                  error={errors.fromWarehouseId?.message}
                />

                {/* Stock indicator */}
                {productId && fromWarehouseId && (
                  <div>
                    {isFetchingStock ? (
                      <div className="h-7 w-36 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
                    ) : stockLevel !== null ? (
                      <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium ${
                        stockLevel === 'empty' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                        stockLevel === 'low'   ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                                                 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {stockLevel === 'empty'
                          ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          : <CheckCircle2  className="w-3.5 h-3.5 flex-shrink-0" />
                        }
                        <span className="tabular-nums font-bold">{formatNumber(currentStock!, 0)}</span>
                        <span className="opacity-70">disponibles</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Arrow — oculta en mobile, visible en sm+ */}
              <div className="hidden sm:flex items-center justify-center pt-7">
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                </div>
              </div>

              {/* To */}
              <Select
                label="Destino *"
                options={[{ value: '', label: 'Seleccionar…' }, ...warehouseOptions]}
                value={toWarehouseId}
                onChange={(v) => setValue('toWarehouseId', v)}
                error={errors.toWarehouseId?.message}
              />
            </div>

            {/* Route summary pill */}
            {fromWarehouse && toWarehouse && (
              <div className="mt-4 flex flex-wrap items-center gap-2 px-3 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl text-sm min-w-0">
                <Building2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-indigo-800 dark:text-indigo-300 truncate max-w-[120px] sm:max-w-none">{fromWarehouse.name}</span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-indigo-800 dark:text-indigo-300 truncate max-w-[120px] sm:max-w-none">{toWarehouse.name}</span>
                {selectedProduct && (
                  <>
                    <span className="text-indigo-300 dark:text-indigo-600 mx-0.5">·</span>
                    <span className="font-mono text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded flex-shrink-0">
                      {selectedProduct.sku}
                    </span>
                    <span className="text-indigo-700 dark:text-indigo-300 truncate">{selectedProduct.name}</span>
                  </>
                )}
              </div>
            )}
          </SectionCard>

          {/* ── Quantity & reason ── */}
          <SectionCard title="Detalle">
            <div className="space-y-4">
              <div>
                <Input
                  label="Cantidad a transferir *"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="0"
                  {...register('quantity')}
                  error={errors.quantity?.message}
                />
                {stockInsufficient && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Stock insuficiente · disponibles: {formatNumber(currentStock!, 0)} unidades
                  </p>
                )}
              </div>

              <Input
                label="Motivo"
                placeholder="Ej: Reposición sucursal, redistribución de stock…"
                {...register('reason')}
              />
            </div>
          </SectionCard>

          {/* ── Actions ── */}
          <div className="flex gap-3">
            <Button type="submit" isLoading={isLoading}>
              <ArrowRight className="w-4 h-4 mr-2" />
              Realizar transferencia
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/stock')}>
              Cancelar
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
