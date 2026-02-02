import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card } from '../../components/ui';
import { PageHeader, DataTable, ConfirmDialog } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { warehousesService } from '../../services';
import type { Warehouse } from '../../types';

export default function WarehousesPage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchWarehouses = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await warehousesService.getAll();
      setWarehouses(data);
    } catch (error) {
      toast.error('Error al cargar almacenes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await warehousesService.delete(deleteId);
      toast.success('Almacén eliminado');
      setDeleteId(null);
      fetchWarehouses();
    } catch (error) {
      toast.error('Error al eliminar almacén');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<Warehouse>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (warehouse) => (
        <div className="flex items-center gap-2">
          {warehouse.name}
          {warehouse.isDefault && (
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
          )}
        </div>
      ),
    },
    { key: 'address', header: 'Dirección' },
    {
      key: 'isDefault',
      header: 'Predeterminado',
      render: (warehouse) => (
        <Badge variant={warehouse.isDefault ? 'info' : 'default'}>
          {warehouse.isDefault ? 'Sí' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (warehouse) => (
        <Badge variant={warehouse.isActive ? 'success' : 'error'}>
          {warehouse.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (warehouse) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/warehouses/${warehouse.id}/edit`);
            }}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(warehouse.id);
            }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Almacenes"
        subtitle={`${warehouses.length} almacenes registrados`}
        actions={
          <Button onClick={() => navigate('/warehouses/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Almacén
          </Button>
        }
      />

      <Card padding="none">
        <DataTable
          columns={columns}
          data={warehouses}
          isLoading={isLoading}
          keyExtractor={(warehouse) => warehouse.id}
          onRowClick={(warehouse) => navigate(`/warehouses/${warehouse.id}/edit`)}
        />
      </Card>

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
