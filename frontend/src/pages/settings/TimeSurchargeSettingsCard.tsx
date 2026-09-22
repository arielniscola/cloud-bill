import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, Clock } from 'lucide-react';
import { Button } from '../../components/ui';
import { appSettingsService } from '../../services';
import { resolveTimeSurcharge } from '../../utils/timeSurcharge';
import type { AppSettings } from '../../types';

export default function TimeSurchargeSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [from, setFrom] = useState('20:00');
  const [to, setTo] = useState('23:59');
  const [pct, setPct] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const settings = await appSettingsService.get();
        setEnabled(Boolean(settings.timeSurchargeEnabled));
        setFrom(settings.timeSurchargeFrom ?? '20:00');
        setTo(settings.timeSurchargeTo ?? '23:59');
        setPct(String(settings.timeSurchargePct ?? 0));
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const pctNumber = Number(pct);
  const crossesMidnight = from > to;
  const activeNow = resolveTimeSurcharge({
    timeSurchargeEnabled: enabled,
    timeSurchargeFrom: from,
    timeSurchargeTo: to,
    timeSurchargePct: pctNumber,
  } as AppSettings).active;

  const handleSave = async () => {
    if (enabled) {
      if (!Number.isFinite(pctNumber) || pctNumber <= 0 || pctNumber > 100) {
        toast.error('El recargo debe ser mayor a 0 y hasta 100 %');
        return;
      }
      if (from === to) {
        toast.error('El horario de inicio y fin no pueden ser iguales');
        return;
      }
    }
    setIsSaving(true);
    try {
      await appSettingsService.update({
        timeSurchargeEnabled: enabled,
        timeSurchargeFrom: from,
        timeSurchargeTo: to,
        timeSurchargePct: Number.isFinite(pctNumber) ? pctNumber : 0,
      });
      toast.success('Configuración guardada');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-100 dark:bg-slate-700 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recargo por horario</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Dentro de la franja horaria, los precios se cargan con un porcentaje extra en facturas y
          órdenes de pedido. No modifica el precio de lista de los productos.
        </p>
      </div>

      <div className="space-y-5">
        <label className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Aplicar recargo por horario</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Al agregar un producto dentro de la franja, el precio unitario ya viene recargado.
            </p>
          </div>
        </label>

        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Desde</label>
                <input
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={!enabled}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Hasta</label>
                <input
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={!enabled}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Recargo</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-shadow">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  disabled={!enabled}
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none min-w-0 disabled:opacity-50"
                />
                <span className="flex items-center px-3 text-xs font-medium text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 border-l border-gray-200 dark:border-slate-600 select-none">
                  %
                </span>
              </div>
            </div>

            {enabled && crossesMidnight && (
              <p className="text-xs text-gray-400 dark:text-slate-500">
                La franja cruza la medianoche: se aplica de {from} a {to} del día siguiente.
              </p>
            )}
            {activeNow && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Ahora mismo el recargo está activo.
              </p>
            )}
          </div>
        </div>

        <Button onClick={handleSave} isLoading={isSaving} size="sm">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Guardar
        </Button>
      </div>
    </div>
  );
}
