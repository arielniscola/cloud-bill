import { useEffect, useState } from 'react';
import { appSettingsService } from '../services';
import { isOffline } from '../stores/offline.store';
import { getAppSettingsOffline } from '../lib/offline/adapters';
import { resolveTimeSurcharge, NO_SURCHARGE, type TimeSurcharge } from '../utils/timeSurcharge';
import type { AppSettings } from '../types';

/**
 * Recargo por horario vigente para la empresa (config en Ajustes → Operaciones).
 *
 * Se re-evalúa cada minuto: una pantalla de venta abierta cuando entra o sale
 * la franja pasa a cargar los precios con o sin recargo sin recargar la página.
 */
export function useTimeSurcharge(): TimeSurcharge {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [surcharge, setSurcharge] = useState<TimeSurcharge>(NO_SURCHARGE);

  useEffect(() => {
    let cancelled = false;
    // Sin red la config sale de la caché local, para que la venta offline
    // respete el mismo recargo que la online.
    const load = isOffline() ? getAppSettingsOffline() : appSettingsService.get();
    load
      .then((data) => { if (!cancelled) setSettings(data); })
      .catch(() => { /* sin config, no hay recargo */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const evaluate = () => {
      const next = resolveTimeSurcharge(settings);
      setSurcharge((prev) =>
        prev.active === next.active && prev.pct === next.pct ? prev : next
      );
    };
    evaluate();
    const id = window.setInterval(evaluate, 60_000);
    return () => window.clearInterval(id);
  }, [settings]);

  return surcharge;
}

export default useTimeSurcharge;
