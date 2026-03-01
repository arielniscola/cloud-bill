import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Package,
  FolderTree,
  Tag,
  Warehouse,
  PackageSearch,
  FileText,
  ClipboardList,
  CreditCard,
  Landmark,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Settings,
  ArrowRightLeft,
  BarChart2,
  History,
  BookOpen,
  Truck,
  ShoppingCart,
  Calculator,
  Brain,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useUIStore, useAuthStore } from '../../stores';
import NotificationBell from '../notifications/NotificationBell';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { name: 'Clientes',     href: '/customers', icon: Users },
      { name: 'Presupuestos', href: '/budgets',   icon: Calculator },
      { name: 'Facturas',     href: '/invoices',  icon: FileText },
      { name: 'Remitos',      href: '/remitos',   icon: ClipboardList },
    ],
  },
  {
    label: 'Compras',
    items: [
      { name: 'Proveedores', href: '/suppliers', icon: Truck },
      { name: 'Compras',     href: '/purchases', icon: ShoppingCart },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      {
        name: 'Productos',
        href: '/products',
        icon: Package,
        children: [
          { name: 'Lista',      href: '/products',   icon: Package },
          { name: 'Categorías', href: '/categories', icon: FolderTree },
          { name: 'Marcas',     href: '/brands',     icon: Tag },
        ],
      },
      {
        name: 'Stock',
        href: '/stock',
        icon: PackageSearch,
        children: [
          { name: 'Inventario',     href: '/stock',              icon: PackageSearch },
          { name: 'Movimientos',    href: '/stock/movements',    icon: BarChart2 },
          { name: 'Transferencias', href: '/stock/transfer',     icon: ArrowRightLeft },
          { name: 'Almacenes',      href: '/warehouses',         icon: Warehouse },
          { name: 'Inteligente',    href: '/stock/intelligence', icon: Brain },
        ],
      },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { name: 'Cuentas Corrientes', href: '/current-accounts', icon: CreditCard },
      { name: 'Cajas',              href: '/cash-registers',   icon: Landmark },
      { name: 'Libro IVA',          href: '/iva',              icon: BookOpen },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        name: 'Configuración',
        href: '/settings',
        icon: Settings,
        children: [
          { name: 'General',   href: '/settings', icon: Settings },
          { name: 'Historial', href: '/activity', icon: History },
        ],
      },
    ],
  },
];

