import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui';
import { approvalsService, type ApprovalActionSetting } from '../../services/approvals.service';
import { apiErrorMessage } from '../../utils/apiError';

/** Qué acciones requieren aprobación del Dueño en esta empresa (solo el Dueño la edita). */
export default function ApprovalSettingsCard() {
  const [actions, setActions] = useState<ApprovalActionSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    approvalsService
      .getSettings()
      .then(setActions)
      .catch(() => toast.error('No se pudo cargar la configuración de aprobaciones'))
      .finally(() => setIsLoading(false));
  }, []);

  const toggle = (key: ApprovalActionSetting['key']) =>
    setActions((prev) => prev.map((a) => (a.key === key ? { ...a, enabled: !a.enabled } : a)));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await approvalsService.updateSettings(actions.filter((a) => !a.enabled).map((a) => a.key));
      setActions(saved);
      toast.success('Configuración guardada');
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al guardar');
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
      <div className="mb-5 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Acciones que requieren aprobación</h3>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            Cuando alguien que no es Dueño intenta una de estas acciones, no se ejecuta: queda una solicitud con
            su motivo y el comprobante se bloquea hasta que un Dueño la apruebe o la rechace. Lo que hace un
            Dueño se ejecuta directo y queda en el historial.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {actions.map((a) => (
          <label
            key={a.key}
            className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl cursor-pointer"
          >
            <input
              type="checkbox"
              checked={a.enabled}
              onChange={() => toggle(a.key)}
              className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-slate-200">{a.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={handleSave} isLoading={isSaving} size="sm">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Guardar
        </Button>
      </div>
    </div>
  );
}
