import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, Printer, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../../components/ui';
import { appSettingsService } from '../../services';

const OPTIONS = [
  {
    value: 'A4',
    label: 'A4 / PDF',
    description: 'Formato estándar para impresoras de hoja',
    icon: FileText,
    color: 'indigo',
  },
  {
    value: 'THERMAL_80MM',
    label: 'Térmica 80mm',
    description: 'Impresoras de ticket, rollo continuo',
    icon: Printer,
    color: 'emerald',
  },
] as const;

export default function PrintSettingsCard() {
  const [format, setFormat] = useState('A4');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    appSettingsService.get()
      .then((s) => setFormat(s.printFormat ?? 'A4'))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await appSettingsService.update({ printFormat: format });
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-100 dark:bg-slate-700 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 bg-gray-100 dark:bg-slate-700 rounded-xl" />
          <div className="h-20 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Formato de impresión</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Define el formato predeterminado al imprimir facturas y notas de pedido.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {OPTIONS.map(({ value, label, description, icon: Icon, color }) => {
          const active = format === value;
          return (
            <button
              key={value}
              onClick={() => setFormat(value)}
              className={clsx(
                'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
                active
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 ring-1 ring-indigo-300'
                  : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300'
              )}
            >
              <div className={clsx(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                active ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-slate-600'
              )}>
                <Icon className={clsx('w-5 h-5', active ? 'text-indigo-600' : 'text-gray-400 dark:text-slate-400')} />
              </div>
              <div>
                <p className={clsx('text-sm font-medium', active ? 'text-indigo-800 dark:text-indigo-400' : 'text-gray-700 dark:text-slate-300')}>
                  {label}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <Button onClick={handleSave} isLoading={isSaving} size="sm">
        <Save className="w-3.5 h-3.5 mr-1.5" />
        Guardar
      </Button>
    </div>
  );
}
