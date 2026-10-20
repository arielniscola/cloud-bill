import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Layers, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Modal, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { ExpiryBadge } from '../../components/shared/LotPicker';
import { isExpired } from '../../utils/stockLots';
import { stockService, warehousesService } from '../../services';
import { formatDateTime, formatNumber } from '../../utils/formatters';
import type { StockLot, StockLotTrace, Warehouse } from '../../types';

const EXPIRY_OPTIONS = [
  { value: '', label: 'Todos los vencimientos' },
  { value: 'expired', label: 'Vencidos' },
  { value: '30', label: 'Vencen en 30 días' },
  { value: '60', label: 'Vencen en 60 días' },
  { value: '90', label: 'Vencen en 90 días' },
];

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : formatNumber(n, 2));

const DOC_LINK: Record<string, (id: string) => string> = {
  INVOICE: (id) => `/invoices/${id}`,
  REMITO: (id) => `/remitos/${id}`,
  ORDEN_PEDIDO: (id) => `/orden-pedidos/${id}`,
  PURCHASE_REMITO: (id) => `/purchase-remitos/${id}`,
};

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  REMITO_OUT: 'Remito',
  RETURN: 'Devolución',
  ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste −',
  TRANSFER_IN: 'Transferencia (entra)',
  TRANSFER_OUT: 'Transferencia (sale)',
};

export default function StockLotsPage() {
  const [lots, setLots] = useState<StockLot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expiry, setExpiry] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [trace, setTrace] = useState<StockLotTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  useEffect(() => {
    warehousesService.getAll().then((w) => setWarehouses(w.filter((x) => x.isActive))).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    stockService
      .getLots({
        search: debounced || undefined,
        warehouseId: warehouseId || undefined,
        expiry: expiry || undefined,
        withStock: showEmpty ? false : undefined,
      })
      .then((data) => { if (!cancelled) setLots(data); })
      .catch(() => { if (!cancelled) setLots([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, warehouseId, expiry, showEmpty]);

  const summary = useMemo(() => {
    const withStock = lots.filter((l) => l.quantity > 0);
    return {
      total: withStock.length,
      expired: withStock.filter((l) => isExpired(l)).length,
      soon: withStock.filter((l) => l.daysToExpiry !== null && l.daysToExpiry >= 0 && l.daysToExpiry <= 30).length,
    };
  }, [lots]);

  const openTrace = async (lot: StockLot) => {
    setTraceLoading(true);
    setTrace({ ...lot, productId: lot.productId, movements: [] } as unknown as StockLotTrace);
    try {
      setTrace(await stockService.getLotTrace(lot.id));
    } finally {
      setTraceLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Lotes" subtitle="Stock por lote, vencimientos y a quién se entregó cada uno" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <button
          type="button"
          onClick={() => setExpiry('')}
          className="text-left p-4 rounded-xl border bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700"
        >
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{summary.total}</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">Lotes con stock</p>
        </button>
        <button
          type="button"
          onClick={() => setExpiry('30')}
          className="text-left p-4 rounded-xl border bg-white dark:bg-slate-800 border-amber-200 dark:border-amber-800"
        >
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{summary.soon}</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">Vencen en 30 días</p>
        </button>
        <button
          type="button"
          onClick={() => setExpiry('expired')}
          className="text-left p-4 rounded-xl border bg-white dark:bg-slate-800 border-red-200 dark:border-red-800"
        >
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{summary.expired}</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">Vencidos con stock</p>
        </button>
      </div>

      <Card padding="none">
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-gray-100 dark:border-slate-700">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <label htmlFor="lot-search" className="sr-only">Buscar</label>
            <input
              id="lot-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Producto, SKU o número de lote…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <div className="w-52">
            <Select
              options={[{ value: '', label: 'Todos los depósitos' }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
              value={warehouseId}
              onChange={setWarehouseId}
            />
          </div>
          <div className="w-52">
            <Select options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 select-none">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            Incluir agotados
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/60 text-xs uppercase text-gray-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-left font-semibold">Lote</th>
                <th className="px-4 py-3 text-left font-semibold">Vencimiento</th>
                <th className="px-4 py-3 text-left font-semibold">Depósito</th>
                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
              ) : lots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-slate-600" aria-hidden="true" />
                    <p className="text-gray-500 dark:text-slate-400">No hay lotes para estos filtros.</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                      Los lotes aparecen al ingresar mercadería de productos con «Maneja lotes y vencimientos».
                    </p>
                  </td>
                </tr>
              ) : (
                lots.map((l) => (
                  <tr key={l.id} className={clsx(isExpired(l) && l.quantity > 0 && 'bg-red-50/40 dark:bg-red-900/10')}>
                    <td className="px-4 py-3">
                      <Link to={`/products/${l.productId}/edit`} className="font-medium text-gray-900 dark:text-white hover:underline">
                        {l.productName}
                      </Link>
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">
                        {l.productSku}{l.variantName ? ` · ${l.variantName}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-900 dark:text-white">{l.lotNumber}</td>
                    <td className="px-4 py-3"><ExpiryBadge lot={l} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{l.warehouseName}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                      {fmtQty(l.quantity)} <span className="text-xs font-normal text-gray-400">{l.productUnit ?? ''}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openTrace(l)}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        Trazabilidad
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={trace !== null}
        onClose={() => setTrace(null)}
        title={trace ? `Lote ${trace.lotNumber} · ${trace.productName}` : ''}
        size="xl"
      >
        {trace && (
          <div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4 text-sm text-gray-600 dark:text-slate-300">
              <span>Depósito: <strong className="text-gray-900 dark:text-white">{trace.warehouseName}</strong></span>
              <span>Stock actual: <strong className="text-gray-900 dark:text-white tabular-nums">{fmtQty(trace.quantity)}</strong></span>
              <span>Vencimiento: <strong className="text-gray-900 dark:text-white">{trace.expiresAt ? trace.expiresAt.split('-').reverse().join('/') : 'sin vencimiento'}</strong></span>
            </div>
            {traceLoading ? (
              <p className="py-8 text-center text-gray-400">Cargando movimientos…</p>
            ) : trace.movements.length === 0 ? (
              <p className="py-8 text-center text-gray-400">Sin movimientos.</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold">Movimiento</th>
                      <th className="px-3 py-2 text-left font-semibold">Comprobante</th>
                      <th className="px-3 py-2 text-left font-semibold">Cliente / Proveedor</th>
                      <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {trace.movements.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2 text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 text-gray-700 dark:text-slate-200">
                            {m.outgoing
                              ? <ArrowUpRight className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                              : <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />}
                            {MOVEMENT_LABEL[m.type] ?? m.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.documentNumber && m.documentType && m.referenceId ? (
                            <Link to={DOC_LINK[m.documentType](m.referenceId)} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                              {m.documentNumber}
                            </Link>
                          ) : (
                            <span className="text-gray-400">{m.reason ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-slate-200">{m.customerName ?? m.supplierName ?? '—'}</td>
                        <td className={clsx('px-3 py-2 text-right font-semibold tabular-nums', m.outgoing ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {m.outgoing ? '−' : '+'}{fmtQty(m.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
