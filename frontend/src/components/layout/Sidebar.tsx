import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import {
  Home,
  Users,
  Package,
  FolderTree,
  Tag,
  Warehouse,
  PackageSearch,
  FileText,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  Landmark,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Settings,
  ArrowRightLeft,
  BarChart2,
  TrendingUp,
  History,
  BookOpen,
  Truck,
  ShoppingCart,
  Calculator,
  Brain,
  Receipt,
  ShoppingBag,
  FileStack,
  Store,
  Banknote,
  Building2,
  X,
  Search,
} from "lucide-react";
import { useState } from "react";
import { useUIStore, useAuthStore } from "../../stores";
import { usePermissions } from "../../hooks/usePermissions";
import NotificationBell from "../notifications/NotificationBell";
import CompanySwitcher from "../shared/CompanySwitcher";
import { useCompanyStore } from "../../stores/company.store";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  moduleKey?: string;
  requiredRoles?: readonly string[];
  items: NavItem[];
}

// Navigation for SUPER_ADMIN only
const superAdminGroups: NavGroup[] = [
  {
    label: "Gestión Global",
    items: [
      { name: "Empresas", href: "/companies", icon: Building2 },
      { name: "Usuarios", href: "/users",     icon: Users },
    ],
  },
];

const navigationGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { name: "Inicio",       href: "/",          icon: Home },
      { name: "Estadísticas", href: "/dashboard",  icon: TrendingUp },
    ],
  },
  {
    label: "Ventas",
    moduleKey: "ventas",
    items: [
      {
        name: "Ventas",
        href: "/ventas",
        icon: Store,
        children: [
          { name: "Órdenes de Pedido", href: "/orden-pedidos",    icon: ShoppingBag },
          { name: "Presupuestos",      href: "/budgets",          icon: Calculator },
          { name: "Facturas",          href: "/invoices",         icon: FileText },
          { name: "Remitos",           href: "/remitos",          icon: ClipboardList },
          { name: "Recibos",           href: "/recibos",          icon: Receipt },
          { name: "Clientes",          href: "/customers",        icon: Users },
          { name: "Cuentas Corrientes",href: "/current-accounts", icon: CreditCard },
        ],
      },
    ],
  },
  {
    label: "Compras",
    moduleKey: "compras",
    requiredRoles: ["ADMIN"] as const,
    items: [
      { name: "Proveedores",       href: "/suppliers",     icon: Truck },
      { name: "Órdenes de Compra", href: "/orden-compras", icon: FileStack },
      { name: "Compras",           href: "/purchases",     icon: ShoppingCart },
      { name: "Órdenes de Pago",   href: "/orden-pagos",   icon: Banknote },
    ],
  },
  {
    label: "Catálogo",
    moduleKey: "catalogo",
    items: [
      {
        name: "Productos",
        href: "/products",
        icon: Package,
        children: [
          { name: "Lista",      href: "/products",   icon: Package },
          { name: "Categorías", href: "/categories", icon: FolderTree },
          { name: "Marcas",     href: "/brands",     icon: Tag },
        ],
      },
      {
        name: "Stock",
        href: "/stock",
        icon: PackageSearch,
        children: [
          { name: "Inventario",    href: "/stock",                icon: PackageSearch },
          { name: "Movimientos",   href: "/stock/movements",      icon: BarChart2 },
          { name: "Transferencias",href: "/stock/transfer",       icon: ArrowRightLeft },
          { name: "Conteo físico", href: "/stock/physical-count", icon: ClipboardCheck },
          { name: "Almacenes",     href: "/warehouses",           icon: Warehouse },
          { name: "Inteligente",   href: "/stock/intelligence",   icon: Brain },
        ],
      },
    ],
  },
  {
    label: "Finanzas",
    moduleKey: "finanzas",
    requiredRoles: ["ADMIN"] as const,
    items: [
      { name: "Cajas",           href: "/cash-registers", icon: Landmark },
      { name: "Banco de Cheques",href: "/banco-cheques",  icon: Banknote },
      { name: "Libro IVA",       href: "/iva",            icon: BookOpen },
      { name: "Reporte Ventas",  href: "/reports/sales",  icon: BarChart2 },
    ],
  },
  {
    label: "Sistema",
    requiredRoles: ["ADMIN"] as const,
    items: [
      {
        name: "Configuración",
        href: "/settings",
        icon: Settings,
        children: [
          { name: "General",   href: "/settings", icon: Settings },
          { name: "Historial", href: "/activity", icon: History },
        ],
      },
    ],
  },
];

