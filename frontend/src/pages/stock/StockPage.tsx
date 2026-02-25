import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import { Card, Badge, Select } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { stockService, warehousesService } from '../../services';
import { formatNumber } from '../../utils/formatters';
import type { Stock, Warehouse } from '../../types';

export default function StockPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const data = await warehousesService.getAll();
        setWarehouses(data);
        if (data.length > 0) {
          const defaultWarehouse = data.find((w) => w.isDefault) || data[0];
          setSelectedWarehouse(defaultWarehouse.id);
        }
      } catch (error) {
        toast.error('Error al cargar almacenes');
      }
    };
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (!selectedWarehouse) return;

    const fetchStock = async () => {
      setIsLoading(true);
      try {
        const data = await stockService.getWarehouseStock(selectedWarehouse);
        setStocks(data);
      } catch (error) {
        toast.error('Error al cargar stock');
      } finally {
        setIsLoading(false);
      }
    };
    fetchStock();
  }, [selectedWarehouse]);

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  const columns: Column<Stock>[] = [
    {
      key: 'product.sku',
      header: 'SKU',
      render: (stock) => stock.product?.sku,
    },
    {
      key: 'product.name',
      header: 'Producto',
      render: (stock) => stock.product?.name,
    },
    {
      key: 'quantity',
      header: 'Stock total',
      render: (stock) => formatNumber(stock.quantity, 0),
    },
    {
      key: 'reservedQuantity',
      header: 'Reservado',
      render: (stock) =>
        stock.reservedQuantity > 0 ? (
          <span className="text-amber-600 font-medium">
            {formatNumber(stock.reservedQuantity, 0)}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: 'available',
      header: 'Disponible',
      render: (stock) => {
        const available = stock.quantity - stock.reservedQuantity;
        return (
          <span className={available <= 0 ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
            {formatNumber(available, 0)}
          </span>
        );
      },
    },
    {
      key: 'minQuantity',
      header: 'Stock mínimo',
      render: (stock) =>
        stock.minQuantity !== null ? formatNumber(stock.minQuantity, 0) : '-',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (stock) => {
        const available = stock.quantity - stock.reservedQuantity;
        if (stock.minQuantity === null) {
          if (stock.reservedQuantity > 0) {
            return <Badge variant="warning">Con reservas</Badge>;
          }
          return <Badge variant="default">Sin mínimo</Badge>;
        }
        if (available <= stock.minQuantity) {
          return (
            <Badge variant="warning">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Stock bajo
            </Badge>
          );
        }
        return <Badge variant="success">Normal</Badge>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Control de stock por almacén"
      />

      <Card padding="none">
        <div className="p-4 border-b border-gray-200">
          <Select
            label="Almacén"
            options={warehouseOptions}
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            className="max-w-xs"
          />
        </div>

        <DataTable
          columns={columns}
          data={stocks}
          isLoading={isLoading}
          keyExtractor={(stock) => stock.id}
          emptyMessage="No hay stock registrado en este almacén"
        />
      </Card>
    </div>
  );
}
