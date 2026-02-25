import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card, Select } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { remitosService } from '../../services';
import { formatDate } from '../../utils/formatters';
import {
  REMITO_STATUSES,
  REMITO_STATUS_COLORS,
  REMITO_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Remito, RemitoStatus } from '../../types';

export default function RemitosPage() {
  const navigate = useNavigate();
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const fetchRemitos = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await remitosService.getAll({
        page,
        limit,
        status: (statusFilter || undefined) as RemitoStatus | undefined,
      });
      setRemitos(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error('Error al cargar remitos');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusFilter]);

  useEffect(() => {
    fetchRemitos();
  }, [fetchRemitos]);

  const statusOptions = [
    { value: '', label: 'Todos los estados' },
    ...REMITO_STATUS_OPTIONS,
  ];

  const columns: Column<Remito>[] = [
    { key: 'number', header: 'Número' },
    {
      key: 'customer.name',
      header: 'Cliente',
      render: (remito) => remito.customer?.name,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (remito) => formatDate(remito.date),
    },
    {
      key: 'stockBehavior',
      header: 'Comportamiento',
      render: (remito) =>
        remito.stockBehavior === 'DISCOUNT' ? 'Descuento directo' : 'Reserva',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (remito) => (
        <Badge className={REMITO_STATUS_COLORS[remito.status]}>
          {REMITO_STATUSES[remito.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (remito) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/remitos/${remito.id}`);
          }}
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Remitos"
        subtitle={`${total} remitos registrados`}
        actions={
          <Button onClick={() => navigate('/remitos/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Remito
          </Button>
        }
      />

      <Card padding="none">
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            className="w-56"
          />
        </div>

        <DataTable
          columns={columns}
          data={remitos}
          isLoading={isLoading}
          keyExtractor={(remito) => remito.id}
          onRowClick={(remito) => navigate(`/remitos/${remito.id}`)}
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
