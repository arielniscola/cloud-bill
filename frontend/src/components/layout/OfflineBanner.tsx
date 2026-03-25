import { WifiOff, ServerOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/**
 * Muestra un banner cuando:
 *  - El backend local (Docker) no responde → rojo
 *  - Sin internet pero Docker corriendo   → amarillo (solo AFIP afectado)
 */
export default function OfflineBanner() {
  const { isBackendOnline, isLocalOnly } = useOnlineStatus();

  if (isBackendOnline && !isLocalOnly) return null;

  if (!isBackendOnline) {
    return (
      <div className="w-full bg-red-600 text-white px-4 py-2 flex items-center gap-3 text-sm z-50">
        <ServerOff className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Sin conexión al servidor local.</strong> Verificá que Docker esté
          corriendo:{' '}
          <code className="bg-red-700 rounded px-1 py-0.5 text-xs font-mono">
            docker compose up -d
          </code>
        </span>
      </div>
    );
  }

  // isLocalOnly: backend ok, sin internet
  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2 flex items-center gap-3 text-sm z-50">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>
        <strong>Sin conexión a internet.</strong> La aplicación funciona con datos locales.
        AFIP no disponible hasta recuperar la conexión.
      </span>
    </div>
  );
}
