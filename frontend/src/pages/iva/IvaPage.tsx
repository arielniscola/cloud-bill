import { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, Info, X, ArrowUpRight, FileText, Truck, Calendar, Hash, Shield, CreditCard, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, Button, Badge } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { ivaService } from '../../services';
import { exportIvaComprasExcel, exportIvaVentasExcel } from '../../utils/ivaExcel';
import { formatCurrency, formatDate, formatCuit } from '../../utils/formatters';
import { INVOICE_TYPES, INVOICE_STATUSES, SALE_CONDITIONS } from '../../utils/constants';
import type { IvaVentasRow, IvaComprasRow } from '../../types';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type Tab = 'ventas' | 'compras';

const STATUS_LABELS: Record<string, string> = {
  ...INVOICE_STATUSES,
  RECEIVED: 'Recibida',
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  PARTIALLY_PAID: 'Parcialmente Pagada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  ISSUED: 'bg-sky-50 text-sky-700 border border-sky-200',
  AUTHORIZED: 'bg-violet-50 text-violet-700 border border-violet-200',
  PAID: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border border-amber-200',
  CANCELLED: 'bg-rose-50 text-rose-600 border border-rose-200',
  RECEIVED: 'bg-sky-50 text-sky-700 border border-sky-200',
  PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
};

