import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { CheckSquare, Square, ChevronDown, ChevronRight, AlertTriangle, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui';
import { Button } from '../ui';
import { ordenPedidosService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { OrdenPedido } from '../../types';

export interface ImportedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  onImport: (items: ImportedItem[], skippedCount: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED:      'Confirmada',
  PARTIALLY_PAID: 'Pago parcial',
};
const STATUS_CLASS: Record<string, string> = {
  CONFIRMED:      'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-800',
  PARTIALLY_PAID: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800',
};

export default function ImportFromOPModal({ isOpen, onClose, customerId, onImport }: Props) {
  const [ops, setOps]               = useState<OrdenPedido[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setIsLoading(true);
    setSelected(new Set());
    setExpanded(new Set());
    ordenPedidosService
      .getAll({ customerId, status: 'CONFIRMED', limit: 100 })
      .then(async (r1) => {
        const r2 = await ordenPedidosService.getAll({ customerId, status: 'PARTIALLY_PAID', limit: 100 });
        setOps([...r1.data, ...r2.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      })
      .catch(() => toast.error('Error al cargar órdenes de pedido'))
      .finally(() => setIsLoading(false));
  }, [isOpen, customerId]);

  const toggleOp = (id: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleAll = () => {
    if (selected.size === ops.length) setSelected(new Set());
    else setSelected(new Set(ops.map((op) => op.id)));
  };

  const handleImport = () => {
    const chosenOps = ops.filter((op) => selected.has(op.id));
    const allItems  = chosenOps.flatMap((op) => op.items ?? []);
    const valid     = allItems.filter((i) => !!i.productId);
    const skipped   = allItems.length - valid.length;

    const importedItems: ImportedItem[] = valid.map((i) => ({
      productId: i.productId!,
      quantity:  Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      taxRate:   Number(i.taxRate),
    }));

    onImport(importedItems, skipped);
    onClose();
  };

  const selectedCount = selected.size;
  const totalItems    = ops.filter((op) => selected.has(op.id)).flatMap((op) => op.items ?? []).length;
  const validItems    = ops.filter((op) => selected.has(op.id)).flatMap((op) => op.items ?? []).filter((i) => !!i.productId).length;
  const skippedItems  = totalItems - validItems;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar desde Órdenes de Pedido" size="lg">
      <div className="space-y-4">

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl" />
            ))}
          </div>
        ) : ops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="w-8 h-8 text-gray-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Sin órdenes disponibles</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
              No hay órdenes confirmadas o con pago parcial para este cliente.
            </p>
          </div>
        ) : (
          <>
            {/* Select all */}
            <div className="flex items-center justify-between">
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-indigo-600 transition-colors"
              >
                {selected.size === ops.length
                  ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                  : <Square className="w-4 h-4" />
                }
                Seleccionar todas ({ops.length})
              </button>
              {selectedCount > 0 && (
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {selectedCount} OP{selectedCount !== 1 ? 's' : ''} · {validItems} ítem{validItems !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* OP list */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
              {ops.map((op) => {
                const isSelected = selected.has(op.id);
                const isExpanded = expanded.has(op.id);
                const opSkipped  = (op.items ?? []).filter((i) => !i.productId).length;

                return (
                  <div
                    key={op.id}
                    className={clsx(
                      'rounded-xl border transition-all duration-150 overflow-hidden',
                      isSelected
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10'
                        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    )}
                  >
                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-3.5 py-3 cursor-pointer"
                      onClick={() => toggleOp(op.id)}
                    >
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      }

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">{op.number}</span>
                          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', STATUS_CLASS[op.status])}>
                            {STATUS_LABEL[op.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(op.date)}</span>
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            {(op.items ?? []).length} ítem{(op.items ?? []).length !== 1 ? 's' : ''}
                          </span>
                          {opSkipped > 0 && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              {opSkipped} sin producto
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums flex-shrink-0">
                        {formatCurrency(Number(op.total), op.currency)}
                      </span>

                      <button
                        onClick={(e) => toggleExpand(op.id, e)}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-slate-700 divide-y divide-gray-50 dark:divide-slate-700/50">
                        {(op.items ?? []).map((item) => (
                          <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {item.productId
                                ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                : <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Sin producto vinculado — será omitido" />
                              }
                              <span className={clsx('text-xs truncate', item.productId ? 'text-gray-700 dark:text-slate-300' : 'text-amber-600 dark:text-amber-400')}>
                                {item.description}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                              {item.quantity} × {formatCurrency(Number(item.unitPrice), op.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Warning about skipped items */}
            {selectedCount > 0 && skippedItems > 0 && (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>{skippedItems} ítem{skippedItems !== 1 ? 's' : ''}</strong> no se importarán porque no tienen un producto vinculado.
                  Las facturas requieren producto en cada ítem.
                </span>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100 dark:border-slate-700">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={selectedCount === 0 || validItems === 0}
          >
            Importar {validItems > 0 ? `${validItems} ítem${validItems !== 1 ? 's' : ''}` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
