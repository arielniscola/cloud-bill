import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { customersService } from '../../services';
import { TAX_CONDITIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Customer } from '../../types';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await customersService.getAll({ page, limit, search });
      setCustomers(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error('Error al cargar clientes');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await customersService.delete(deleteId);
      toast.success('Cliente eliminado');
      setDeleteId(null);
      fetchCustomers();
    } catch (error) {
      toast.error('Error al eliminar cliente');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Nombre' },
    { key: 'taxId', header: 'CUIT/CUIL' },
    {
      key: 'taxCondition',
      header: 'Condición IVA',
      render: (customer) => TAX_CONDITIONS[customer.taxCondition],
    },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Teléfono' },
    {
      key: 'isActive',
      header: 'Estado',
      render: (customer) => (
        <Badge variant={customer.isActive ? 'success' : 'error'}>
          {customer.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (customer) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/customers/${customer.id}/edit`);
            }}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(customer.id);
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
        title="Clientes"
        subtitle={`${total} clientes registrados`}
        actions={
          <Button onClick={() => navigate('/customers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Cliente
          </Button>
        }
      />

      <Card padding="none">
        <div className="p-4 border-b border-gray-200">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Buscar por nombre, CUIT, email..."
            className="max-w-md"
          />
        </div>

        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          keyExtractor={(customer) => customer.id}
          onRowClick={(customer) => navigate(`/customers/${customer.id}/edit`)}
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

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar cliente"
        message="¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
