import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Package,
  FolderTree,
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
} from 'lucide-react';
import { useUIStore, useAuthStore } from '../../stores';
import NotificationBell from '../notifications/NotificationBell';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Productos', href: '/products', icon: Package },
  { name: 'Categorías', href: '/categories', icon: FolderTree },
  { name: 'Almacenes', href: '/warehouses', icon: Warehouse },
  {
    name: 'Stock',
    href: '/stock',
    icon: PackageSearch,
    children: [
      { name: 'Inventario', href: '/stock', icon: PackageSearch },
      { name: 'Movimientos', href: '/stock/movements', icon: BarChart2 },
      { name: 'Transferencias', href: '/stock/transfer', icon: ArrowRightLeft },
    ],
  },
  { name: 'Facturas', href: '/invoices', icon: FileText },
  { name: 'Remitos', href: '/remitos', icon: ClipboardList },
  { name: 'Proveedores', href: '/suppliers', icon: Truck },
  { name: 'Compras', href: '/purchases', icon: ShoppingCart },
  { name: 'Cuentas Corrientes', href: '/current-accounts', icon: CreditCard },
  { name: 'Cajas', href: '/cash-registers', icon: Landmark },
  { name: 'Libro IVA', href: '/iva', icon: BookOpen },
  { name: 'Historial', href: '/activity', icon: History },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navigation.forEach((item) => {
      if (item.children && location.pathname.startsWith(item.href)) {
        initial[item.name] = true;
      }
    });
    return initial;
  });

  const toggleMenu = (name: string) => {
    setOpenMenus((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const userInitials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 h-screen bg-slate-900 transition-all duration-300 flex flex-col',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/60 flex-shrink-0">
        {sidebarOpen && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-bold">CB</span>
            </div>
            <span className="text-base font-bold text-white tracking-tight">CloudBill</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <NotificationBell />
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2.5">
          {navigation.map((item) =>
            item.children ? (
              <li key={item.name}>
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full',
                    location.pathname.startsWith(item.href)
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )}
                >
                  <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronDown
                        className={clsx(
                          'w-3.5 h-3.5 text-slate-500 transition-transform duration-200',
                          openMenus[item.name] && 'rotate-180'
                        )}
                      />
                    </>
                  )}
                </button>
                {sidebarOpen && openMenus[item.name] && (
                  <ul className="mt-1 ml-3 pl-3 border-l border-slate-700/50 space-y-0.5">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <NavLink
                          to={child.href}
                          end
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                              isActive
                                ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                            )
                          }
                        >
                          <child.icon className="w-4 h-4 flex-shrink-0" />
                          <span>{child.name}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ) : (
              <li key={item.name}>
                <NavLink
                  to={item.href}
                  end={item.href === '/'}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    )
                  }
                >
                  <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {sidebarOpen && <span>{item.name}</span>}
                </NavLink>
              </li>
            )
          )}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/60 p-3 flex-shrink-0">
        {sidebarOpen && user && (
          <div className="flex items-center gap-2.5 mb-2 px-2 py-2 rounded-lg bg-slate-800/50">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-300 text-xs font-semibold">{userInitials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              )
            }
          >
            <Settings className="w-[18px] h-[18px]" />
            {sidebarOpen && <span>Configuración</span>}
          </NavLink>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all w-full"
          >
            <LogOut className="w-[18px] h-[18px]" />
            {sidebarOpen && <span>Cerrar sesión</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
