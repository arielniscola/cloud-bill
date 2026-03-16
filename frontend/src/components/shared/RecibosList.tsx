import { Banknote, XCircle } from 'lucide-react';
import { Badge, Button } from '../ui';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHODS, RECIBO_STATUSES } from '../../utils/constants';
import type { Recibo } from '../../types';
import { useNavigate } from 'react-router-dom';

interface RecibosListProps {
  recibos: Recibo[];
  total: number;
  currency: string;
  onPay?: () => void;
  canPay: boolean;
  onCancel?: (recibo: Recibo) => void;
}

export function RecibosList({
  recibos,
  total,
  currency,
  onPay,
  canPay,
  onCancel,
}: RecibosListProps) {
  const navigate = useNavigate();
  const activeRecibos = recibos.filter((r) => r.status === 'EMITTED');
  const paid = activeRecibos.reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Math.max(0, total - paid);

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Pagos / Recibos</h3>
        {canPay && remaining > 0.001 && onPay && (
          <Button size="sm" onClick={onPay}>
            <Banknote className="w-3.5 h-3.5 mr-1.5" />
            Registrar pago
          </Button>
        )}
      </div>

      {recibos.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-400 dark:text-slate-500 text-center">
          Sin pagos registrados
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50/80 dark:bg-slate-700/50">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">N°</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Método</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Monto</th>
                <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {recibos.map((recibo) => (
                <tr
                  key={recibo.id}
                  className={`hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100 ${recibo.status === 'CANCELLED' ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-3">
                    <button
                      onClick={() => navigate(`/recibos/${recibo.id}`)}
                      className="text-sm font-mono font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      {recibo.number}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-slate-400 tabular-nums">
                    {formatDate(recibo.date)}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-slate-400">
                    {PAYMENT_METHODS[recibo.paymentMethod] ?? recibo.paymentMethod}
                    {recibo.reference && (
                      <span className="ml-1 text-xs text-gray-400 dark:text-slate-500">({recibo.reference})</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                    {formatCurrency(Number(recibo.amount), currency)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant={recibo.status === 'EMITTED' ? 'success' : 'error'} dot>
                      {RECIBO_STATUSES[recibo.status]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {recibo.status === 'EMITTED' && onCancel && (
                      <button
                        onClick={() => onCancel(recibo)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors duration-150"
                        title="Cancelar recibo"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer totals */}
      <div className="px-5 py-3 bg-gray-50/50 dark:bg-slate-700/30 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500 dark:text-slate-400">
            Cobrado: <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(paid, currency)}</span>
          </span>
          <span className="text-gray-500 dark:text-slate-400">
            Pendiente: <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(remaining, currency)}</span>
          </span>
        </div>
        <span className="text-sm text-gray-500 dark:text-slate-400">
          Total: <span className="font-semibold tabular-nums">{formatCurrency(total, currency)}</span>
        </span>
      </div>
    </div>
  );
}
