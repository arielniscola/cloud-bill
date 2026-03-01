import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Star, Warehouse, MapPin, Search, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { warehousesService } from '../../services';
import type { Warehouse as WarehouseType } from '../../types';

// ── Skeleton card ────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-gray-100 rounded-xl" />
        <div className="w-16 h-5 bg-gray-100 rounded-full" />
      </div>
      <div className="w-2/3 h-4 bg-gray-100 rounded mb-2" />
      <div className="w-1/2 h-3 bg-gray-100 rounded" />
    </div>
  );
}

// ── Warehouse card ───────────────────────────────────────────────
function WarehouseCard({
  warehouse,
  onEdit,
  onDelete,
  onClick,
}: {
  warehouse: WarehouseType;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md rounded-xl p-5 cursor-pointer transition-all duration-150 select-none"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
            warehouse.isDefault
              ? 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100'
              : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
          }`}
        >
          <Warehouse className="w-5 h-5" />
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {warehouse.isDefault && (
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
          )}
          <Badge variant={warehouse.isActive ? 'success' : 'default'}>
            {warehouse.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 leading-snug mb-1.5 pr-2 transition-colors duration-150">
        {warehouse.name}
        {warehouse.isDefault && (
          <span className="ml-2 text-[10px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full align-middle">
            Predeterminado
          </span>
        )}
      </p>

      {/* Address */}
      {warehouse.address ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{warehouse.address}</span>
        </div>
      ) : (
        <p className="text-xs text-gray-300 italic">Sin dirección</p>
      )}

      {/* Actions — appear on hover */}
      <div className="absolute top-3 right-3 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Editar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150 active:scale-[0.92]"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-[background-color,color] duration-150 active:scale-[0.92]"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function WarehousesPage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchWarehouses = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await warehousesService.getAll();
      setWarehouses(data);
    } catch {
      toast.error('Error al cargar almacenes');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, []);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await warehousesService.delete(deleteId);
      toast.success('Almacén eliminado');
      setDeleteId(null);
      fetchWarehouses();
    } catch {
      toast.error('Error al eliminar almacén');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.address ?? '').toLowerCase().includes(q)
    );
  }, [warehouses, search]);

  const activeCount = warehouses.filter((w) => w.isActive).length;

  return (
    <div>
      <PageHeader
        title="Almacenes"
        subtitle={
          isFirstLoad
            ? undefined
            : `${warehouses.length} ${warehouses.length === 1 ? 'almacén' : 'almacenes'} · ${activeCount} activos`
        }
        actions={
          <Button onClick={() => navigate('/warehouses/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo almacén
          </Button>
        }
      />

      {/* Search */}
      {!isFirstLoad && warehouses.length > 0 && (
        <div className="mb-5 relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar almacenes..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
          />
        </div>
      )}

      {/* Grid */}
      {isFirstLoad && isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Package className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">
            {search ? 'Sin resultados' : 'Sin almacenes'}
          </p>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-5">
            {search
              ? `No se encontraron almacenes para "${search}".`
              : 'Creá tu primer almacén para gestionar el inventario.'}
          </p>
          {!search && (
            <Button onClick={() => navigate('/warehouses/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo almacén
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((warehouse) => (
            <WarehouseCard
              key={warehouse.id}
              warehouse={warehouse}
              onClick={() => navigate(`/warehouses/${warehouse.id}`)}
              onEdit={() => navigate(`/warehouses/${warehouse.id}/edit`)}
              onDelete={() => setDeleteId(warehouse.id)}
            />
          ))}
          {/* Add tile */}
          <button
            onClick={() => navigate('/warehouses/new')}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 px-4 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-150 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-medium">Nuevo almacén</span>
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar almacén"
        message="¿Estás seguro de que deseas eliminar este almacén? Se perderá el registro de stock asociado."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
