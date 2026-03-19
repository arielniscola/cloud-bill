import { Fragment } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import { clsx } from 'clsx';
import {
  Home,
  TrendingUp,
  Users,
  CreditCard,
  Calculator,
  FileText,
  ClipboardList,
  Receipt,
  Truck,
  ShoppingCart,
  Package,
  FolderTree,
  Tag,
  PackageSearch,
  BarChart2,
  ArrowRightLeft,
  ClipboardCheck,
  Warehouse,
  Brain,
  Landmark,
  BookOpen,
  Settings,
  History,
  ChevronDown,
  LogOut,
  User,
  ShoppingBag,
  FileStack,
  Banknote,
  Store,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../stores';
import NotificationBell from '../notifications/NotificationBell';
import { getNavTheme } from '../../utils/navThemes';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  heading?: string;
  items: NavItem[];
}

interface NavDropdown {
  name: string;
  icon: React.ElementType;
  sections: NavSection[];
}

type NavEntry = ({ type: 'link' } & NavItem) | ({ type: 'dropdown' } & NavDropdown);

const navigation: NavEntry[] = [
  { type: 'link', name: 'Inicio',       href: '/',          icon: Home },
  { type: 'link', name: 'Estadísticas', href: '/dashboard', icon: TrendingUp },
  {
    type: 'dropdown',
    name: 'Ventas',
    icon: Store,
    sections: [
      {
        heading: 'Clientes',
        items: [
          { name: 'Clientes',           href: '/customers',        icon: Users },
          { name: 'Cuentas Corrientes', href: '/current-accounts', icon: CreditCard },
        ],
      },
      {
        heading: 'Documentos',
        items: [
          { name: 'Órdenes de Pedido', href: '/orden-pedidos', icon: ShoppingBag },
          { name: 'Presupuestos',      href: '/budgets',       icon: Calculator },
          { name: 'Facturas',          href: '/invoices',      icon: FileText },
          { name: 'Remitos',           href: '/remitos',       icon: ClipboardList },
          { name: 'Recibos',           href: '/recibos',       icon: Receipt },
        ],
      },
    ],
  },
  {
    type: 'dropdown',
    name: 'Compras',
    icon: ShoppingCart,
    sections: [
      {
        items: [
          { name: 'Proveedores',       href: '/suppliers',     icon: Truck },
          { name: 'Órdenes de Compra', href: '/orden-compras', icon: FileStack },
          { name: 'Compras',           href: '/purchases',     icon: ShoppingCart },
          { name: 'Órdenes de Pago',   href: '/orden-pagos',   icon: Banknote },
        ],
      },
    ],
  },
  {
    type: 'dropdown',
    name: 'Catálogo',
    icon: Package,
    sections: [
      {
        heading: 'Productos',
        items: [
          { name: 'Lista',      href: '/products',   icon: Package },
          { name: 'Categorías', href: '/categories', icon: FolderTree },
          { name: 'Marcas',     href: '/brands',     icon: Tag },
        ],
      },
      {
        heading: 'Stock',
        items: [
          { name: 'Inventario',     href: '/stock',                icon: PackageSearch },
          { name: 'Movimientos',    href: '/stock/movements',      icon: BarChart2 },
          { name: 'Transferencias', href: '/stock/transfer',       icon: ArrowRightLeft },
          { name: 'Conteo físico',  href: '/stock/physical-count', icon: ClipboardCheck },
          { name: 'Almacenes',      href: '/warehouses',           icon: Warehouse },
          { name: 'Inteligente',    href: '/stock/intelligence',   icon: Brain },
        ],
      },
    ],
  },
  {
    type: 'dropdown',
    name: 'Finanzas',
    icon: Landmark,
    sections: [
      {
        items: [
          { name: 'Cajas',             href: '/cash-registers', icon: Landmark },
          { name: 'Banco de Cheques',  href: '/banco-cheques',  icon: Banknote },
          { name: 'Cuentas Bancarias', href: '/banks',          icon: Landmark },
          { name: 'Libro IVA',         href: '/iva',            icon: BookOpen },
          { name: 'Reporte Ventas',    href: '/reports/sales',  icon: BarChart2 },
        ],
      },
    ],
  },
];

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { navTheme } = useUIStore();
  const theme = getNavTheme(navTheme);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
              {navigation.map((entry) =>
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
                  <Menu as="div" className="relative" key={entry.name}>
                    {({ open }) => (
                      <>
                        <Menu.Button
                          className={clsx(
                            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150',
                            open
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
                          <Menu.Items className="absolute left-0 mt-1 w-52 origin-top-left rounded-xl bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none py-1.5 z-50">
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
                                        className={({ isActive }) =>
                                          clsx(
                                            'flex items-center gap-2.5 mx-1 px-3 py-2 text-sm rounded-lg transition-colors duration-100',
                                            isActive
                                              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium'
                                              : active
                                              ? 'bg-gray-50 dark:bg-slate-700/80 text-gray-900 dark:text-slate-200'
                                              : 'text-gray-700 dark:text-slate-300'
                                          )
                                        }
                                      >
                                        <item.icon className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                                        {item.name}
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
          <div className="flex items-center gap-1">
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
