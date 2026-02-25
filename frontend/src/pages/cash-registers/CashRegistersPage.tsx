import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card } from '../../components/ui';
import { PageHeader, DataTable, ConfirmDialog } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { cashRegistersService } from '../../services';
import type { CashRegister } from '../../types';

export default function CashRegistersPage() {
  const navigate = useNavigate();
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCashRegisters = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await cashRegistersService.getAll();
      setCashRegisters(data);
    } catch (error) {
      toast.error('Error al cargar cajas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCashRegisters();
  }, [fetchCashRegisters]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await cashRegistersService.delete(deleteId);
      toast.success('Caja eliminada');
      setDeleteId(null);
      fetchCashRegisters();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar caja');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<CashRegister>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (cr) => <span className="font-medium">{cr.name}</span>,
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (cr) => cr.description || <span className="text-gray-400">-</span>,
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (cr) => (
        <Badge variant={cr.isActive ? 'success' : 'error'}>
          {cr.isActive ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (cr) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/cash-registers/${cr.id}/edit`);
            }}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(cr.id);
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
        title="Cajas"
        subtitle={`${cashRegisters.length} cajas registradas`}
        actions={
          <Button onClick={() => navigate('/cash-registers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Caja
          </Button>
        }
      />

      <Card padding="none">
        <DataTable
          columns={columns}
          data={cashRegisters}
          isLoading={isLoading}
          keyExtractor={(cr) => cr.id}
          onRowClick={(cr) => navigate(`/cash-registers/${cr.id}/edit`)}
          emptyMessage="No hay cajas registradas"
        />
      </Card>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar caja"
        message="¿Estás seguro de que deseas eliminar esta caja? Los pagos registrados con esta caja no se verán afectados."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
