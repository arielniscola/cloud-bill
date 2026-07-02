import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, Eye, EyeOff, Smartphone, CheckCircle, AlertCircle } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { appSettingsService } from '../../services';

export default function MercadoPagoSettingsCard() {
  const [form, setForm] = useState({
    mpAccessToken:   '',
    mpPublicKey:     '',
    mpWebhookSecret: '',
    mpMode:          'test' as 'test' | 'production',
    mpPosId:         '',
  });
  const [showToken,   setShowToken]   = useState(false);
  const [showSecret,  setShowSecret]  = useState(false);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isSaving,    setIsSaving]    = useState(false);

  useEffect(() => {
    appSettingsService.get()
      .then((s) => setForm({
        mpAccessToken:   s.mpAccessToken   ?? '',
        mpPublicKey:     s.mpPublicKey     ?? '',
        mpWebhookSecret: s.mpWebhookSecret ?? '',
        mpMode:          s.mpMode          ?? 'test',
        mpPosId:         s.mpPosId         ?? '',
      }))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await appSettingsService.update({
        mpAccessToken:   form.mpAccessToken   || null,
        mpPublicKey:     form.mpPublicKey     || null,
        mpWebhookSecret: form.mpWebhookSecret || null,
        mpMode:          form.mpMode,
        mpPosId:         form.mpPosId || null,
      });
      toast.success('Configuración de MercadoPago guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const isConfigured = Boolean(form.mpAccessToken);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-100 dark:bg-slate-700 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">MercadoPago</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">Cobros online con link de pago y QR.</p>
          </div>
        </div>
        {isConfigured ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Configurado
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
            <AlertCircle className="w-3.5 h-3.5" /> Sin configurar
          </span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Modo</label>
        <div className="flex gap-2">
          {(['test', 'production'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set('mpMode', m)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                form.mpMode === m
                  ? m === 'production'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-gray-300'
              }`}
            >
              {m === 'test' ? 'Sandbox (pruebas)' : 'Producción'}
            </button>
          ))}
        </div>
        {form.mpMode === 'production' && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
            En modo producción se cobran pagos reales. Verificá las credenciales antes de activar.
          </p>
        )}
      </div>

      <div className="space-y-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            Access Token <span className="text-gray-400 font-normal">(privado — nunca compartir)</span>
          </label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={form.mpAccessToken}
              onChange={(e) => set('mpAccessToken', e.target.value)}
              placeholder={form.mpMode === 'test' ? 'TEST-...' : 'APP_USR-...'}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            Public Key <span className="text-gray-400 font-normal">(opcional, para cobros en frontend)</span>
          </label>
          <Input
            value={form.mpPublicKey}
            onChange={(e) => set('mpPublicKey', e.target.value)}
            placeholder={form.mpMode === 'test' ? 'TEST-...' : 'APP_USR-...'}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            Webhook Secret <span className="text-gray-400 font-normal">(opcional, para verificar notificaciones)</span>
          </label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={form.mpWebhookSecret}
              onChange={(e) => set('mpWebhookSecret', e.target.value)}
              placeholder="Secret del webhook en el panel de MP"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            ID de caja / POS <span className="text-gray-400 font-normal">(para QR presencial tipo posnet)</span>
          </label>
          <Input
            value={form.mpPosId}
            onChange={(e) => set('mpPosId', e.target.value)}
            placeholder="External ID de la caja creada en el panel de MP"
          />
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
            En MercadoPago → Tu negocio → Sucursales y cajas, creá una caja y pegá acá su identificación externa.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 mb-4 text-xs text-gray-500 dark:text-slate-400 space-y-1">
        <p className="font-medium text-gray-700 dark:text-slate-300">¿Cómo obtener las credenciales?</p>
        <p>1. Ingresá a tu cuenta de MercadoPago → <span className="font-mono">mercadopago.com.ar/developers</span></p>
        <p>2. Creá una aplicación o seleccioná una existente</p>
        <p>3. En "Credenciales" copiá el Access Token ({form.mpMode === 'test' ? 'TEST' : 'Producción'})</p>
        <p>4. URL del webhook a configurar en MP: <span className="font-mono break-all">{'[TU_SERVIDOR]/api/mercadopago/webhook'}</span></p>
      </div>

      <Button onClick={handleSave} isLoading={isSaving} size="sm">
        <Save className="w-3.5 h-3.5 mr-1.5" />
        Guardar
      </Button>
    </div>
  );
}
