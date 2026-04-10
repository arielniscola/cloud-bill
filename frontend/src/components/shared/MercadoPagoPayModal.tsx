import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Copy, CheckCircle, Smartphone, QrCode, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { Button } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import { mercadoPagoService } from '../../services';
import type { MpPreferenceResult, CreateMpPreferenceDTO } from '../../types/mercadopago.types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPaymentRegistered?: () => void;
  /** Pass one of these to generate the link */
  invoiceId?:     string;
  budgetId?:      string;
  ordenPedidoId?: string;
  cashRegisterId?: string | null;
  /** Label shown in the modal header */
  title?: string;
}

export default function MercadoPagoPayModal({
  open,
  onClose,
  onPaymentRegistered,
  invoiceId,
  budgetId,
  ordenPedidoId,
  cashRegisterId,
  title = 'Cobrar con MercadoPago',
}: Props) {
  const [preference, setPreference] = useState<MpPreferenceResult | null>(null);
  const [isLoading,  setIsLoading]  = useState(false);
  const [tab,        setTab]        = useState<'link' | 'qr'>('link');
  const [copied,     setCopied]     = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open && !preference) generatePreference();
  }, [open]);

  useEffect(() => {
    if (preference && tab === 'qr' && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, preference.payUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {});
    }
  }, [preference, tab]);

  const generatePreference = async () => {
    setIsLoading(true);
    try {
      const dto: CreateMpPreferenceDTO = { cashRegisterId };
      if (invoiceId)     dto.invoiceId     = invoiceId;
      if (budgetId)      dto.budgetId      = budgetId;
      if (ordenPedidoId) dto.ordenPedidoId = ordenPedidoId;
      const result = await mercadoPagoService.createPreference(dto);
      setPreference(result);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al generar el link de pago');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!preference) return;
    await navigator.clipboard.writeText(preference.payUrl);
    setCopied(true);
    toast.success('Link copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = () => {
    if (preference) window.open(preference.payUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRefresh = () => {
    setPreference(null);
    generatePreference();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
              {preference && (
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {preference.mode === 'test' ? 'Modo Sandbox' : 'Modo Producción'} •{' '}
                  {formatCurrency(preference.amount, 'ARS')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 dark:text-slate-400">Generando link de pago...</p>
            </div>
          ) : preference ? (
            <>
              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-1 mb-5">
                <button
                  onClick={() => setTab('link')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    tab === 'link'
                      ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Link de pago
                </button>
                <button
                  onClick={() => setTab('qr')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    tab === 'qr'
                      ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Código QR
                </button>
              </div>

              {tab === 'link' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-4">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">Link de pago</p>
                    <p className="text-xs font-mono text-gray-800 dark:text-slate-200 break-all leading-relaxed">
                      {preference.payUrl}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
                      {copied ? (
                        <><CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />Copiado</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5 mr-1.5" />Copiar link</>
                      )}
                    </Button>
                    <Button size="sm" onClick={handleOpenLink} className="flex-1">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      Abrir en MP
                    </Button>
                  </div>

                  <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40 rounded-lg p-3 text-xs text-sky-700 dark:text-sky-400">
                    <p className="font-medium mb-0.5">¿Cómo cobrar?</p>
                    <p>Compartí el link con tu cliente por WhatsApp, email o mostralo en pantalla. Cuando el cliente pague, el sistema registrará el recibo automáticamente.</p>
                  </div>
                </div>
              )}

              {tab === 'qr' && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                      <canvas ref={canvasRef} className="block" />
                    </div>
                  </div>

                  <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40 rounded-lg p-3 text-xs text-sky-700 dark:text-sky-400">
                    <p className="font-medium mb-0.5">Pago presencial</p>
                    <p>Mostrá este QR al cliente para que lo escanee con la app de MercadoPago. El pago se registrará automáticamente al confirmar.</p>
                  </div>
                </div>
              )}

              {preference.mode === 'test' && (
                <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400">
                  Modo sandbox — los pagos son de prueba y no se cobran realmente.
                </div>
              )}

              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerar link
                </button>
                {onPaymentRegistered && (
                  <Button variant="outline" size="sm" onClick={() => { onPaymentRegistered(); onClose(); }}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    Marcar como pagado
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
