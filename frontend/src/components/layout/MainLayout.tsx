import { Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { Menu } from 'lucide-react';
import { useUIStore } from '../../stores';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import NotificationBell from '../notifications/NotificationBell';
import OfflineBanner from './OfflineBanner';
import OfflineRouteGuard from './OfflineRouteGuard';
import { useOfflineSync } from '../../lib/offline/useOfflineSync';
import FiscalModeTopBorder from './FiscalModeTopBorder';

export default function MainLayout() {
  const { menuType, sidebarOpen, toggleMobileMenu } = useUIStore();

  // Monitorea la conexion y mantiene al dia la cache offline. Va aca y no en
  // App para que no corra en /login, donde todavia no hay token.
  useOfflineSync();

  if (menuType === 'navbar') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <FiscalModeTopBorder />
        <OfflineBanner />
        <Navbar />
        <main className="pt-16">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <OfflineRouteGuard><Outlet /></OfflineRouteGuard>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FiscalModeTopBorder />
      <OfflineBanner />
      {/* ── Mobile top bar (hidden on md+) ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3 px-4">
        <button
          onClick={toggleMobileMenu}
          className="p-2 -ml-1 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white text-[11px] font-bold leading-none">CB</span>
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">CloudBill</span>
        </div>

        <div className="ml-auto">
          <NotificationBell />
        </div>
      </header>

      <Sidebar />

      <main
        className={clsx(
          'min-h-screen',
          // Mobile: full width under the top bar
          'pt-14 md:pt-0',
          // Desktop: offset by sidebar width, with transition.
          // Los valores tienen que coincidir EXACTO con el aside: riel de 68 px
          // solo, o riel + panel del módulo (68 + 232 = 300).
          'transition-[margin-left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          sidebarOpen ? 'md:ml-[300px]' : 'md:ml-[68px]',
        )}
      >
        <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
          <OfflineRouteGuard><Outlet /></OfflineRouteGuard>
        </div>
      </main>
    </div>
  );
}
