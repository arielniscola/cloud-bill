import { useLocation, useNavigate } from 'react-router-dom';
import { CloudOff, ArrowLeft, ShoppingBag } from 'lucide-react';
import { Button } from '../ui';
import { useOfflineStore } from '../../stores/offline.store';
import { isAvailableOffline } from '../../lib/offline/offlineRoutes';

/**
 * Intercepta las rutas que no funcionan sin conexion.
 *
 * El Sidebar ya las atenua, pero eso no cubre entrar por URL directa, volver
 * con el boton atras, ni quedarse en una pagina cuando se corta la red. En
 * esos casos, sin esto, la pagina queda en blanco o llena de errores.
 */
export default function OfflineRouteGuard({ children }: { children: React.ReactNode }) {
  const connection = useOfflineStore((s) => s.connection);
  const pendingSales = useOfflineStore((s) => s.pendingSales);
  const location = useLocation();
  const navigate = useNavigate();

  if (connection !== 'offline' || isAvailableOffline(location.pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-500">
        <CloudOff size={26} />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-gray-900 dark:text-slate-100">
        Esta sección necesita conexión
      </h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
        Sin internet solo podés cargar ventas y revisar las que están esperando
        subir. El resto vuelve solo cuando se recupere la conexión.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => navigate('/orden-pedidos/new')}>
          <ShoppingBag size={16} />
          Nueva venta
        </Button>
        <Button variant="secondary" onClick={() => navigate('/ventas-pendientes')}>
          Ventas pendientes
          {pendingSales > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {pendingSales}
            </span>
          )}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Volver
        </Button>
      </div>
    </div>
  );
}
