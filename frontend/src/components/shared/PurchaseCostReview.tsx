import { useState } from 'react';
import { Button } from '../ui';
import { formatCurrency } from '../../utils/formatters';

/** Producto de la factura cuyo costo cambia respecto del que tiene cargado. */
export interface CostCandidate {
  productId: string;
  name:      string;
  sku?:      string | null;
  /** Costo actual en la moneda de la factura (null = no se puede expresar). */
  current:   number | null;
  /** Costo unitario facturado (neto de descuentos, sin IVA), en la moneda de la factura. */
  next:      number;
  /** Precio de venta actual y el que quedaría manteniendo el margen (pesos). */
  price:     number;
  priceKeepingMargin: number | null;
  /** Tiene costo en USD y la factura es en pesos: el USD se recalcula con el dólar del día. */
  usdFromArs: boolean;
}

interface Props {
  candidates: CostCandidate[];
  currency:   string;
  isLoading?: boolean;
  onCancel:   () => void;
  onConfirm:  (update: { productIds: string[]; keepMargin: boolean }) => void;
}

/**
 * Paso previo al guardado de la factura de compra: muestra los productos cuyo
 * costo cambia con lo facturado y deja elegir cuáles actualizar. Se dibuja
 * como overlay sobre el panel de la factura (igual que la confirmación de cierre).
 */
export function PurchaseCostReview({ candidates, currency, isLoading, onCancel, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((c) => c.productId)));
  const [keepMargin, setKeepMargin] = useState(false);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = selected.size === candidates.length;

  const variation = (c: CostCandidate) =>
    c.current && c.current > 0 ? ((c.next - c.current) / c.current) * 100 : null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4 rounded-2xl overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col">
        <div className="p-5 pb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            Cambió el costo de {candidates.length} producto{candidates.length === 1 ? '' : 's'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            Costo facturado por unidad, neto de descuentos y sin IVA. Elegí cuáles actualizar en el producto.
          </p>
        </div>

        <div className="px-5 overflow-y-auto min-h-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                <th className="py-2 pr-2 w-6">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.productId)))}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="py-2 pr-2 font-medium">Producto</th>
                <th className="py-2 px-2 font-medium text-right">Costo actual</th>
                <th className="py-2 px-2 font-medium text-right">Facturado</th>
                <th className="py-2 pl-2 font-medium text-right">Var.</th>
                {keepMargin && <th className="py-2 pl-3 font-medium text-right">Precio de venta</th>}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const v = variation(c);
                return (
                  <tr
                    key={c.productId}
                    className="border-b border-gray-50 dark:border-slate-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/40"
                    onClick={() => toggle(c.productId)}
                  >
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={selected.has(c.productId)} onChange={() => toggle(c.productId)} onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="py-2 pr-2 text-gray-900 dark:text-white">
                      {c.name}
                      {c.sku && <span className="ml-1.5 text-gray-400 dark:text-slate-500">{c.sku}</span>}
                      {c.usdFromArs && (
                        <span className="block text-[11px] text-gray-400 dark:text-slate-500">Tiene costo en USD: se recalcula con el dólar del día</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {c.current != null ? formatCurrency(c.current, currency) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(c.next, currency)}
                    </td>
                    <td className={`py-2 pl-2 text-right whitespace-nowrap ${v == null ? 'text-gray-400' : v > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                    </td>
                    {keepMargin && (
                      <td className="py-2 pl-3 text-right whitespace-nowrap text-gray-700 dark:text-slate-300">
                        {c.priceKeepingMargin != null && Math.abs(c.priceKeepingMargin - c.price) >= 0.01
                          ? <>{formatCurrency(c.price, 'ARS')} → <span className="font-medium">{formatCurrency(c.priceKeepingMargin, 'ARS')}</span></>
                          : formatCurrency(c.price, 'ARS')}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-5 pt-3 border-t border-gray-100 dark:border-slate-700">
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300 mb-4 cursor-pointer">
            <input type="checkbox" checked={keepMargin} onChange={(e) => setKeepMargin(e.target.checked)} />
            Mantener el margen: el precio de venta sube o baja en la misma proporción que el costo
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>Volver a la factura</Button>
            <Button variant="outline" size="sm" onClick={() => onConfirm({ productIds: [], keepMargin: false })} disabled={isLoading}>
              Guardar sin actualizar
            </Button>
            <Button
              size="sm"
              isLoading={isLoading}
              disabled={selected.size === 0}
              onClick={() => onConfirm({ productIds: [...selected], keepMargin })}
            >
              Guardar y actualizar {selected.size}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
