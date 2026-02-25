import { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, Badge } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { ivaService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES } from '../../utils/constants';
import type { IvaVentasRow, IvaComprasRow } from '../../types';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type Tab = 'ventas' | 'compras';

export default function IvaPage() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>('ventas');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [ventasRows, setVentasRows] = useState<IvaVentasRow[]>([]);
  const [comprasRows, setComprasRows] = useState<IvaComprasRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (tab === 'ventas') {
        const data = await ivaService.getVentas(year, month);
        setVentasRows(data);
      } else {
        const data = await ivaService.getCompras(year, month);
        setComprasRows(data);
      }
    } catch {
      toast.error('Error al cargar datos del Libro IVA');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tab, year, month]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (tab === 'ventas') {
        await ivaService.exportVentasCSV(year, month);
      } else {
        await ivaService.exportComprasCSV(year, month);
      }
    } catch {
      toast.error('Error al exportar CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const totalNeto = tab === 'ventas'
    ? ventasRows.reduce((s, r) => s + r.neto, 0)
    : comprasRows.reduce((s, r) => s + r.neto, 0);

  const totalIva = tab === 'ventas'
    ? ventasRows.reduce((s, r) => s + r.iva, 0)
    : comprasRows.reduce((s, r) => s + r.iva, 0);

  const totalTotal = tab === 'ventas'
    ? ventasRows.reduce((s, r) => s + r.total, 0)
    : comprasRows.reduce((s, r) => s + r.total, 0);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div>
      <PageHeader
        title="Libro IVA"
        subtitle="Registro de comprobantes para liquidación de IVA"
        actions={
          <Button onClick={handleExport} isLoading={isExporting} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('ventas')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'ventas'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          IVA Ventas
        </button>
        <button
          onClick={() => setTab('compras')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'compras'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          IVA Compras
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-4 mb-6">
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-sm text-gray-500">Neto Gravado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalNeto)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">IVA</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalIva)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalTotal)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : tab === 'ventas' ? (
          ventasRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No hay comprobantes de ventas en este período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Fecha</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Número</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">N° AFIP</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Tipo</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Cliente</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">CUIT</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 uppercase text-xs">Neto</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 uppercase text-xs">IVA</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 uppercase text-xs">Total</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">CAE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ventasRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600">{formatDate(row.fecha)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.numero}</td>
                      <td className="px-3 py-2 text-gray-500">{row.afipCbtNum || '-'}</td>
                      <td className="px-3 py-2">
                        <Badge className="bg-blue-50 text-blue-700 text-xs">
                          {INVOICE_TYPES[row.tipo as keyof typeof INVOICE_TYPES] || row.tipo}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-900">{row.cliente}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.cuitCliente || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.neto)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.iva)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-green-700">{row.cae || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          comprasRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No hay comprobantes de compras en este período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Fecha</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Número</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Tipo</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">Proveedor</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase text-xs">CUIT</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 uppercase text-xs">Neto</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 uppercase text-xs">IVA</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 uppercase text-xs">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comprasRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600">{formatDate(row.fecha)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.numero}</td>
                      <td className="px-3 py-2">
                        <Badge className="bg-purple-50 text-purple-700 text-xs">
                          {INVOICE_TYPES[row.tipo as keyof typeof INVOICE_TYPES] || row.tipo}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-900">{row.proveedor}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.cuitProveedor || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.neto)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.iva)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}