const allNavItems = navigationGroups.flatMap((g) => g.items);

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, mobileMenuOpen, closeMobileMenu } = useUIStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();

  // Close mobile drawer on navigation
  useEffect(() => {
    closeMobileMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    allNavItems.forEach((item) => {
      if (!item.children) return;
      const parentActive = location.pathname.startsWith(item.href);
      const childActive = item.children.some(
        (c) => location.pathname === c.href || location.pathname.startsWith(c.href + '/')
      );
      if (parentActive || childActive) initial[item.name] = true;
    });
    return initial;
  });

  const toggleMenu = (name: string) =>
    setOpenMenus((prev) => ({ ...prev, [name]: !prev[name] }));

  const userInitials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? '?';

  // On mobile (drawer): always show full text.
  // On desktop: controlled by sidebarOpen.
  const showText = sidebarOpen || mobileMenuOpen;

  return (
    <>
      {/* ── Mobile backdrop ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed left-0 top-0 z-50 h-screen bg-slate-900 flex flex-col',
          // Width: mobile drawer always wide; desktop controlled by sidebarOpen
          'w-72',
          sidebarOpen ? 'md:w-64' : 'md:w-[68px]',
          // Transition: transform for mobile slide, width for desktop collapse
          'transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          // Mobile: slide in/out. Desktop: always visible
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* ── Header ── */}
        <div className="relative flex items-center h-16 px-3.5 border-b border-slate-800 flex-shrink-0">
          {/* Logo */}
          <div className={clsx('flex items-center gap-2.5 flex-1 min-w-0', !showText && 'md:justify-center')}>
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="text-white text-[11px] font-bold leading-none">CB</span>
            </div>
            {showText && (
              <span className="text-sm font-bold text-white tracking-tight truncate">CloudBill</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Bell — desktop only (mobile has it in the top bar) */}
            {showText && (
              <span className="hidden md:inline-flex">
                <NotificationBell />
              </span>
            )}

            {/* Desktop collapse/expand */}
            <button
              onClick={toggleSidebar}
              className="hidden md:block p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-[background-color,color] duration-150"
              title={sidebarOpen ? 'Contraer' : 'Expandir'}
            >
              {sidebarOpen
                ? <ChevronLeft className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />
              }
            </button>

            {/* Mobile close button */}
            <button
              onClick={closeMobileMenu}
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-[background-color,color] duration-150"
              aria-label="Cerrar menú"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Notification bell — desktop collapsed mode (below header) */}
          {!showText && (
            <div className="hidden md:flex absolute -bottom-10 left-0 w-full justify-center">
              <NotificationBell />
            </div>
          )}
        </div>

        {/* Spacer for collapsed desktop notification bell */}
        {!showText && <div className="hidden md:block h-8 flex-shrink-0" />}

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="px-2.5">
            {navigationGroups.map((group, gi) => (
              <li key={gi}>
                {/* Section label / divider */}
                {group.label && (
                  showText ? (
                    <div className={clsx('px-2 pb-1.5', gi > 0 ? 'pt-5' : 'pt-2')}>
                      <span className="text-[10px] font-semibold text-slate-500/80 uppercase tracking-[0.12em]">
                        {group.label}
                      </span>
                    </div>
                  ) : (
                    <div className="mx-2 my-3.5 border-t border-slate-800" />
                  )
                )}

                <ul className="space-y-0.5">
                  {group.items.map((item) =>
                    item.children ? (
                      /* ── Expandable group ── */
                      <li key={item.name}>
                        <button
                          onClick={() => toggleMenu(item.name)}
                          title={!showText ? item.name : undefined}
                          className={clsx(
                            'relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium',
                            'transition-[background-color,color,transform] duration-150 ease-out',
                            'active:scale-[0.98]',
                            !showText && 'md:justify-center',
                            location.pathname.startsWith(item.href)
                              ? 'bg-slate-800 text-slate-100'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          )}
                        >
                          <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                          {showText && (
                            <>
                              <span className="flex-1 text-left leading-none">{item.name}</span>
                              <ChevronDown
                                className={clsx(
                                  'w-3.5 h-3.5 text-slate-600 flex-shrink-0',
                                  'transition-transform duration-200 ease-out',
                                  openMenus[item.name] && 'rotate-180'
                                )}
                              />
                            </>
                          )}
                        </button>

                        {showText && openMenus[item.name] && (
                          <ul className="mt-0.5 ml-[14px] pl-3 border-l border-slate-700/40 space-y-0.5 pb-0.5">
                            {item.children.map((child) => (
                              <li key={child.href}>
                                <NavLink
                                  to={child.href}
                                  end
                                  className={({ isActive }) =>
                                    clsx(
                                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
                                      'transition-[background-color,color,transform] duration-150 ease-out',
                                      'active:scale-[0.98]',
                                      isActive
                                        ? 'bg-indigo-600/15 text-indigo-300 font-semibold'
                                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200 font-medium'
                                    )
                                  }
                                >
                                  <child.icon className="w-[15px] h-[15px] flex-shrink-0" />
                                  <span>{child.name}</span>
                                </NavLink>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ) : (
                      /* ── Regular link ── */
                      <li key={item.name}>
                        <NavLink
                          to={item.href}
                          end={item.href === '/'}
                          title={!showText ? item.name : undefined}
                          className={({ isActive }) =>
                            clsx(
                              'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                              'transition-[background-color,color,transform] duration-150 ease-out',
                              'active:scale-[0.98]',
                              !showText && 'md:justify-center',
                              isActive
                                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/60'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            )
                          }
                        >
                          <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                          {showText && <span className="leading-none">{item.name}</span>}
                        </NavLink>
                      </li>
                    )
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Footer ── */}
        <div className="border-t border-slate-800 p-2.5 flex-shrink-0">
          {/* User card — expanded */}
          {showText && user && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800/50 mb-2">
              <div className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-300 text-[11px] font-bold leading-none">{userInitials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{user.email}</p>
              </div>
            </div>
          )}

          {/* User avatar — collapsed desktop only */}
          {!showText && user && (
            <div className="hidden md:flex justify-center mb-2">
              <div
                className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center"
                title={user.name}
              >
                <span className="text-indigo-300 text-[11px] font-bold leading-none">{userInitials}</span>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            title={!showText ? 'Cerrar sesión' : undefined}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full mt-0.5',
              'transition-[background-color,color] duration-150 ease-out',
              !showText && 'md:justify-center',
              'text-slate-500 hover:bg-red-500/10 hover:text-red-400'
            )}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {showText && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
