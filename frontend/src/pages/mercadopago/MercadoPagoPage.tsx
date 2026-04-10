import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, RefreshCw, Link2, AlertCircle, TrendingUp, TrendingDown,
  Clock, CheckCircle, ExternalLink, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/shared';
import { Button, Input } from '../../components/ui';
import { mercadoPagoService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { MpMovement, MpBalance } from '../../types/mercadopago.types';
import LinkMpPaymentModal from './LinkMpPaymentModal';

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  income:        'Ingreso',
  outcome:       'Egreso',
  transfer:      'Transferencia',
  refund:        'Devolución',
  dispute:       'Disputa',
  withdrawal:    'Retiro',
  payment:       'Cobro',
  default:       'Movimiento',
};

function getMovementColor(type: string, amount: number) {
  if (amount > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (amount < 0) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-slate-400';
}

export default function MercadoPagoPage() {
  const navigate = useNavigate();
  const [balance,     setBalance]     = useState<MpBalance | null>(null);
  const [movements,   setMovements]   = useState<MpMovement[]>([]);
  const [total,       setTotal]       = useState(0);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isMpConfig,  setIsMpConfig]  = useState(true);
  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [offset,      setOffset]      = useState(0);
  const [mpPayId,     setMpPayId]     = useState('');
  const [showLink,    setShowLink]    = useState(false);
  const [linkMov,     setLinkMov]     = useState<MpMovement | null>(null);
  const LIMIT = 20;

  const load = useCallback(async (newOffset = 0) => {
    setIsLoading(true);
    try {
      const [bal, mov] = await Promise.all([
        mercadoPagoService.getBalance(),
        mercadoPagoService.getMovements({ from: from || undefined, to: to || undefined, limit: LIMIT, offset: newOffset }),
      ]);
      setBalance(bal);
      setMovements(mov.results);
      setTotal(mov.total);
      setOffset(newOffset);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? '';
      if (msg.includes('configurado')) {
        setIsMpConfig(false);
      } else {
        toast.error('Error al cargar movimientos de MercadoPago');
      }
    } finally {
      setIsLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(0); }, []);

  const handleSearch = () => load(0);
  const handlePrev   = () => { if (offset > 0) load(offset - LIMIT); };
  const handleNext   = () => { if (offset + LIMIT < total) load(offset + LIMIT); };

  const handleLinkByPayId = () => {
    if (!mpPayId.trim()) return;
    setLinkMov(null);
    setShowLink(true);
  };

  if (!isMpConfig) {
    return (
      <div>
        <PageHeader title="MercadoPago" subtitle="Movimientos y reconciliación de pagos" />
        <div className="max-w-md mx-auto mt-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center mx-auto">
            <Smartphone className="w-8 h-8 text-sky-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">MercadoPago no está configurado</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Ingresá tu Access Token en Configuración para ver los movimientos y generar cobros.
          </p>
          <Button onClick={() => navigate('/settings')}>
            Ir a Configuración
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="MercadoPago"
        subtitle="Movimientos y reconciliación de pagos recibidos"
        actions={
          <Button size="sm" variant="outline" onClick={() => load(offset)} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Actualizar
          </Button>
        }
      />

      {/* Balance cards */}
      {balance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Disponible</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(balance.availableBalance, 'ARS')}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">En proceso</p>
            <p className="text-xl font-bold text-amber-500">
              {formatCurrency(balance.unavailableBalance, 'ARS')}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Total</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(balance.totalBalance, 'ARS')}
            </p>
          </div>
        </div>
      )}

      {/* Filters + link by ID */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Desde</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Hasta</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
          <Button size="sm" onClick={handleSearch} isLoading={isLoading}>
            <Search className="w-3.5 h-3.5 mr-1.5" />
            Buscar
          </Button>

          <div className="ml-auto flex gap-2 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                Vincular pago por ID de MP
              </label>
              <div className="flex gap-2">
                <Input
                  value={mpPayId}
                  onChange={(e) => setMpPayId(e.target.value)}
                  placeholder="Ej: 123456789"
                  className="w-44"
                />
                <Button size="sm" variant="outline" onClick={handleLinkByPayId} disabled={!mpPayId.trim()}>
                  <Link2 className="w-3.5 h-3.5 mr-1.5" />
                  Vincular
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Movements table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                <div className="w-8 h-8 bg-gray-100 dark:bg-slate-700 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-48" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-24" />
                </div>
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-20" />
              </div>
            ))}
          </div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center">
              <Smartphone className="w-7 h-7 text-gray-300 dark:text-slate-500" />
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400">No se encontraron movimientos en el período seleccionado.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  m.amount > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30'
                }`}>
                  {m.amount > 0
                    ? <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    : <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {m.description ?? MOVEMENT_TYPE_LABEL[m.type] ?? MOVEMENT_TYPE_LABEL.default}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    {formatDate(m.date)} · ID {m.id}
                    {m.sourceId ? ` · Pago #${m.sourceId}` : ''}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right">
                  <p className={`text-sm font-semibold ${getMovementColor(m.type, m.amount)}`}>
                    {m.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(m.amount), 'ARS')}
                  </p>
                  {m.balance != null && (
                    <p className="text-xs text-gray-400 dark:text-slate-500">Saldo: {formatCurrency(m.balance, 'ARS')}</p>
                  )}
                </div>

                {/* Status badge + link button */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.linked ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3" />
                      Registrado
                    </span>
                  ) : m.sourceId ? (
                    <button
                      onClick={() => { setLinkMov(m); setMpPayId(String(m.sourceId!)); setShowLink(true); }}
                      className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-full hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                    >
                      <Link2 className="w-3 h-3" />
                      Vincular
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                      <Clock className="w-3 h-3" />
                      Sin pago
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handlePrev} disabled={offset === 0}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" onClick={handleNext} disabled={offset + LIMIT >= total}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Link payment modal */}
      {showLink && (
        <LinkMpPaymentModal
          open={showLink}
          onClose={() => { setShowLink(false); setLinkMov(null); setMpPayId(''); }}
          onLinked={() => { load(offset); setMpPayId(''); }}
          initialPaymentId={mpPayId}
        />
      )}
    </div>
  );
}
