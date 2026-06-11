import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Plus, X } from 'lucide-react';
import { Modal, Button } from '../ui';
import type { QuickAccessItem } from '../../config/quickAccessCatalog';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Accesos disponibles para el usuario (ya filtrados por permisos/plan/módulos). */
  available: QuickAccessItem[];
  /** Ids seleccionados actualmente, en orden. */
  selectedIds: string[];
  /** Persiste la nueva selección. */
  onSave: (ids: string[]) => Promise<void> | void;
  isSaving?: boolean;
}

export default function QuickAccessConfigModal({
  isOpen, onClose, available, selectedIds, onSave, isSaving,
}: Props) {
  const [order, setOrder] = useState<string[]>(selectedIds);

  // Reset al abrir / cuando cambian los seleccionados externos
  useEffect(() => {
    if (isOpen) setOrder(selectedIds.filter((id) => available.some((a) => a.id === id)));
  }, [isOpen, selectedIds, available]);

  const byId = (id: string) => available.find((a) => a.id === id);
  const unselected = available.filter((a) => !order.includes(a.id));

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= order.length) return;
    const copy = [...order];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setOrder(copy);
  };
  const remove = (id: string) => setOrder((o) => o.filter((x) => x !== id));
  const add = (id: string) => setOrder((o) => [...o, id]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurar accesos rápidos" size="lg">
      <div className="space-y-5">
        {/* Seleccionados */}
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Visibles ({order.length})
          </p>
          {order.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-2">
              No hay accesos seleccionados. Agregá algunos de la lista de abajo.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {order.map((id, index) => {
                const item = byId(id);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <div className={`p-1.5 rounded-lg ${item.bg} flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-700 dark:text-slate-200">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Subir"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Bajar"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(id)}
                      className="p-1 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                      title="Quitar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Disponibles */}
        {unselected.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Disponibles
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {unselected.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => add(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                    >
                      <div className={`p-1.5 rounded-lg ${item.bg} flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-600 dark:text-slate-300">{item.label}</span>
                      <Plus className="w-4 h-4 text-gray-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" isLoading={isSaving} onClick={() => onSave(order)}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