export default function IvaPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [tab, setTab] = useState<Tab>('ventas');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [ventasRows, setVentasRows] = useState<IvaVentasRow[]>([]);
  const [comprasRows, setComprasRows] = useState<IvaComprasRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingTxt, setIsExportingTxt] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<IvaVentasRow | null>(null);
  const [selectedCompra, setSelectedCompra] = useState<IvaComprasRow | null>(null);

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
        const data = ventasRows.length ? ventasRows : await ivaService.getVentas(year, month);
        if (data.length === 0) { toast.error('No hay comprobantes para exportar'); return; }
        exportIvaVentasExcel(data, year, month);
      } else {
        const data = comprasRows.length ? comprasRows : await ivaService.getCompras(year, month);
        if (data.length === 0) { toast.error('No hay comprobantes para exportar'); return; }
        exportIvaComprasExcel(data, year, month);
      }
    } catch {
      toast.error('Error al exportar el Libro IVA');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportIvaDigital = async () => {
    setIsExportingTxt(true);
    try {
      const count = await ivaService.exportComprasIvaDigital(year, month);
      if (count === 0) {
        toast.error('No hay comprobantes para exportar en este período');
      } else {
        toast.success(`Libro IVA Digital generado (${count} comprobantes)`);
      }
    } catch {
      toast.error('Error al generar el Libro IVA Digital');
    } finally {
      setIsExportingTxt(false);
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

  const showModal = !!(selectedVenta || selectedCompra);

  return (
    <div>
      <PageHeader
        title="Libro IVA"
        subtitle="Registro de comprobantes para liquidación de IVA"
        actions={
          <div className="flex items-center gap-2">
            {tab === 'compras' && (
              <Button onClick={handleExportIvaDigital} isLoading={isExportingTxt} variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                IVA Digital (ARCA)
              </Button>
            )}
            <Button onClick={handleExport} isLoading={isExporting} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        }
      />

      {/* Fiscal mode notice */}
      <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          El Libro IVA muestra únicamente comprobantes en modo <strong>FORMAL</strong> (los declarados a AFIP). Los movimientos INFORMALES quedan excluidos independientemente del contexto seleccionado.
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('ventas')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'ventas'
              ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          IVA Ventas
        </button>
        <button
          onClick={() => setTab('compras')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'compras'
              ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          IVA Compras
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-4 mb-6">
        <select
          className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-sm text-gray-500 dark:text-slate-400">Neto Gravado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalNeto)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-slate-400">IVA</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalIva)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-slate-400">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalTotal)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">Cargando...</div>
        ) : tab === 'ventas' ? (
          ventasRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              No hay comprobantes de ventas en este período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Fecha</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Número</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">N° AFIP</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Tipo</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Cliente</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">CUIT</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Neto</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">IVA</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Total</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">CAE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {ventasRows.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => setSelectedVenta(row)}
                    >
                      <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{formatDate(row.fecha)}</td>
                      <td className="px-3 py-2 font-mono text-xs dark:text-slate-300">{row.numero}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-slate-400">{row.afipCbtNum || '-'}</td>
                      <td className="px-3 py-2">
                        <Badge className="bg-blue-50 text-blue-700 text-xs">
                          {INVOICE_TYPES[row.tipo as keyof typeof INVOICE_TYPES] || row.tipo}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{row.cliente}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-slate-400">{formatCuit(row.cuitCliente) || '-'}</td>
                      <td className="px-3 py-2 text-right dark:text-slate-300">{formatCurrency(row.neto)}</td>
                      <td className="px-3 py-2 text-right dark:text-slate-300">{formatCurrency(row.iva)}</td>
                      <td className="px-3 py-2 text-right font-medium dark:text-slate-200">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-green-700">{row.cae || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          comprasRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              No hay comprobantes de compras en este período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Fecha</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Número</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Tipo</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Proveedor</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">CUIT</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Neto</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">IVA</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 dark:text-slate-400 uppercase text-xs">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {comprasRows.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => setSelectedCompra(row)}
                    >
                      <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{formatDate(row.fecha)}</td>
                      <td className="px-3 py-2 font-mono text-xs dark:text-slate-300">{row.numero}</td>
                      <td className="px-3 py-2">
                        <Badge className="bg-purple-50 text-purple-700 text-xs">
                          {INVOICE_TYPES[row.tipo as keyof typeof INVOICE_TYPES] || row.tipo}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{row.proveedor}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-slate-400">{formatCuit(row.cuitProveedor) || '-'}</td>
                      <td className="px-3 py-2 text-right dark:text-slate-300">{formatCurrency(row.neto)}</td>
                      <td className="px-3 py-2 text-right dark:text-slate-300">{formatCurrency(row.iva)}</td>
                      <td className="px-3 py-2 text-right font-medium dark:text-slate-200">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      {/* Detail Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur */}
          <div
            className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => { setSelectedVenta(null); setSelectedCompra(null); }}
          />

          {/* Panel */}
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden
              bg-white dark:bg-slate-800
              rounded-2xl
              border border-slate-200/60 dark:border-slate-700/60
              shadow-[0_25px_50px_-12px_rgba(15,23,42,0.15)]
              dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]
              transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
              animate-[modalIn_0.25s_ease-out]"
            style={{ animationFillMode: 'both' }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-700/50">
              <div className="px-7 py-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className={`mt-0.5 flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    selectedVenta
                      ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                      : 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  }`}>
                    {selectedVenta ? <FileText className="w-5 h-5" strokeWidth={1.5} /> : <Truck className="w-5 h-5" strokeWidth={1.5} />}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
                      {selectedVenta ? 'Detalle de Venta' : 'Detalle de Compra'}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-slate-400 mt-0.5 font-mono tracking-wide">
                      {selectedVenta?.numero ?? selectedCompra?.numero}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedVenta(null); setSelectedCompra(null); }}
                  className="p-2 -m-1 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-200
                    hover:bg-zinc-100 dark:hover:bg-slate-700/50
                    transition-all duration-200 active:scale-95"
                >
                  <X className="w-4.5 h-4.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto max-h-[calc(85vh-80px)] overscroll-contain">
              <div className="px-7 py-6 space-y-6">

                {/* ── Ventas detail ── */}
                {selectedVenta && (
                  <>
                    {/* Status + type strip */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[selectedVenta.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          selectedVenta.status === 'PAID' ? 'bg-emerald-500' :
                          selectedVenta.status === 'ISSUED' ? 'bg-sky-500' :
                          selectedVenta.status === 'PARTIALLY_PAID' ? 'bg-amber-500' :
                          selectedVenta.status === 'CANCELLED' ? 'bg-rose-400' : 'bg-zinc-400'
                        }`} />
                        {STATUS_LABELS[selectedVenta.status] ?? selectedVenta.status}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800">
                        {INVOICE_TYPES[selectedVenta.tipo as keyof typeof INVOICE_TYPES] || selectedVenta.tipo}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                        {SALE_CONDITIONS[selectedVenta.saleCondition as keyof typeof SALE_CONDITIONS] ?? selectedVenta.saleCondition}
                      </span>
                    </div>

                    {/* Info grid — asymmetric 3-col */}
                    <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                      <InfoField icon={<Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Fecha" value={formatDate(selectedVenta.fecha)} />
                      <InfoField label="Cliente" value={selectedVenta.cliente} />
                      <InfoField label="CUIT" value={formatCuit(selectedVenta.cuitCliente) || '-'} mono />
                      <InfoField icon={<Shield className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Condición IVA" value={selectedVenta.condicionIva?.replace(/_/g, ' ') || '-'} />
                      {selectedVenta.paymentTerms && (
                        <InfoField icon={<CreditCard className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Términos de pago" value={selectedVenta.paymentTerms} />
                      )}
                      {selectedVenta.afipCbtNum ? (
                        <InfoField icon={<Hash className="w-3.5 h-3.5" strokeWidth={1.5} />} label="N. AFIP" value={String(selectedVenta.afipCbtNum)} mono />
                      ) : null}
                      {selectedVenta.cae ? (
                        <InfoField icon={<Receipt className="w-3.5 h-3.5" strokeWidth={1.5} />} label="CAE" value={selectedVenta.cae} mono />
                      ) : null}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60" />

                    {/* Items */}
                    {selectedVenta.items.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-3">Items del comprobante</p>
                        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50/80 dark:bg-slate-700/30">
                                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Descripción</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Cant.</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">P. Unit.</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">IVA</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                              {selectedVenta.items.map((item, idx) => (
                                <tr key={idx} className="group">
                                  <td className="px-4 py-2.5 text-zinc-800 dark:text-slate-200">{item.description}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-500 dark:text-slate-400 tabular-nums">{item.quantity}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-500 dark:text-slate-400 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-400 dark:text-slate-500 tabular-nums">{item.taxRate}%</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-medium text-zinc-800 dark:text-slate-200 tabular-nums">{formatCurrency(item.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="rounded-xl bg-slate-50/70 dark:bg-slate-700/20 border border-slate-200/60 dark:border-slate-700/40 p-5">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500 dark:text-slate-400">Neto Gravado</span>
                          <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(selectedVenta.neto)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500 dark:text-slate-400">IVA</span>
                          <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(selectedVenta.iva)}</span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-600/50">
                          <span className="text-sm font-semibold text-zinc-700 dark:text-slate-200">Total</span>
                          <span className="text-lg font-bold font-mono tabular-nums tracking-tight text-zinc-900 dark:text-white">{formatCurrency(selectedVenta.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={() => { setSelectedVenta(null); navigate(`/invoices/${selectedVenta.invoiceId}`); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                        rounded-xl text-sm font-medium
                        text-indigo-600 dark:text-indigo-400
                        bg-indigo-50/60 dark:bg-indigo-500/10
                        border border-indigo-200/60 dark:border-indigo-500/20
                        hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20
                        active:scale-[0.98]
                        transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    >
                      Ver comprobante completo
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </>
                )}

                {/* ── Compras detail ── */}
                {selectedCompra && (
                  <>
                    {/* Status + type strip */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[selectedCompra.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          selectedCompra.status === 'PAID' || selectedCompra.status === 'RECEIVED' ? 'bg-emerald-500' :
                          selectedCompra.status === 'PENDING' ? 'bg-amber-500' :
                          selectedCompra.status === 'CANCELLED' ? 'bg-rose-400' : 'bg-zinc-400'
                        }`} />
                        {STATUS_LABELS[selectedCompra.status] ?? selectedCompra.status}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                        {INVOICE_TYPES[selectedCompra.tipo as keyof typeof INVOICE_TYPES] || selectedCompra.tipo}
                      </span>
                      {selectedCompra.paymentStatus && (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[selectedCompra.paymentStatus] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {STATUS_LABELS[selectedCompra.paymentStatus] ?? selectedCompra.paymentStatus}
                        </span>
                      )}
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                        {SALE_CONDITIONS[selectedCompra.saleCondition as keyof typeof SALE_CONDITIONS] ?? selectedCompra.saleCondition}
                      </span>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                      <InfoField icon={<Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Fecha" value={formatDate(selectedCompra.fecha)} />
                      <InfoField label="Proveedor" value={selectedCompra.proveedor} />
                      <InfoField label="CUIT" value={formatCuit(selectedCompra.cuitProveedor) || '-'} mono />
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60" />

                    {/* Items */}
                    {selectedCompra.items.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-3">Items del comprobante</p>
                        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50/80 dark:bg-slate-700/30">
                                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Descripción</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Cant.</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">P. Unit.</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">IVA</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                              {selectedCompra.items.map((item, idx) => (
                                <tr key={idx} className="group">
                                  <td className="px-4 py-2.5 text-zinc-800 dark:text-slate-200">{item.description}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-500 dark:text-slate-400 tabular-nums">{item.quantity}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-500 dark:text-slate-400 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-400 dark:text-slate-500 tabular-nums">{item.taxRate}%</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-medium text-zinc-800 dark:text-slate-200 tabular-nums">{formatCurrency(item.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="rounded-xl bg-slate-50/70 dark:bg-slate-700/20 border border-slate-200/60 dark:border-slate-700/40 p-5">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500 dark:text-slate-400">Neto Gravado</span>
                          <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(selectedCompra.neto)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500 dark:text-slate-400">IVA</span>
                          <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(selectedCompra.iva)}</span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-600/50">
                          <span className="text-sm font-semibold text-zinc-700 dark:text-slate-200">Total</span>
                          <span className="text-lg font-bold font-mono tabular-nums tracking-tight text-zinc-900 dark:text-white">{formatCurrency(selectedCompra.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={() => { setSelectedCompra(null); navigate('/purchase-invoices'); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                        rounded-xl text-sm font-medium
                        text-indigo-600 dark:text-indigo-400
                        bg-indigo-50/60 dark:bg-indigo-500/10
                        border border-indigo-200/60 dark:border-indigo-500/20
                        hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20
                        active:scale-[0.98]
                        transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    >
                      Ver comprobante completo
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal entrance animation */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function InfoField({ label, value, mono, icon }: { label: string; value: React.ReactNode; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-1">
        {icon}
        {label}
      </p>
      <p className={`text-sm text-zinc-800 dark:text-slate-200 truncate ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</p>
    </div>
  );
}
