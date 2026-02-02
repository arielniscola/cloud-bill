import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card, Select } from '../../components/ui';
import { PageHeader, DataTable, SearchInput } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { invoicesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_STATUSES,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Invoice, InvoiceStatus } from '../../types';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await invoicesService.getAll({
        page,
        limit,
        status: statusFilter as InvoiceStatus | undefined,
      });
      setInvoices(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error('Error al cargar facturas');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const statusOptions = [
    { value: '', label: 'Todos los estados' },
    ...INVOICE_STATUS_OPTIONS,
  ];

  const columns: Column<Invoice>[] = [
    { key: 'number', header: 'Número' },
    {
      key: 'type',
      header: 'Tipo',
      render: (invoice) => INVOICE_TYPES[invoice.type],
    },
    {
      key: 'customer.name',
      header: 'Cliente',
      render: (invoice) => invoice.customer?.name,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (invoice) => formatDate(invoice.date),
    },
    {
      key: 'total',
      header: 'Total',
      render: (invoice) => formatCurrency(invoice.total),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (invoice) => (
        <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
          {INVOICE_STATUSES[invoice.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (invoice) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/invoices/${invoice.id}`);
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
        title="Facturas"
        subtitle={`${total} facturas registradas`}
        actions={
          <Button onClick={() => navigate('/invoices/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Factura
          </Button>
        }
      />

      <Card padding="none">
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Buscar por número, cliente..."
            className="max-w-md"
          />
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            className="w-48"
          />
        </div>

        <DataTable
          columns={columns}
          data={invoices}
          isLoading={isLoading}
          keyExtractor={(invoice) => invoice.id}
          onRowClick={(invoice) => navigate(`/invoices/${invoice.id}`)}
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
