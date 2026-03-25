import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, Tag } from 'lucide-react';
import { Button } from '../../components/ui';
import { appSettingsService } from '../../services';

export default function PriceSettingsCard() {
  const [days1, setDays1] = useState('10');
  const [days2, setDays2] = useState('20');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const settings = await appSettingsService.get();
        setDays1(String(settings.stalePriceWarnDays1 ?? 10));
        setDays2(String(settings.stalePriceWarnDays2 ?? 20));
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    const d1 = Number(days1);
    const d2 = Number(days2);
    if (d1 >= d2) {
      toast.error('El umbral naranja debe ser menor que el rojo');
      return;
    }
    setIsSaving(true);
    try {
      await appSettingsService.update({ stalePriceWarnDays1: d1, stalePriceWarnDays2: d2 });
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Aviso de precio desactualizado</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Resalta el precio en órdenes de pedido según los días sin actualización.
        </p>
      </div>

      <div className="space-y-5">
        {/* Level 1 — amber */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Tag className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Aviso naranja</p>
              <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
              Precio sin actualizar hace más de este tiempo.
            </p>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-shadow">
              <input
                type="number"
                min={1}
                max={365}
                value={days1}
                onChange={(e) => setDays1(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none min-w-0"
              />
              <span className="flex items-center px-3 text-xs font-medium text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 border-l border-gray-200 dark:border-slate-600 select-none">
                días
              </span>
            </div>
          </div>
        </div>

        {/* Level 2 — red */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Tag className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Aviso rojo</p>
              <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
              Precio muy desactualizado, requiere atención urgente.
            </p>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-shadow">
              <input
                type="number"
                min={1}
                max={365}
                value={days2}
                onChange={(e) => setDays2(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none min-w-0"
              />
              <span className="flex items-center px-3 text-xs font-medium text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 border-l border-gray-200 dark:border-slate-600 select-none">
                días
              </span>
            </div>
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
