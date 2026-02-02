import { Fragment } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Package,
  FolderTree,
  Warehouse,
  PackageSearch,
  FileText,
  CreditCard,
  ChevronDown,
  LogOut,
  Settings,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../stores';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavDropdown {
  name: string;
  icon: React.ElementType;
  items: NavItem[];
}

const navigation: (NavItem | NavDropdown)[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Productos', href: '/products', icon: Package },
  { name: 'Categorías', href: '/categories', icon: FolderTree },
  { name: 'Almacenes', href: '/warehouses', icon: Warehouse },
  {
    name: 'Stock',
    icon: PackageSearch,
    items: [
      { name: 'Inventario', href: '/stock', icon: PackageSearch },
      { name: 'Movimientos', href: '/stock/movements', icon: PackageSearch },
      { name: 'Transferencias', href: '/stock/transfer', icon: PackageSearch },
    ],
  },
  { name: 'Facturas', href: '/invoices', icon: FileText },
  { name: 'Cuentas Corrientes', href: '/current-accounts', icon: CreditCard },
];

function isDropdown(item: NavItem | NavDropdown): item is NavDropdown {
  return 'items' in item;
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
      <div className="max-w-full mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold text-primary-600">CloudBill</span>

            {/* Navigation Links */}
            <div className="hidden lg:flex items-center gap-1">
              {navigation.map((item) =>
                isDropdown(item) ? (
                  <Menu as="div" className="relative" key={item.name}>
                    <Menu.Button className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100">
                      <item.icon className="w-4 h-4" />
                      {item.name}
                      <ChevronDown className="w-4 h-4" />
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
                      <Menu.Items className="absolute left-0 mt-2 w-48 origin-top-left rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <div className="py-1">
                          {item.items.map((subItem) => (
                            <Menu.Item key={subItem.href}>
                              {({ active }) => (
                                <NavLink
                                  to={subItem.href}
                                  className={clsx(
                                    'flex items-center gap-2 px-4 py-2 text-sm',
                                    active
                                      ? 'bg-gray-100 text-gray-900'
                                      : 'text-gray-700'
                                  )}
                                >
                                  <subItem.icon className="w-4 h-4" />
                                  {subItem.name}
                                </NavLink>
                              )}
                            </Menu.Item>
                          ))}
                        </div>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                ) : (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.href === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg',
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      )
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </NavLink>
                )
              )}
            </div>
          </div>

          {/* User Menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <User className="w-4 h-4 text-primary-600" />
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-700">
                {user?.name}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
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
              <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Menu.Item>
                    {({ active }) => (
                      <NavLink
                        to="/settings"
                        className={clsx(
                          'flex items-center gap-2 px-4 py-2 text-sm',
                          active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                        )}
                      >
                        <Settings className="w-4 h-4" />
                        Configuración
                      </NavLink>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={handleLogout}
                        className={clsx(
                          'flex items-center gap-2 px-4 py-2 text-sm w-full',
                          active ? 'bg-red-50 text-red-700' : 'text-red-600'
                        )}
                      >
                        <LogOut className="w-4 h-4" />
                        Cerrar sesión
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </nav>
  );
}
