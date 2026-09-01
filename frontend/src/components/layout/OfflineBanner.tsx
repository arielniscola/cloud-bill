import { Link } from 'react-router-dom';
import { WifiOff, RefreshCw, AlertTriangle, CloudUpload } from 'lucide-react';
import { useOfflineStore } from '../../stores/offline.store';
import { checkConnection } from '../../lib/offline/connectivity';

function PendingLink({ count }: { count: number }) {
  return (
    <>
      {' '}
      <Link to="/ventas-pendientes" className="font-medium underline underline-offset-2">
        Ver {count === 1 ? 'la venta pendiente' : `las ${count} ventas pendientes`}
      </Link>
    </>
  );
}

/** Antiguedad de la cache a partir de la cual conviene avisar. */
const STALE_MINUTES = 24 * 60;

function formatAge(minutes: number | null): string {
  if (minutes === null) return 'sin datos guardados';
  if (minutes < 1) return 'actualizados recien';
  if (minutes < 60) return `actualizados hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `actualizados hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `actualizados hace ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/**
 * Estado de la conexion y antiguedad de los datos locales.
 *
 * Offline se muestra siempre; online solo si la cache quedo vieja, para no
 * ocupar lugar en pantalla cuando esta todo bien.
 */
export default function OfflineBanner() {
  const connection = useOfflineStore((s) => s.connection);
  const cacheAgeMinutes = useOfflineStore((s) => s.cacheAgeMinutes);
  const syncing = useOfflineStore((s) => s.syncing);
  const pendingSales = useOfflineStore((s) => s.pendingSales);

  const offline = connection === 'offline';
  const stale = cacheAgeMinutes !== null && cacheAgeMinutes > STALE_MINUTES;

  if (!offline && !stale && pendingSales === 0) return null;

  if (offline) {
    return (
      <div className="z-50 flex w-full items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-white">
        <WifiOff className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0">
          <strong>Sin conexion.</strong> Estas viendo datos{' '}
          {formatAge(cacheAgeMinutes)}. Los precios y el stock pueden haber
          cambiado. No se puede facturar en ARCA hasta recuperar la conexion.
          {pendingSales > 0 && <PendingLink count={pendingSales} />}
        </span>
        <button
          type="button"
          onClick={() => void checkConnection()}
          disabled={syncing}
          className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium hover:bg-amber-700 disabled:opacity-60"
        >
          <RefreshCw className={syncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Reintentar
        </button>
      </div>
    );
  }

  // Con conexion pero con ventas sin subir: es lo mas importante que se puede
  // mostrar, porque esas ventas solo existen en esta maquina.
  if (pendingSales > 0) {
    return (
      <div className="z-50 flex w-full items-center gap-3 bg-amber-600 px-4 py-2 text-sm text-white">
        <CloudUpload className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0">
          <strong>
            {pendingSales} venta{pendingSales === 1 ? '' : 's'} sin subir.
          </strong>{' '}
          Existen solo en esta computadora.
          <PendingLink count={pendingSales} />
        </span>
      </div>
    );
  }

  // Online pero con la cache vieja: si ahora se corta, se vende con precios
  // desactualizados. Conviene avisarlo antes de que pase.
  return (
    <div className="z-50 flex w-full items-center gap-3 bg-slate-700 px-4 py-2 text-sm text-white">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0">
        Los datos para trabajar sin conexion estan {formatAge(cacheAgeMinutes)}.
      </span>
    </div>
  );
}
