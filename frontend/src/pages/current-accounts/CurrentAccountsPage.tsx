import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { customersService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Customer } from '../../types';

export default function CurrentAccountsPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

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

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Cliente' },
    { key: 'taxId', header: 'CUIT/CUIL' },
    { key: 'email', header: 'Email' },
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
      header: 'Cuenta',
      render: (customer) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/current-accounts/${customer.id}`);
          }}
        >
          <Eye className="w-4 h-4 mr-2" />
          Ver cuenta
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cuentas Corrientes"
        subtitle="Gestión de cuentas corrientes de clientes"
      />

      <Card padding="none">
        <div className="p-4 border-b border-gray-200">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Buscar cliente..."
            className="max-w-md"
          />
        </div>

        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          keyExtractor={(customer) => customer.id}
          onRowClick={(customer) => navigate(`/current-accounts/${customer.id}`)}
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
    </div>
  );
}
