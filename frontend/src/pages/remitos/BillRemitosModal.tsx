import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Modal } from '../../components/ui';
import { remitosService } from '../../services';
import { formatDate, formatNumber } from '../../utils/formatters';
import type { Remito } from '../../types';

interface BillRemitosModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  /** Remito desde el que se abrió: viene tildado. */
  initialRemitoId?: string;
}

const fmtQty = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 2);

/**
 * Elegir qué remitos libres del cliente se facturan juntos. La factura se arma
 * en el formulario con las cantidades de los remitos, que no se pueden editar.
 */
export default function BillRemitosModal({ isOpen, onClose, customerId, initialRemitoId }: BillRemitosModalProps) {
  const navigate = useNavigate();
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setIsLoading(true);
    remitosService.getUnbilled(customerId)
      .then((list) => {
        setRemitos(list);
        setSelected(new Set(initialRemitoId && list.some((r) => r.id === initialRemitoId) ? [initialRemitoId] : list.map((r) => r.id)));
      })
      .catch(() => toast.error('Error al cargar los remitos sin facturar'))
      .finally(() => setIsLoading(false));
  }, [isOpen, customerId, initialRemitoId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = remitos.filter((r) => selected.has(r.id));
  const units = chosen.reduce((sum, r) => sum + r.items.reduce((s, i) => s + Number(i.quantity), 0), 0);

  const handleContinue = () => {
    if (chosen.length === 0) return;
    navigate('/invoices/new', { state: { fromRemitos: chosen } });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Facturar remitos" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Elegí los remitos del cliente que querés incluir en la factura. Se facturan con sus cantidades;
          el stock ya se descontó con cada remito.
        </p>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
          </div>
        ) : remitos.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">
            Este cliente no tiene remitos pendientes de facturar.
          </p>
        ) : (
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg divide-y divide-gray-100 dark:divide-slate-700 max-h-80 overflow-y-auto">
            {remitos.map((r) => (
              <label
                key={r.id}
                className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="mt-0.5 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{r.number}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(r.date)}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                    {r.items.map((i) => `${fmtQty(Number(i.quantity))} × ${i.product?.name ?? 'Producto'}`).join(' · ')}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {chosen.length > 0 && `${chosen.length} remito${chosen.length === 1 ? '' : 's'} · ${fmtQty(units)} unidades`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={handleContinue} disabled={chosen.length === 0}>
              <FileText className="w-4 h-4 mr-2" />
              Armar factura
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
