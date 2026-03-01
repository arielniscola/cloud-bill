import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardList } from 'lucide-react';
import { Card, Button, Select, Input } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { stockService, warehousesService } from '../../services';
import { formatNumber } from '../../utils/formatters';
import type { Stock, Warehouse } from '../../types';

interface CountRow {
  stock: Stock;
  countedQty: string; // user input
}

export default function StockPhysicalCountPage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [rows, setRows] = useState<CountRow[]>([]);
  const [reason, setReason] = useState('Conteo físico de inventario');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    warehousesService.getAll()
      .then((data) => {
        setWarehouses(data);
        const def = data.find((w) => w.isDefault) || data[0];
        if (def) setSelectedWarehouse(def.id);
      })
      .catch(() => toast.error('Error al cargar almacenes'));
  }, []);

  useEffect(() => {
    if (!selectedWarehouse) return;
    setIsLoading(true);
    stockService.getWarehouseStock(selectedWarehouse)
      .then((stocks) => {
        setRows(stocks.map((s) => ({ stock: s, countedQty: String(Number(s.quantity)) })));
      })
      .catch(() => toast.error('Error al cargar stock'))
      .finally(() => setIsLoading(false));
  }, [selectedWarehouse]);

  const updateRow = (index: number, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, countedQty: value } : r))
    );
  };

  const changedRows = rows.filter((r) => {
    const counted = parseFloat(r.countedQty);
    return !isNaN(counted) && counted !== Number(r.stock.quantity);
  });

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Ingresa un motivo para el conteo');
      return;
    }
    if (changedRows.length === 0) {
      toast.error('No hay diferencias para registrar');
      return;
    }

    const items = changedRows.map((r) => ({
      productId: r.stock.productId,
      newQuantity: parseFloat(r.countedQty),
    }));

    setIsSaving(true);
    try {
      await stockService.adjustBulk({ warehouseId: selectedWarehouse, items, reason });
      toast.success(`${changedRows.length} ajuste${changedRows.length !== 1 ? 's' : ''} aplicado${changedRows.length !== 1 ? 's' : ''}`);
      navigate('/stock');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al aplicar ajustes');
    } finally {
      setIsSaving(false);
    }
  };

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  return (
    <div>
      <PageHeader
        title="Conteo Físico"
        subtitle="Ajustar el inventario según el recuento real"
        backTo="/stock"
      />

      <div className="space-y-4 max-w-4xl">
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Almacén *"
              options={warehouseOptions}
              value={selectedWarehouse}
              onChange={setSelectedWarehouse}
            />
            <Input
              label="Motivo *"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Conteo mensual de inventario"
            />
          </div>
        </Card>

        {rows.length > 0 && (
          <Card padding="none">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700">
                  {rows.length} productos · Ingresá las cantidades contadas
                </h3>
              </div>
              {changedRows.length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                  {changedRows.length} diferencia{changedRows.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[520px] divide-y divide-gray-100">
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase bg-gray-50">
                  <div className="col-span-2">SKU</div>
                  <div className="col-span-4">Producto</div>
                  <div className="col-span-2 text-right">Sistema</div>
                  <div className="col-span-2 text-right">Contado</div>
                  <div className="col-span-2 text-right">Diferencia</div>
                </div>

                {isLoading ? (
                  <div className="p-8 text-center text-gray-400">Cargando productos...</div>
                ) : (
                  rows.map((row, index) => {
                    const counted = parseFloat(row.countedQty);
                    const diff = isNaN(counted) ? null : counted - Number(row.stock.quantity);
                    const hasDiff = diff !== null && diff !== 0;

                    return (
                      <div
                        key={row.stock.id}
                        className={`grid grid-cols-12 gap-4 px-4 py-2.5 items-center ${hasDiff ? 'bg-amber-50' : ''}`}
                      >
                        <div className="col-span-2 font-mono text-xs text-gray-500">
                          {row.stock.product?.sku}
                        </div>
                        <div className="col-span-4 text-sm text-gray-800 truncate">
                          {row.stock.product?.name}
                        </div>
                        <div className="col-span-2 text-right text-sm text-gray-600">
                          {formatNumber(Number(row.stock.quantity), 0)}
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.countedQty}
                            onChange={(e) => updateRow(index, e.target.value)}
                            className={`w-full border rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              hasDiff ? 'border-amber-400 bg-white' : 'border-gray-300'
                            }`}
                          />
                        </div>
                        <div className="col-span-2 text-right text-sm font-medium">
                          {diff === null ? (
                            <span className="text-gray-400">-</span>
                          ) : diff === 0 ? (
                            <span className="text-gray-400">sin cambios</span>
                          ) : (
                            <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}>
                              {diff > 0 ? '+' : ''}{formatNumber(diff, 0)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            isLoading={isSaving}
            disabled={changedRows.length === 0}
          >
            Aplicar {changedRows.length > 0 ? `${changedRows.length} ajuste${changedRows.length !== 1 ? 's' : ''}` : 'ajustes'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/stock')}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
