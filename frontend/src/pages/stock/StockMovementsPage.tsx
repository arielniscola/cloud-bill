import { useState, useEffect, useCallback } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Card, Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader, DataTable, ProductSearchSelect } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { stockService, productsService, warehousesService } from '../../services';
import { formatNumber } from '../../utils/formatters';
import { STOCK_MOVEMENT_OPTIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { StockMovement, Product, Warehouse, StockMovementType } from '../../types';

// ── Movement type config ─────────────────────────────────────────
type MovementCfg = { label: string; sign: '+' | '−'; className: string };

const MOVEMENT_CFG: Record<StockMovementType, MovementCfg> = {
  PURCHASE:            { label: 'Compra',         sign: '+', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  SALE:                { label: 'Venta',           sign: '−', className: 'text-red-600    bg-red-50    border-red-200'    },
  ADJUSTMENT_IN:       { label: 'Ajuste +',        sign: '+', className: 'text-blue-700   bg-blue-50   border-blue-200'   },
  ADJUSTMENT_OUT:      { label: 'Ajuste −',        sign: '−', className: 'text-orange-600 bg-orange-50 border-orange-200' },
  TRANSFER_IN:         { label: 'Transfer. entr.', sign: '+', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  TRANSFER_OUT:        { label: 'Transfer. sal.',  sign: '−', className: 'text-violet-600 bg-violet-50 border-violet-200' },
  RETURN:              { label: 'Devolución',      sign: '+', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  REMITO_OUT:          { label: 'Remito',          sign: '−', className: 'text-amber-700  bg-amber-50  border-amber-200'  },
  RESERVATION:         { label: 'Reserva',         sign: '−', className: 'text-gray-600   bg-gray-100  border-gray-200'   },
  RESERVATION_RELEASE: { label: 'Lib. reserva',    sign: '+', className: 'text-gray-600   bg-gray-100  border-gray-200'   },
};

const IS_IN: Partial<Record<StockMovementType, boolean>> = {
  PURCHASE: true, ADJUSTMENT_IN: true, TRANSFER_IN: true, RETURN: true, RESERVATION_RELEASE: true,
};

// ── Compact filter select ────────────────────────────────────────
function CompactSelect({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:placeholder:text-slate-500 ${
          value
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-slate-500 pointer-events-none" />
    </div>
  );
}

// ── Form schema ──────────────────────────────────────────────────
const movementSchema = z.object({
  productId:   z.string().min(1, 'Seleccioná un producto'),
  warehouseId: z.string().min(1, 'Seleccioná un almacén'),
  type: z.enum([
    'PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN',
  ]),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  reason:   z.string().optional(),
});
type MovementFormData = z.output<typeof movementSchema>;

// ── Page ─────────────────────────────────────────────────────────
export default function StockMovementsPage() {
  const [movements,  setMovements]  = useState<StockMovement[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isModalOpen,setIsModalOpen]= useState(false);
  const [isSaving,   setIsSaving]   = useState(false);
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [filterProduct,   setFilterProduct]   = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterType,      setFilterType]      = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate,   setFilterEndDate]   = useState('');

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } =
    useForm<MovementFormData>({
      resolver: zodResolver(movementSchema) as any,
      defaultValues: { type: 'PURCHASE' },
    });

  const productId   = watch('productId')   || '';
  const warehouseId = watch('warehouseId') || '';
  const type        = watch('type')        || 'PURCHASE';

  const fetchMovements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await stockService.getMovements({
        page, limit,
        ...(filterProduct   && { productId:   filterProduct }),
        ...(filterWarehouse && { warehouseId: filterWarehouse }),
        ...(filterType      && { type:        filterType as StockMovementType }),
        ...(filterStartDate && { startDate:   filterStartDate }),
        ...(filterEndDate   && { endDate:     filterEndDate }),
      });
      setMovements(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Error al cargar movimientos');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, filterProduct, filterWarehouse, filterType, filterStartDate, filterEndDate]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  useEffect(() => {
    Promise.all([
      productsService.getAll({ limit: 1000 }),
      warehousesService.getAll(),
    ]).then(([p, w]) => {
      setProducts(p.data);
      setWarehouses(w);
    }).catch(() => {});
  }, []);

  const clearFilters = () => {
    setFilterProduct(''); setFilterWarehouse(''); setFilterType('');
    setFilterStartDate(''); setFilterEndDate(''); setPage(1);
  };

  const hasActiveFilters = !!(filterProduct || filterWarehouse || filterType || filterStartDate || filterEndDate);

  const openModal  = () => { reset({ type: 'PURCHASE' }); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); reset(); };

  const onSubmit = async (data: MovementFormData) => {
    setIsSaving(true);
    try {
      await stockService.addMovement(data);
      toast.success('Movimiento registrado');
      closeModal();
      fetchMovements();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al registrar movimiento');
    } finally {
      setIsSaving(false);
    }
  };

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  const columns: Column<StockMovement>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (mov) => {
        const d = new Date(mov.createdAt);
        return (
          <div className="whitespace-nowrap">
            <p className="text-sm text-gray-800 dark:text-slate-200">{d.toLocaleDateString('es-AR')}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        );
      },
    },
    {
      key: 'product.name',
      header: 'Producto',
      render: (mov) => (
        <div className="min-w-0">
          {mov.product?.sku && (
            <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
              {mov.product.sku}
            </span>
          )}
          <p className="text-sm text-gray-800 dark:text-slate-200 mt-0.5 leading-tight truncate max-w-[200px]">
            {mov.product?.name ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'warehouse.name',
      header: 'Almacén',
      render: (mov) => (
        <span className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">{mov.warehouse?.name ?? '—'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (mov) => {
        const cfg = MOVEMENT_CFG[mov.type] ?? { label: mov.type, className: 'text-gray-600 bg-gray-100 border-gray-200' };
        return (
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cfg.className}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      render: (mov) => {
        const isIn = IS_IN[mov.type] ?? false;
        return (
          <span className={`inline-flex items-center text-sm font-bold tabular-nums px-2 py-0.5 rounded-full ${
            isIn ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
          }`}>
            {isIn ? '+' : '−'}{formatNumber(mov.quantity, 0)}
          </span>
        );
      },
    },
    {
      key: 'newQuantity',
      header: 'Stock final',
      render: (mov) => (
        <span className="text-sm tabular-nums text-gray-500 dark:text-slate-400">{formatNumber(mov.newQuantity, 0)}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (mov) => mov.reason
        ? <span className="text-xs text-gray-500 dark:text-slate-400 block max-w-[160px] truncate">{mov.reason}</span>
        : <span className="text-gray-300 dark:text-slate-600 text-sm">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Movimientos de stock"
        subtitle={total > 0
          ? `${total} ${total === 1 ? 'movimiento' : 'movimientos'}${hasActiveFilters ? ' · filtros activos' : ''}`
          : 'Historial de entradas y salidas'
        }
        actions={
          <Button onClick={openModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo movimiento
          </Button>
        }
      />

      <Card padding="none">
        {/* ── Filter bar ── */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">

            {/* Date range */}
            <div className="flex flex-wrap items-center gap-1">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all w-full xs:w-auto"
              />
              <span className="text-gray-300 dark:text-slate-600 text-xs">→</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all w-full xs:w-auto"
              />
            </div>

            {/* Type */}
            <CompactSelect
              value={filterType}
              onChange={(v) => { setFilterType(v); setPage(1); }}
              placeholder="Tipo"
              options={STOCK_MOVEMENT_OPTIONS}
            />

            {/* Warehouse */}
            <CompactSelect
              value={filterWarehouse}
              onChange={(v) => { setFilterWarehouse(v); setPage(1); }}
              placeholder="Almacén"
              options={warehouseOptions}
            />

            {/* Product */}
            <div className="w-52">
              <ProductSearchSelect
                products={products}
                value={filterProduct}
                onChange={(v) => { setFilterProduct(v); setPage(1); }}
                placeholder="Filtrar por producto…"
                optional
              />
            </div>

            {/* Clear */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <X className="w-3 h-3" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
          keyExtractor={(mov) => mov.id}
          emptyMessage={
            hasActiveFilters
              ? 'Sin resultados para los filtros aplicados'
              : 'No hay movimientos registrados'
          }
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (l) => { setLimit(l); setPage(1); },
          }}
        />
      </Card>

      {/* ── New movement modal ── */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title="Nuevo movimiento de stock">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Producto <span className="text-red-400">*</span>
            </label>
            <ProductSearchSelect
              products={products}
              value={productId}
              onChange={(v) => setValue('productId', v)}
              error={errors.productId?.message}
            />
          </div>

          <Select
            label="Almacén *"
            options={[{ value: '', label: 'Seleccionar…' }, ...warehouseOptions]}
            value={warehouseId}
            onChange={(v) => setValue('warehouseId', v)}
            error={errors.warehouseId?.message}
          />

          <Select
            label="Tipo de movimiento *"
            options={STOCK_MOVEMENT_OPTIONS}
            value={type}
            onChange={(v) => setValue('type', v as MovementFormData['type'])}
            error={errors.type?.message}
          />

          {/* Type preview chip */}
          {type && MOVEMENT_CFG[type as StockMovementType] && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-slate-500">Vista previa:</span>
              <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${MOVEMENT_CFG[type as StockMovementType].className}`}>
                {MOVEMENT_CFG[type as StockMovementType].label}
              </span>
            </div>
          )}

          <Input
            label="Cantidad *"
            type="number"
            step="1"
            min="1"
            placeholder="0"
            {...register('quantity')}
            error={errors.quantity?.message}
          />

          <Input
            label="Motivo"
            placeholder="Ej: Ajuste de inventario, devolución de cliente…"
            {...register('reason')}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={isSaving}>Registrar</Button>
            <Button type="button" variant="outline" onClick={closeModal}>Cancelar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
