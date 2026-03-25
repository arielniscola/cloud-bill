import { useState } from 'react';
import { X, PackageCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import type { OrdenCompra } from '../../types';

interface ReceivedItem {
  itemId: string;
  receivedQty: number;
}

interface Props {
  oc: OrdenCompra;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (receivedItems: ReceivedItem[]) => Promise<void>;
  isLoading: boolean;
}

export function ReceiveOrdenCompraModal({ oc, isOpen, onClose, onConfirm, isLoading }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries((oc.items ?? []).map((i) => [i.id, Number(i.quantity)]))
  );

  if (!isOpen) return null;

  const items = oc.items ?? [];

  const handleQtyChange = (itemId: string, value: string) => {
    const num = Math.max(0, parseFloat(value) || 0);
    setQuantities((prev) => ({ ...prev, [itemId]: num }));
  };

  const discrepancies = items.filter((i) => quantities[i.id] !== Number(i.quantity));
  const hasDiscrepancies = discrepancies.length > 0;
  const allZero = items.every((i) => quantities[i.id] === 0);

  const handleConfirm = () => {
    const receivedItems = items.map((i) => ({ itemId: i.id, receivedQty: quantities[i.id] }));
    onConfirm(receivedItems);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <PackageCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Revisión de recepción
              </h2>
              <p className="text-xs text-gray-400 dark:text-slate-500">{oc.number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status banner */}
        {hasDiscrepancies ? (
          <div className="flex items-center gap-2.5 mx-6 mt-4 px-3.5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>{discrepancies.length}</strong> ítem{discrepancies.length > 1 ? 's' : ''} con
              cantidad recibida diferente a la pedida. Se registrará la diferencia en la compra.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 mx-6 mt-4 px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Todos los ítems están completos.</span>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="hidden md:grid grid-cols-[3fr_80px_80px_80px] gap-3 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">
            <span>Producto</span>
            <span className="text-right">Pedido</span>
            <span className="text-right">Recibido</span>
            <span className="text-right">Diferencia</span>
          </div>

          <div className="divide-y divide-gray-50 dark:divide-slate-700 border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden">
            {items.map((item) => {
              const ordered = Number(item.quantity);
              const received = quantities[item.id] ?? ordered;
              const diff = received - ordered;
              const isDiff = diff !== 0;

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-1 md:grid-cols-[3fr_80px_80px_80px] gap-3 px-4 py-3 items-center bg-white dark:bg-slate-800 ${
                    isDiff ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
                  }`}
                >
                  {/* Description */}
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-tight">
                      {item.description}
                    </p>
                    {item.product && (
                      <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400">
                        {item.product.name}
                      </span>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatCurrency(Number(item.unitPrice), oc.currency)} c/u
                    </p>
                  </div>

                  {/* Ordered */}
                  <div className="flex items-center justify-end">
                    <span className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">
                      {ordered}
                    </span>
                  </div>

                  {/* Received input */}
                  <div className="flex justify-end">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={quantities[item.id] ?? ''}
                      onChange={(e) => handleQtyChange(item.id, e.target.value)}
                      className={`w-20 text-right text-sm font-semibold px-2 py-1.5 rounded-lg border outline-none transition-colors tabular-nums
                        ${isDiff
                          ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 focus:ring-2 focus:ring-amber-300'
                          : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700'
                        }`}
                    />
                  </div>

                  {/* Difference */}
                  <div className="flex justify-end">
                    {isDiff ? (
                      <span className={`text-sm font-semibold tabular-nums ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    ) : (
                      <span className="text-emerald-500">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={allZero}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <PackageCheck className="w-4 h-4 mr-1.5" />
            Confirmar recepción
          </Button>
        </div>
      </div>
    </div>
  );
}
