import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, Mail, Eye, EyeOff } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { appSettingsService } from '../../services';

export default function SmtpSettingsCard() {
  const [form, setForm] = useState({
    smtpHost:   '',
    smtpPort:   587,
    smtpUser:   '',
    smtpPass:   '',
    smtpFrom:   '',
    smtpSecure: false,
  });
  const [showPass, setShowPass]   = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  useEffect(() => {
    appSettingsService.get()
      .then((s) => setForm({
        smtpHost:   s.smtpHost   ?? '',
        smtpPort:   s.smtpPort   ?? 587,
        smtpUser:   s.smtpUser   ?? '',
        smtpPass:   s.smtpPass   ?? '',
        smtpFrom:   s.smtpFrom   ?? '',
        smtpSecure: s.smtpSecure ?? false,
      }))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const set = (key: keyof typeof form, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await appSettingsService.update({
        smtpHost:   form.smtpHost   || null,
        smtpPort:   Number(form.smtpPort),
        smtpUser:   form.smtpUser   || null,
        smtpPass:   form.smtpPass   || null,
        smtpFrom:   form.smtpFrom   || null,
        smtpSecure: form.smtpSecure,
      });
      toast.success('Configuración SMTP guardada');
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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Configuración de correo (SMTP)</h3>
          <p className="text-xs text-gray-400 dark:text-slate-500">Para envío de facturas, presupuestos y remitos por email.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="sm:col-span-2 grid grid-cols-[1fr_100px_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Servidor SMTP (host)</label>
            <Input
              value={form.smtpHost}
              onChange={(e) => set('smtpHost', e.target.value)}
              placeholder="smtp.gmail.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Puerto</label>
            <Input
              type="number"
              value={form.smtpPort}
              onChange={(e) => set('smtpPort', Number(e.target.value))}
              placeholder="587"
            />
          </div>
          <div className="pb-0.5">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.smtpSecure}
                onChange={(e) => set('smtpSecure', e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              SSL/TLS
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Usuario (email)</label>
          <Input
            type="email"
            value={form.smtpUser}
            onChange={(e) => set('smtpUser', e.target.value)}
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Contraseña / App password</label>
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              value={form.smtpPass}
              onChange={(e) => set('smtpPass', e.target.value)}
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            Nombre y email remitente <span className="font-normal text-gray-400">(opcional, si difiere del usuario)</span>
          </label>
          <Input
            value={form.smtpFrom}
            onChange={(e) => set('smtpFrom', e.target.value)}
            placeholder="Mi Empresa <mi@email.com>"
          />
        </div>
      </div>

      <Button onClick={handleSave} isLoading={isSaving} size="sm">
        <Save className="w-3.5 h-3.5 mr-1.5" />
        Guardar
      </Button>
    </div>
  );
}
