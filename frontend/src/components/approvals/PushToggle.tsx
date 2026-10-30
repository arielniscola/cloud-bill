import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BellOff, BellRing, Send } from 'lucide-react';
import { Button } from '../ui';
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../../lib/pwa/push';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * Activa los avisos push de aprobaciones en ESTE dispositivo: al Dueño le
 * llegan las solicitudes nuevas; a quien pide, la resolución.
 */
export default function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState().then((s) => { if (alive) setState(s); }).catch(() => { if (alive) setState('unsupported'); });
    return () => { alive = false; };
  }, []);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      if (next === 'on') toast.success('Avisos activados en este dispositivo');
      if (next === 'denied') toast.error('El navegador bloqueó las notificaciones de este sitio');
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'No se pudieron cambiar los avisos');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const sent = await sendTestPush();
      if (sent) toast.success('Aviso de prueba enviado');
      else toast.error('No se pudo enviar el aviso a este dispositivo');
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al enviar el aviso de prueba');
    } finally {
      setBusy(false);
    }
  };

  // Sin claves en el servidor no hay nada que ofrecer.
  if (state === null || state === 'not-configured') return null;

  if (state === 'unsupported') {
    return <span className="text-xs text-gray-400 dark:text-slate-500">Avisos push no disponibles en este navegador</span>;
  }

  if (state === 'denied') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
        <BellOff className="w-4 h-4" />
        Notificaciones bloqueadas: habilitalas en la configuración del sitio
      </span>
    );
  }

  if (state === 'off') {
    return (
      <Button size="sm" variant="secondary" onClick={() => run(enablePush)} disabled={busy}>
        {/* El alta en el servicio de push del navegador puede tardar unos segundos. */}
        <BellRing className="w-4 h-4 mr-1.5" /> {busy ? 'Activando…' : 'Activar avisos en este dispositivo'}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        <BellRing className="w-3.5 h-3.5" /> Avisos activos
      </span>
      <Button size="sm" variant="ghost" onClick={test} disabled={busy} title="Enviar un aviso de prueba">
        <Send className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => run(disablePush)} disabled={busy} title="Desactivar avisos en este dispositivo">
        <BellOff className="w-4 h-4" />
      </Button>
    </div>
  );
}
