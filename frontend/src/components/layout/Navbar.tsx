import { Fragment, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import { clsx } from 'clsx';
import { confirmLogoutWithPendingSales } from '../../lib/offline/logoutGuard';
import { isAvailableOffline, OFFLINE_UNAVAILABLE_HINT } from '../../lib/offline/offlineRoutes';
import { useOfflineStore } from '../../stores/offline.store';
import { Settings, History, ChevronDown, LogOut, User } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../stores';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatures } from '../../hooks/useFeatures';
import NotificationBell from '../notifications/NotificationBell';
import { getNavTheme } from '../../utils/navThemes';
import { navModules, superAdminModules, hrefPath, isHrefActive, type NavItem } from './navConfig';

interface NavSection {
  heading?: string;
  items: NavItem[];
}

type NavEntry =
  | { type: 'link'; name: string; href: string; icon: React.ElementType }
  | { type: 'dropdown'; key: string; name: string; icon: React.ElementType; sections: NavSection[] };

/**
 * "Sistema" no va como desplegable: Configuración e Historial ya están en el
 * menú del usuario (a la derecha).
 */
const NAVBAR_EXCLUDED_MODULES = new Set(['sistema']);

/** Agrupa los items consecutivos por `section`, igual que el panel del Sidebar. */
const toSections = (items: NavItem[]): NavSection[] =>
  items.reduce<NavSection[]>((acc, item) => {
    const last = acc[acc.length - 1];
    if (last && last.heading === item.section) last.items.push(item);
    else acc.push({ heading: item.section, items: [item] });
    return acc;
  }, []);

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { navTheme } = useUIStore();
  const { role, isModuleEnabled } = usePermissions();
  const { hasFeature } = useFeatures();
  const theme = getNavTheme(navTheme);
  const navigate = useNavigate();
  const connection = useOfflineStore((s) => s.connection);

  const handleLogout = () => {
    if (!confirmLogoutWithPendingSales()) return;
    logout();
    navigate('/login');
  };

  /** Sin conexión, todo lo que no lea de la caché local queda deshabilitado. */
  const offlineBlocked = (href: string) =>
    connection === 'offline' && !isAvailableOffline(href);

  const location = useLocation();
  const pendingSales = useOfflineStore((s) => s.pendingSales);

  const visibleEntries = useMemo<NavEntry[]>(() => {
    // SUPER_ADMIN: sus pocas pantallas van como links directos.
    if (role === 'SUPER_ADMIN') {
      return superAdminModules.flatMap((m) =>
        (m.items ?? []).map((i) => ({ type: 'link' as const, name: i.name, href: i.href, icon: i.icon }))
      );
    }

    return navModules.reduce<NavEntry[]>((acc, m) => {
      if (NAVBAR_EXCLUDED_MODULES.has(m.key)) return acc;
      if (m.requiredRoles && !m.requiredRoles.includes(role)) return acc;
      if (m.moduleKey && !isModuleEnabled(m.moduleKey)) return acc;
      if (m.featureKey && !hasFeature(m.featureKey as any)) return acc;
      if (!m.items) {
        acc.push({ type: 'link', name: m.name, href: m.href, icon: m.icon });
        return acc;
      }
      const items = m.items.filter((i) => !i.featureKey || hasFeature(i.featureKey as any));
      if (items.length === 0) return acc;
      acc.push({ type: 'dropdown', key: m.key, name: m.name, icon: m.icon, sections: toSections(items) });
      return acc;
    }, []);
  }, [role, isModuleEnabled, hasFeature]);

  const itemIsActive = (href: string) => isHrefActive(href, location.pathname, location.search);

  /** El desplegable se resalta si la ruta actual es (o cuelga de) alguna de sus pantallas. */
  const dropdownIsActive = (sections: NavSection[]) =>
    sections.some((s) =>
      s.items.some((i) => {
        const path = hrefPath(i.href);
        return itemIsActive(i.href) || (path !== '/' && location.pathname.startsWith(path + '/'));
      })
    );

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/10" style={{ backgroundColor: theme.bg }}>
      <div className="max-w-full mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm">
                <span className="text-white text-[11px] font-bold leading-none">CB</span>
              </div>
              <span className="text-sm font-bold text-white tracking-tight">Cloud Bill</span>
            </div>

            {/* Navigation */}
            <div className="hidden lg:flex items-center gap-0.5">
              {visibleEntries.map((entry) =>
                entry.type === 'link' ? (
                  <NavLink
                    key={entry.href}
                    to={entry.href}
                    end={entry.href === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )
                    }
                  >
                    <entry.icon className="w-4 h-4" />
                    {entry.name}
                  </NavLink>
                ) : (
                  <Menu as="div" className="relative" key={entry.key}>
                    {({ open }) => (
                      <>
                        <Menu.Button
                          className={clsx(
                            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150',
                            open || dropdownIsActive(entry.sections)
                              ? 'bg-white/20 text-white'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <entry.icon className="w-4 h-4" />
                          {entry.name}
                          <ChevronDown
                            className={clsx(
                              'w-3.5 h-3.5 transition-transform duration-150',
                              open && 'rotate-180'
                            )}
                          />
                        </Menu.Button>

                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute left-0 mt-1 w-60 max-h-[calc(100vh-5rem)] overflow-y-auto origin-top-left rounded-xl bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none py-1.5 z-50">
                            {entry.sections.map((section, si) => (
                              <div key={si}>
                                {si > 0 && <div className="my-1.5 border-t border-gray-100 dark:border-slate-700" />}
                                {section.heading && (
                                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                    {section.heading}
                                  </p>
                                )}
                                {section.items.map((item) => (
                                  <Menu.Item key={item.href}>
                                    {({ active }) => (
                                      <NavLink
                                        to={item.href}
                                        end
                                        onClick={(e) => {
                                          // Sin conexión no navega: la pantalla
                                          // de destino no funcionaría.
                                          if (offlineBlocked(item.href)) e.preventDefault();
                                        }}
                                        aria-disabled={offlineBlocked(item.href) || undefined}
                                        title={offlineBlocked(item.href) ? OFFLINE_UNAVAILABLE_HINT : undefined}
                                        className={() =>
                                          clsx(
                                            'flex items-center gap-2.5 mx-1 px-3 py-2 text-sm rounded-lg transition-colors duration-100',
                                            offlineBlocked(item.href)
                                              ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
                                              : itemIsActive(item.href)
                                              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium'
                                              : active
                                              ? 'bg-gray-50 dark:bg-slate-700/80 text-gray-900 dark:text-slate-200'
                                              : 'text-gray-700 dark:text-slate-300'
                                          )
                                        }
                                      >
                                        <item.icon className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                                        <span className="truncate">{item.name}</span>
                                        {item.href === '/ventas-pendientes' && pendingSales > 0 && (
                                          <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-[16px] text-white">
                                            {pendingSales}
                                          </span>
                                        )}
                                      </NavLink>
                                    )}
                                  </Menu.Item>
                                ))}
                              </div>
                            ))}
                          </Menu.Items>
                        </Transition>
                      </>
                    )}
                  </Menu>
                )
              )}
            </div>
          </div>

          {/* Right: Notifications + User */}
          <div className="flex items-center gap-2">
            <NotificationBell />

            <Menu as="div" className="relative">
              {({ open }) => (
                <>
                  <Menu.Button
                    className={clsx(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors duration-150',
                      open ? 'bg-white/20' : 'hover:bg-white/10'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="hidden md:block text-sm font-medium text-white/80 max-w-[120px] truncate">
                      {user?.name}
                    </span>
                    <ChevronDown className={clsx('w-3.5 h-3.5 text-white/40 transition-transform duration-150', open && 'rotate-180')} />
                  </Menu.Button>

                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="absolute right-0 mt-1 w-56 origin-top-right rounded-xl bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none py-1.5 z-50">
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700 mb-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">@{user?.username}</p>
                      </div>

                      {role !== 'SUPER_ADMIN' && (
                        <Menu.Item>
                          {({ active }) => (
                            <NavLink
                              to="/settings"
                              className={clsx(
                                'flex items-center gap-2.5 mx-1 px-3 py-2 text-sm rounded-lg transition-colors duration-100',
                                active ? 'bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-slate-200' : 'text-gray-700 dark:text-slate-300'
                              )}
                            >
                              <Settings className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              Configuración
                            </NavLink>
                          )}
                        </Menu.Item>
                      )}
                      {role !== 'SUPER_ADMIN' && hasFeature('activity_log' as any) && (
                        <Menu.Item>
                          {({ active }) => (
                            <NavLink
                              to="/activity"
                              className={clsx(
                                'flex items-center gap-2.5 mx-1 px-3 py-2 text-sm rounded-lg transition-colors duration-100',
                                active ? 'bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-slate-200' : 'text-gray-700 dark:text-slate-300'
                              )}
                            >
                              <History className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              Historial
                            </NavLink>
                          )}
                        </Menu.Item>
                      )}

                      <div className="my-1 border-t border-gray-100 dark:border-slate-700" />

                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={handleLogout}
                            className={clsx(
                              'flex items-center gap-2.5 mx-1 px-3 py-2 text-sm rounded-lg w-full transition-colors duration-100',
                              active ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            <LogOut className="w-4 h-4" />
                            Cerrar sesión
                          </button>
                        )}
                      </Menu.Item>
                    </Menu.Items>
                  </Transition>
                </>
              )}
            </Menu>
          </div>

        </div>
      </div>
    </nav>
  );
}