const allNavItems = navigationGroups.flatMap((g) => g.items);

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, mobileMenuOpen, closeMobileMenu } =
    useUIStore();
  const { user, logout } = useAuthStore();
  const { role, isModuleEnabled } = usePermissions();
  const { companies } = useCompanyStore();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const visibleGroups = role === 'SUPER_ADMIN'
    ? superAdminGroups
    : navigationGroups.filter((g) => {
        if (g.requiredRoles && !g.requiredRoles.includes(role)) return false;
        if (g.moduleKey && !isModuleEnabled(g.moduleKey)) return false;
        return true;
      });

  // Close mobile drawer and clear search on navigation
  useEffect(() => {
    closeMobileMenu();
    setSearchQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Flat list of all searchable items derived from visibleGroups
  interface SearchableItem {
    name: string;
    href: string;
    icon: React.ElementType;
    breadcrumb: string;
  }
  const searchableItems: SearchableItem[] = visibleGroups.flatMap((g) =>
    g.items.flatMap((item) => {
      if (item.children) {
        return item.children.map((child) => ({
          name: child.name,
          href: child.href,
          icon: child.icon,
          breadcrumb: g.label ? `${g.label} › ${item.name}` : item.name,
        }));
      }
      return [{
        name: item.name,
        href: item.href,
        icon: item.icon,
        breadcrumb: g.label ?? '',
      }];
    })
  );

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? searchableItems.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.breadcrumb.toLowerCase().includes(q),
      )
    : [];

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    allNavItems.forEach((item) => {
      if (!item.children) return;
      const parentActive = location.pathname.startsWith(item.href);
      const childActive = item.children.some(
        (c) =>
          location.pathname === c.href ||
          location.pathname.startsWith(c.href + "/"),
      );
      if (parentActive || childActive) initial[item.name] = true;
    });
    return initial;
  });

  const toggleMenu = (name: string) =>
    setOpenMenus((prev) => ({ ...prev, [name]: !prev[name] }));

  const userInitials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

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
          "fixed left-0 top-0 z-50 h-screen bg-slate-900 flex flex-col",
          // Width: mobile drawer always wide; desktop controlled by sidebarOpen
          "w-72",
          sidebarOpen ? "md:w-64" : "md:w-[68px]",
          // Transition: transform for mobile slide, width for desktop collapse
          "transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          // Mobile: slide in/out. Desktop: always visible
          mobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* ── Header ── */}
        <div className="relative flex items-center h-16 px-3.5 border-b border-slate-800 flex-shrink-0">
          {/* Logo */}
          <div
            className={clsx(
              "flex items-center gap-2.5 flex-1 min-w-0",
              !showText && "md:justify-center",
            )}
          >
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
              <img src="/logo.png" alt="Cloud Bill" className="w-full h-full object-contain" />
            </div>
            {showText && (
              <span className="text-sm font-bold text-white tracking-tight truncate">
                Cloud Bill
              </span>
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
              title={sidebarOpen ? "Contraer" : "Expandir"}
            >
              {sidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
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
          {/* Search box — only when expanded */}
          {showText && (
            <div className="px-2.5 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar menú…"
                  className="w-full bg-slate-800 text-slate-300 placeholder-slate-500 text-xs rounded-lg pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500/50 transition-shadow"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search results */}
          {q && showText ? (
            <ul className="px-2.5 space-y-0.5">
              {searchResults.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-slate-500">
                  Sin resultados
                </li>
              ) : (
                searchResults.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      end={item.href === '/'}
                      className={({ isActive }) =>
                        clsx(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                          "transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]",
                          isActive
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                        )
                      }
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="leading-none">{item.name}</p>
                        {item.breadcrumb && (
                          <p className="text-[10px] text-slate-500 leading-none mt-0.5">{item.breadcrumb}</p>
                        )}
                      </div>
                    </NavLink>
                  </li>
                ))
              )}
            </ul>
          ) : (
          <ul className="px-2.5">
            {visibleGroups.map((group, gi) => (
              <li key={gi}>
                {/* Section label / divider */}
                {group.label &&
                  (showText ? (
                    <div
                      className={clsx("px-2 pb-1.5", gi > 0 ? "pt-5" : "pt-2")}
                    >
                      <span className="text-[10px] font-semibold text-slate-500/80 uppercase tracking-[0.12em]">
                        {group.label}
                      </span>
                    </div>
                  ) : (
                    <div className="mx-2 my-3.5 border-t border-slate-800" />
                  ))}

                <ul className="space-y-0.5">
                  {group.items.map((item) =>
                    item.children ? (
                      /* ── Expandable group ── */
                      <li key={item.name}>
                        <button
                          onClick={() => toggleMenu(item.name)}
                          title={!showText ? item.name : undefined}
                          className={clsx(
                            "relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium",
                            "transition-[background-color,color,transform] duration-150 ease-out",
                            "active:scale-[0.98]",
                            !showText && "md:justify-center",
                            (location.pathname.startsWith(item.href) ||
                              item.children.some(
                                (c) => location.pathname === c.href || location.pathname.startsWith(c.href + "/"),
                              ))
                              ? "bg-slate-800 text-slate-100"
                              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                          )}
                        >
                          <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                          {showText && (
                            <>
                              <span className="flex-1 text-left leading-none">
                                {item.name}
                              </span>
                              <ChevronDown
                                className={clsx(
                                  "w-3.5 h-3.5 text-slate-600 flex-shrink-0",
                                  "transition-transform duration-200 ease-out",
                                  openMenus[item.name] && "rotate-180",
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
                                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm",
                                      "transition-[background-color,color,transform] duration-150 ease-out",
                                      "active:scale-[0.98]",
                                      isActive
                                        ? "bg-indigo-600/15 text-indigo-300 font-semibold"
                                        : "text-slate-500 hover:bg-slate-800 hover:text-slate-200 font-medium",
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
                          end={item.href === "/"}
                          title={!showText ? item.name : undefined}
                          className={({ isActive }) =>
                            clsx(
                              "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                              "transition-[background-color,color,transform] duration-150 ease-out",
                              "active:scale-[0.98]",
                              !showText && "md:justify-center",
                              isActive
                                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/60"
                                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                            )
                          }
                        >
                          <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                          {showText && (
                            <span className="leading-none">{item.name}</span>
                          )}
                        </NavLink>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
          )}
        </nav>

        {/* ── Footer ── */}
        <div className="border-t border-slate-800 p-2.5 flex-shrink-0">
          {/* User card — expanded */}
          {showText && user && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800/50 mb-2">
              <div className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-300 text-[11px] font-bold leading-none">
                  {userInitials}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                  @{user.username}
                </p>
                <p className="text-[10px] text-indigo-400/70 truncate leading-tight mt-0.5 font-medium">
                  {role === "SUPER_ADMIN" ? "Super Administrador" : role === "ADMIN" ? "Administrador" : role === "SELLER" ? "Vendedor" : "Solo lectura"}
                </p>
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
                <span className="text-indigo-300 text-[11px] font-bold leading-none">
                  {userInitials}
                </span>
              </div>
            </div>
          )}

          {companies.length > 0 && (
            <div className="mb-1">
              <CompanySwitcher showText={showText} />
            </div>
          )}

          <button
            onClick={logout}
            title={!showText ? "Cerrar sesión" : undefined}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full mt-0.5",
              "transition-[background-color,color] duration-150 ease-out",
              !showText && "md:justify-center",
              "text-slate-500 hover:bg-red-500/10 hover:text-red-400",
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
