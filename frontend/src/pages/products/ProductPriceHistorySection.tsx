import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { Card } from '../../components/ui';
import { productsService } from '../../services';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { PRICE_SOURCE_LABEL, pctChange, formatPct } from '../../utils/priceHistory';
import type { PriceHistoryEntry } from '../../types';

const COLLAPSED = 8;

/** Valor anterior → nuevo, con la variación; solo el nuevo si no cambió. */
function Change({ oldV, newV, currency }: { oldV: number | null; newV: number | null; currency: string }) {
  if (newV == null && oldV == null) return <span className="text-gray-300 dark:text-slate-600">—</span>;
  const changed = oldV != null && newV != null && Math.abs(newV - oldV) >= 0.005;
  const pct = pctChange(oldV, newV);
  if (!changed) return <span className="text-gray-500 dark:text-slate-400">{formatCurrency(newV ?? oldV ?? 0, currency)}</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-gray-400 dark:text-slate-500">{formatCurrency(oldV!, currency)}</span>
      {' → '}
      <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(newV!, currency)}</span>
      {pct != null && (
        <span className={`ml-1.5 text-xs ${pct > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {formatPct(pct)}
        </span>
      )}
    </span>
  );
}

const margin = (cost: number | null, price: number | null) =>
  cost != null && price != null && cost > 0 ? `${(((price - cost) / cost) * 100).toFixed(1)}%` : '—';

/**
 * Historial de costo y precio del producto: quién, cuándo y por qué vía
 * (edición, masiva, importación, recálculo USD, factura de compra).
 */
export default function ProductPriceHistorySection({ productId, reloadKey, className = 'max-w-7xl mt-6' }: {
  productId: string;
  reloadKey?: unknown;
  className?: string;
}) {
  const [rows, setRows] = useState<PriceHistoryEntry[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    productsService.getPriceHistory(productId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [productId, reloadKey]);

  if (rows === null) return null;
  const hasUsd = rows.some((r) => r.newCostUSD != null || r.oldCostUSD != null || r.newSalePriceUSD != null || r.oldSalePriceUSD != null);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);

  return (
    <Card className={className}>
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Historial de precios</h2>
        <span className="text-xs text-gray-400 dark:text-slate-500">({rows.length})</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Todavía no hay cambios registrados. El historial empieza a registrarse desde esta versión.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                <th className="px-2 py-2 font-medium">Fecha</th>
                <th className="px-2 py-2 font-medium">Origen</th>
                <th className="px-2 py-2 font-medium">Usuario</th>
                <th className="px-2 py-2 font-medium text-right">Costo</th>
                <th className="px-2 py-2 font-medium text-right">Precio venta</th>
                <th className="px-2 py-2 font-medium text-right">Margen</th>
                {hasUsd && <th className="px-2 py-2 font-medium text-right">Costo USD</th>}
                {hasUsd && <th className="px-2 py-2 font-medium text-right">Precio USD</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-slate-700/50">
                  <td className="px-2 py-2 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                  <td className="px-2 py-2 text-gray-700 dark:text-slate-300">
                    {PRICE_SOURCE_LABEL[r.source] ?? r.source}
                    {r.invoiceNumber && r.ref && (
                      <Link to={`/purchase-invoices/${encodeURIComponent(r.ref)}`} className="ml-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                        {r.invoiceNumber}
                      </Link>
                    )}
                    {r.ref && r.source !== 'PURCHASE_INVOICE' && (
                      <Link to={`/products/price-history?ref=${encodeURIComponent(r.ref)}`} className="ml-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                        ver operación
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2 text-gray-500 dark:text-slate-400">{r.userName ?? '—'}</td>
                  <td className="px-2 py-2 text-right"><Change oldV={r.oldCost} newV={r.newCost} currency="ARS" /></td>
                  <td className="px-2 py-2 text-right"><Change oldV={r.oldPrice} newV={r.newPrice} currency="ARS" /></td>
                  <td className="px-2 py-2 text-right text-gray-500 dark:text-slate-400">{margin(r.newCost, r.newPrice)}</td>
                  {hasUsd && <td className="px-2 py-2 text-right"><Change oldV={r.oldCostUSD} newV={r.newCostUSD} currency="USD" /></td>}
                  {hasUsd && <td className="px-2 py-2 text-right"><Change oldV={r.oldSalePriceUSD} newV={r.newSalePriceUSD} currency="USD" /></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 mx-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {expanded ? 'Ver menos' : `Ver los ${rows.length} cambios`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
