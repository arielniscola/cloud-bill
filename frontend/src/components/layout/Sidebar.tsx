import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import {
  Home,
  Users,
  Package,
  FolderTree,
  Tag,
  Layers,
  Warehouse,
  PackageSearch,
  FileText,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  Landmark,
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
  Store,
  Banknote,
  Building2,
  X,
  Search,
  Smartphone,
  FileEdit,
  BookMarked,
  Sliders,
  Crown,
  Repeat,
  Percent,
  Pin,
  PinOff,
  Coins,
  Wallet,
  PieChart,
  ClipboardX,
  CloudOff,
} from "lucide-react";
import { useUIStore, useAuthStore } from "../../stores";
import { usePermissions } from "../../hooks/usePermissions";
import { useFeatures } from "../../hooks/useFeatures";
import { getNavTheme } from "../../utils/navThemes";
import NotificationBell from "../notifications/NotificationBell";
import CompanySwitcher from "../shared/CompanySwitcher";
import { useCompanyStore } from "../../stores/company.store";
import { confirmLogoutWithPendingSales } from '../../lib/offline/logoutGuard';
import { isAvailableOffline, OFFLINE_UNAVAILABLE_HINT } from '../../lib/offline/offlineRoutes';
import { useOfflineStore } from '../../stores/offline.store';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  featureKey?: string;  // se oculta si el plan no incluye la feature
  section?: string;     // subtítulo dentro del panel del módulo
}

/**
 * Un módulo = un icono del riel. Sin `items` el tile navega directo (Inicio,
 * Estadísticas); con `items` abre el panel.
 */
interface NavModule {
  key: string;
  name: string;
  icon: React.ElementType;
  href: string;
  items?: NavItem[];
  moduleKey?: string;                 // enabledModules de la empresa
  featureKey?: string;
  requiredRoles?: readonly string[];
}

const superAdminModules: NavModule[] = [
  {
    key: "global",
    name: "Gestión Global",
    icon: Building2,
    href: "/companies",
    items: [
      { name: "Empresas", href: "/companies", icon: Building2 },
      { name: "Usuarios", href: "/users",     icon: Users },
      { name: "Planes",   href: "/plans",     icon: Crown },
    ],
  },
];

const navModules: NavModule[] = [
  { key: "inicio",       name: "Inicio",       icon: Home,       href: "/" },
  { key: "estadisticas", name: "Estadísticas", icon: TrendingUp, href: "/dashboard" },

  {
    key: "ventas",
    name: "Ventas",
    icon: Store,
    href: "/invoices",
    moduleKey: "ventas",
    requiredRoles: ["ADMIN", "SELLER", "WAREHOUSE_CLERK", "FINANCES"] as const,
    items: [
      { name: "Órdenes de Pedido", href: "/orden-pedidos",      icon: ShoppingBag },
      { name: "Ventas pendientes", href: "/ventas-pendientes",  icon: CloudOff },
      { name: "Presupuestos",      href: "/budgets",            icon: Calculator },
      { name: "Facturas",          href: "/invoices",           icon: FileText },
      { name: "Abonos",            href: "/recurring-invoices", icon: Repeat },
      { name: "Remitos",           href: "/remitos",            icon: ClipboardList },
      { name: "Recibos",           href: "/recibos",            icon: Receipt },
      { name: "Clientes",          href: "/customers",          icon: Users },
      { name: "Cuentas Corrientes",href: "/current-accounts",   icon: CreditCard, featureKey: "current_accounts" },
      { name: "Notas Internas",    href: "/internal-notes?entity=CUSTOMER", icon: FileEdit },
    ],
  },

  {
    key: "compras",
    name: "Compras",
    icon: ShoppingCart,
    href: "/purchase-invoices",
    moduleKey: "compras",
    requiredRoles: ["ADMIN", "FINANCES", "PURCHASES"] as const,
    items: [
      { name: "Proveedores",       href: "/suppliers",           icon: Truck },
      { name: "Ctas. Ctes.",       href: "/supplier-accounts",   icon: CreditCard, featureKey: "supplier_accounts" },
      { name: "Facturas",          href: "/purchase-invoices",   icon: FileText },
      { name: "Remitos de Compra", href: "/purchase-remitos",    icon: PackageSearch },
      { name: "Retenciones",       href: "/purchase-retentions", icon: Percent },
      { name: "Órdenes de Pago",   href: "/orden-pagos",         icon: Banknote },
      { name: "Notas Internas",    href: "/internal-notes?entity=SUPPLIER", icon: FileEdit },
    ],
  },

  {
    key: "catalogo",
    name: "Catálogo",
    icon: Package,
    href: "/products",
    moduleKey: "catalogo",
    items: [
      { name: "Productos",             href: "/products",                icon: Package,       section: "Productos" },
      { name: "Rubros",                href: "/rubros",                  icon: FolderTree,    section: "Productos" },
      { name: "Marcas",                href: "/brands",                  icon: Tag,           section: "Productos" },
      { name: "Categorías",            href: "/categories",              icon: Layers,        section: "Productos" },
      { name: "Campos personalizados", href: "/products/custom-fields",  icon: Sliders,       section: "Productos" },
      { name: "Inventario",            href: "/stock",                   icon: PackageSearch, section: "Stock" },
      { name: "Movimientos",           href: "/stock/movements",         icon: BarChart2,     section: "Stock" },
      { name: "Transferencias",        href: "/stock/transfer",          icon: ArrowRightLeft,section: "Stock", featureKey: "multi_warehouse" },
      { name: "Conteo físico",         href: "/stock/physical-count",    icon: ClipboardCheck,section: "Stock" },
      { name: "Almacenes",             href: "/warehouses",              icon: Warehouse,     section: "Stock" },
      { name: "Inteligente",           href: "/stock/intelligence",      icon: Brain,         section: "Stock", featureKey: "stock_intelligence" },
    ],
  },

  {
    key: "finanzas",
    name: "Finanzas",
    icon: Landmark,
    href: "/cash-registers",
    moduleKey: "finanzas",
    requiredRoles: ["ADMIN", "FINANCES"] as const,
    items: [
      { name: "Cajas",             href: "/cash-registers", icon: Landmark,  section: "Tesorería" },
      { name: "Bancos",            href: "/bancos",         icon: Building2, section: "Tesorería" },
      { name: "Banco de Cheques",  href: "/banco-cheques",  icon: Banknote,  section: "Tesorería", featureKey: "bank_module" },
      { name: "Cuentas Bancarias", href: "/banks",          icon: Landmark,  section: "Tesorería", featureKey: "bank_module" },
      { name: "Tarjetas",          href: "/cards",          icon: CreditCard,section: "Tesorería", featureKey: "cards" },
      { name: "MercadoPago",       href: "/mercadopago",    icon: Smartphone,section: "Tesorería", featureKey: "mercadopago" },
      // Libro IVA vive acá y solo acá: antes estaba duplicado en Contabilidad.
      { name: "Libro IVA",         href: "/iva",            icon: BookOpen,  section: "Tesorería", featureKey: "iva_book" },
      // Contabilidad se pliega dentro de Finanzas: sin Libro IVA le quedaban
      // 2 pantallas, que no sostienen un icono propio en el riel.
      { name: "Asientos Contables", href: "/accounting/journal-entries", icon: BookOpen,   section: "Contabilidad", featureKey: "accounting" },
      { name: "Plan de Cuentas",    href: "/accounting/accounts",        icon: BookMarked, section: "Contabilidad", featureKey: "accounting" },
    ],
  },

  {
    // Los informes son transversales (ventas, compras, stock, cobranzas): no
    // pertenecen a Compras ni a Finanzas. Un módulo propio sobre el hub.
    key: "reportes",
    name: "Reportes",
    icon: BarChart2,
    href: "/reports",
    featureKey: "reports",
    requiredRoles: ["ADMIN", "FINANCES"] as const,
    items: [
      { name: "Todos los reportes",       href: "/reports",                        icon: BarChart2 },
      { name: "Ventas",                   href: "/reports/sales",                  icon: TrendingUp },
      { name: "Compras por proveedor",    href: "/reports/purchases",              icon: Truck },
      { name: "Facturas de compras",      href: "/reports/purchase-invoices",      icon: FileText },
      { name: "Retenciones practicadas",  href: "/reports/retentions",             icon: Percent },
      { name: "Rentabilidad de productos",href: "/reports/profitability",          icon: PieChart },
      { name: "Valorización de stock",    href: "/reports/stock-valuation",        icon: Coins },
      { name: "Cuentas a cobrar",         href: "/reports/accounts-receivable",    icon: Wallet },
      { name: "Deuda por antigüedad",     href: "/reports/cc-aging",               icon: ClipboardX },
      { name: "Flujo de cobros",          href: "/reports/cash-flow",              icon: Banknote },
    ],
  },

  {
    key: "sistema",
    name: "Sistema",
    icon: Settings,
    href: "/settings",
    requiredRoles: ["ADMIN"] as const,
    items: [
      { name: "General",   href: "/settings", icon: Settings },
      { name: "Historial", href: "/activity", icon: History, featureKey: "activity_log" },
    ],
  },
];

/** href puede incluir query (?entity=...): separamos el path para comparar. */
const hrefPath = (h: string) => {
  const i = h.indexOf("?");
  return i >= 0 ? h.slice(0, i) : h;
};

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, mobileMenuOpen, closeMobileMenu, navTheme } = useUIStore();
  const { user, logout } = useAuthStore();
  const { role, isModuleEnabled } = usePermissions();
  const { hasFeature } = useFeatures();
  const theme = getNavTheme(navTheme);
  const { companies, activeCompany } = useCompanyStore();
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useOfflineStore((s) => s.connection);
  const pendingSales = useOfflineStore((s) => s.pendingSales);

  const displayCompanyName =
    role === "SUPER_ADMIN"
      ? activeCompany()?.name ?? "Cloud Bill"
      : user?.companyName ?? "Cloud Bill";
  const displayLogoUrl =
    role === "SUPER_ADMIN"
      ? activeCompany()?.logoUrl ?? null
      : user?.companyLogoUrl ?? null;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  /** Índice resaltado en la lista de resultados, movible con las flechas. */
  const [activeIndex, setActiveIndex] = useState(0);
  /** Módulo mostrado en el flyout (panel suelto). null = cerrado. */
  const [flyoutKey, setFlyoutKey] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const flyoutOpenerRef = useRef<HTMLElement | null>(null);

  const childIsActive = (href: string) => {
    const i = href.indexOf("?");
    const path = i >= 0 ? href.slice(0, i) : href;
    if (location.pathname !== path) return false;
    if (i < 0) return true;
    const target = new URLSearchParams(href.slice(i + 1));
    const current = new URLSearchParams(location.search);
    for (const [k, v] of target) if (current.get(k) !== v) return false;
    return true;
  };

  const visibleModules = useMemo(() => {
    const source = role === "SUPER_ADMIN" ? superAdminModules : navModules;
    return source
      .filter((m) => {
        if (m.requiredRoles && !m.requiredRoles.includes(role)) return false;
        if (m.moduleKey && !isModuleEnabled(m.moduleKey)) return false;
        if (m.featureKey && !hasFeature(m.featureKey as any)) return false;
        return true;
      })
      .map((m) => ({
        ...m,
        items: m.items?.filter((i) => !i.featureKey || hasFeature(i.featureKey as any)),
      }))
      // Un módulo cuyos items quedaron todos ocultos por el plan no va al riel.
      .filter((m) => !m.items || m.items.length > 0);
  }, [role, isModuleEnabled, hasFeature]);

  /**
   * Módulo activo derivado de la ruta — nunca de estado guardado, así un link
   * directo o un F5 no abren el panel de otro módulo.
   */
  const activeModule = useMemo(() => {
    let best: NavModule | null = null;
    let bestLen = -1;
    for (const m of visibleModules) {
      for (const target of [m.href, ...(m.items ?? []).map((i) => i.href)]) {
        const path = hrefPath(target);
        const hit =
          location.pathname === path ||
          (path !== "/" && location.pathname.startsWith(path + "/"));
        if (hit && path.length > bestLen) { best = m; bestLen = path.length; }
      }
    }
    return best;
  }, [visibleModules, location.pathname]);

  const searchableItems = useMemo(
    () =>
      visibleModules.flatMap((m) =>
        (m.items ?? [{ name: m.name, href: m.href, icon: m.icon }]).map((i) => ({
          name: i.name,
          href: i.href,
          icon: i.icon,
          breadcrumb: m.items ? m.name : "",
        }))
      ),
    [visibleModules]
  );

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? searchableItems.filter(
        (i) => i.name.toLowerCase().includes(q) || i.breadcrumb.toLowerCase().includes(q)
      )
    : [];
  /** Lo que realmente se lista: los resultados, o los primeros ítems sin query. */
  const searchList = q ? searchResults : searchableItems.slice(0, 12);

  // Al navegar: cerrar cajón, flyout y búsqueda.
  useEffect(() => {
    closeMobileMenu();
    setFlyoutKey(null);
    setSearchMode(false);
    setSearchQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const openSearch = () => {
    setSearchMode(true);
    setActiveIndex(0);
    if (!sidebarOpen) setFlyoutKey("__search");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  // Al cambiar lo tecleado, el resaltado vuelve arriba: si no, queda apuntando
  // a una posición que ya es otra pantalla.
  useEffect(() => { setActiveIndex(0); }, [q]);

  /**
   * Flechas para moverse por los resultados y Enter para entrar. El scroll se
   * resuelve dentro del panel desde el que se tecleó — el buscador se monta dos
   * veces (panel fijado y flyout) y no deben pisarse.
   */
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape: primero limpia lo tecleado, recién después cierra el buscador.
    if (e.key === "Escape") {
      e.stopPropagation();
      if (searchQuery) { setSearchQuery(""); return; }
      setSearchMode(false);
      setFlyoutKey(null);
      flyoutOpenerRef.current?.focus();
      return;
    }

    if (searchList.length === 0) return;

    const move = (next: number) => {
      e.preventDefault();
      setActiveIndex(next);
      const root = e.currentTarget.closest("[data-search-root]");
      root?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
    };

    if (e.key === "ArrowDown") return move((activeIndex + 1) % searchList.length);
    if (e.key === "ArrowUp") return move((activeIndex - 1 + searchList.length) % searchList.length);
    if (e.key === "Home") return move(0);
    if (e.key === "End") return move(searchList.length - 1);
    if (e.key === "Enter") {
      const item = searchList[activeIndex];
      if (!item) return;
      e.preventDefault();
      navigate(item.href);
    }
  };

  // Sin atajo global acá a propósito: Ctrl+K ya lo tiene GlobalSearch (busca
  // registros: clientes, productos, comprobantes) y Ctrl+B enfoca el lector de
  // código de barras en los formularios. Este buscador es solo de pantallas y
  // se abre desde su tile del riel.

  // Flyout: cierre por click afuera y por Escape, con foco devuelto al tile.
  useEffect(() => {
    if (!flyoutKey) return;
    const closeFlyout = () => {
      setFlyoutKey(null);
      setSearchMode(false);
      flyoutOpenerRef.current?.focus();
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (flyoutRef.current?.contains(target)) return;
      if (flyoutOpenerRef.current?.contains(target)) return;
      setFlyoutKey(null);
      setSearchMode(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // No debe llegar al atajo global de "cancelar" de los formularios.
        e.stopPropagation();
        closeFlyout();
        return;
      }
      if (e.key !== "Tab" || !flyoutRef.current) return;
      // Trampa de foco: el flyout es un overlay, el Tab no debe escaparse.
      const focusables = flyoutRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyoutKey]);

  // Al abrir el flyout de un módulo, el foco entra en el panel.
  useEffect(() => {
    if (!flyoutKey || flyoutKey === "__search") return;
    flyoutRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [flyoutKey]);

  const handleTileClick = (module: NavModule, e: React.MouseEvent<HTMLElement>) => {
    if (!module.items) { navigate(module.href); return; }
    if (sidebarOpen) { navigate(module.href); return; }
    flyoutOpenerRef.current = e.currentTarget;
    setFlyoutKey((prev) => (prev === module.key ? null : module.key));
  };

  const userInitials =
    user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const flyoutModule = visibleModules.find((m) => m.key === flyoutKey) ?? null;
  /** El panel del módulo se ve si está fijado, o dentro del cajón mobile. */
  const showPanel = sidebarOpen || mobileMenuOpen;
  const panelModule = searchMode ? null : activeModule;

  /** Sin conexión, todo lo que no lea de la caché local queda deshabilitado. */
  const offlineBlocked = (href: string) =>
    connection === 'offline' && !isAvailableOffline(href);

  // ── Sub-render: contenido del panel de un módulo ──
  const renderItems = (items: NavItem[], onNavigate?: () => void) => {
    let lastSection: string | undefined;
    return items.map((item) => {
      const showSection = item.section && item.section !== lastSection;
      lastSection = item.section;
      return (
        <li key={item.href}>
          {showSection && (
            <p className="px-2 pt-3 pb-1 text-[10px] font-semibold text-white/35 uppercase tracking-[0.12em]">
              {item.section}
            </p>
          )}
          <NavLink
            to={item.href}
            end
            onClick={(e) => {
              // Sin conexión no navega: la pantalla de destino no funcionaría.
              if (offlineBlocked(item.href)) { e.preventDefault(); return; }
              onNavigate?.();
            }}
            aria-disabled={offlineBlocked(item.href) || undefined}
            title={offlineBlocked(item.href) ? OFFLINE_UNAVAILABLE_HINT : undefined}
            className={clsx(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px]",
              "transition-[background-color,color] duration-150 ease-out",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              offlineBlocked(item.href)
                ? "text-white/25 cursor-not-allowed font-medium"
                : childIsActive(item.href)
                ? "bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-900/60"
                : "text-white/60 hover:bg-white/10 hover:text-white font-medium"
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.name}</span>
            {offlineBlocked(item.href) ? (
              <CloudOff className="w-3 h-3 ml-auto flex-shrink-0 text-white/25" />
            ) : (
              item.href === '/ventas-pendientes' && pendingSales > 0 && (
                <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-[16px] text-white">
                  {pendingSales}
                </span>
              )
            )}
          </NavLink>
        </li>
      );
    });
  };

  const searchPanel = (
    <div className="flex-1 min-h-0 flex flex-col" data-search-root>
      <div className="px-2.5 pt-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Buscar menú…"
            role="combobox"
            aria-expanded={searchList.length > 0}
            aria-controls="menu-search-results"
            aria-activedescendant={
              searchList[activeIndex] ? `menu-search-opt-${activeIndex}` : undefined
            }
            className="w-full bg-white/[0.08] text-white/80 placeholder-white/30 text-xs rounded-lg pl-8 pr-7 py-2 outline-none focus:ring-1 focus:ring-white/30 transition-shadow"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <ul
        id="menu-search-results"
        role="listbox"
        className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {q && searchResults.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-white/35">Sin resultados</li>
        ) : (
          searchList.map((item, idx) => {
            const highlighted = idx === activeIndex;
            return (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  end={item.href === "/"}
                  id={`menu-search-opt-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={highlighted}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={clsx(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    highlighted ? "bg-white/10 text-white" : "text-white/60"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block leading-none truncate">{item.name}</span>
                    {item.breadcrumb && (
                      <span
                        className={clsx(
                          "block text-[10px] leading-none mt-0.5",
                          highlighted ? "text-white/45" : "text-white/30"
                        )}
                      >
                        {item.breadcrumb}
                      </span>
                    )}
                  </span>
                </NavLink>
              </li>
            );
          })
        )}
      </ul>

      {searchList.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-white/[0.08] flex-shrink-0">
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/45 font-sans">↑</kbd>
            <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/45 font-sans">↓</kbd>
            moverse
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/45 font-sans">↵</kbd>
            abrir
          </span>
        </div>
      )}
    </div>
  );

  const tileClass = (active: boolean) =>
    clsx(
      "relative flex items-center justify-center w-11 h-11 rounded-[10px] flex-shrink-0",
      "transition-[background-color,color] duration-150 ease-out",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
      active
        ? "bg-indigo-500/[0.18] text-indigo-300"
        : "text-white/50 hover:bg-white/10 hover:text-white"
    );

  return (
    <>
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      <aside
        style={{ backgroundColor: theme.bg }}
        className={clsx(
          "fixed left-0 top-0 z-50 h-screen flex",
          // Mobile: cajón con riel + panel juntos. Desktop: riel, + panel si está fijado.
          "w-[300px]",
          sidebarOpen ? "md:w-[300px]" : "md:w-[68px]",
          "transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* ── Riel: 68 px, nunca desaparece ── */}
        <div className="w-[68px] flex-shrink-0 h-full flex flex-col items-center py-3 gap-1">
          <div
            className="w-[34px] h-[34px] rounded-[9px] bg-white flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden mb-2.5"
            title={displayCompanyName}
          >
            {displayLogoUrl ? (
              <img src={displayLogoUrl} alt={displayCompanyName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-[15px] font-extrabold text-primary-600 uppercase leading-none">
                {displayCompanyName.charAt(0)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => { flyoutOpenerRef.current = e.currentTarget; openSearch(); }}
            className={tileClass(searchMode)}
            title="Buscar pantallas"
            aria-label="Buscar en el menú"
          >
            <Search className="w-5 h-5" />
          </button>

          <div className="w-8 h-px bg-white/10 my-1.5 flex-shrink-0" />

          <div className="flex-1 min-h-0 w-full overflow-y-auto flex flex-col items-center gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleModules.map((module) => {
              const active = activeModule?.key === module.key && !searchMode;
              // Un módulo queda atenuado solo si NINGUNA de sus pantallas
              // funciona sin conexión: Ventas sigue vivo por la carga de
              // ventas y por las pendientes.
              const dimmed =
                connection === 'offline' &&
                [module.href, ...(module.items ?? []).map((i) => i.href)].every(
                  (h) => !isAvailableOffline(h)
                );
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={(e) => handleTileClick(module, e)}
                  className={clsx(tileClass(active || flyoutKey === module.key), dimmed && "opacity-40")}
                  title={dimmed ? `${module.name} — ${OFFLINE_UNAVAILABLE_HINT}` : module.name}
                  aria-label={module.name}
                  aria-current={active ? "page" : undefined}
                  aria-expanded={module.items ? flyoutKey === module.key : undefined}
                >
                  {active && (
                    <span className="absolute -left-3 top-2.5 w-[3px] h-[22px] rounded-r-[3px] bg-indigo-500" />
                  )}
                  <module.icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 flex-shrink-0 pt-2">
            {/* Con el panel suelto ésta es la única forma de volver a fijarlo:
                va en el riel y no flotando, que se solapaba con el flyout. */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={toggleSidebar}
                className={clsx(tileClass(false), "hidden md:flex")}
                title="Fijar panel"
                aria-label="Fijar panel"
              >
                <PinOff className="w-[18px] h-[18px]" />
              </button>
            )}
            <NotificationBell
              align="left"
              triggerClassName={tileClass(false)}
              iconClassName="w-5 h-5"
            />
            <button
              type="button"
              onClick={() => { if (confirmLogoutWithPendingSales()) logout(); }}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white/40 hover:bg-red-500/20 hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
            <div
              className="w-[30px] h-[30px] rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center flex-shrink-0"
              title={user?.name ?? undefined}
            >
              <span className="text-indigo-300 text-[10px] font-bold leading-none">{userInitials}</span>
            </div>
          </div>
        </div>

        {/* ── Panel del módulo: 232 px, fijado ── */}
        {showPanel && (
          <div className="w-[232px] flex-shrink-0 h-full flex flex-col border-r border-white/[0.08] bg-white/[0.03] min-w-0">
            {/* Identidad de la empresa: siempre arriba de todo. */}
            <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3 flex-shrink-0 border-b border-white/[0.08]">
              <div className="w-8 h-8 rounded-[9px] bg-white flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                {displayLogoUrl ? (
                  <img src={displayLogoUrl} alt={displayCompanyName} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[14px] font-extrabold text-primary-600 uppercase leading-none">
                    {displayCompanyName.charAt(0)}
                  </span>
                )}
              </div>
              <p className="min-w-0 flex-1 text-[13px] font-bold text-white tracking-tight truncate" title={displayCompanyName}>
                {displayCompanyName}
              </p>
            </div>

            <div className="flex items-center gap-2 px-3.5 pt-3 pb-2 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-white tracking-tight truncate">
                  {searchMode ? "Buscar" : panelModule?.name ?? "Inicio"}
                </p>
                {!searchMode && panelModule?.items && (
                  <p className="text-[11px] text-white/35 mt-0.5">
                    {panelModule.items.length} pantallas
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="hidden md:flex w-[26px] h-[26px] rounded-[7px] items-center justify-center bg-white/10 text-indigo-300 hover:bg-white/20 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Soltar panel"
                aria-label="Soltar panel"
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={closeMobileMenu}
                className="md:hidden w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors flex-shrink-0"
                aria-label="Cerrar menú"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {searchMode ? (
              searchPanel
            ) : panelModule?.items ? (
              <ul className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {renderItems(panelModule.items)}
              </ul>
            ) : (
              /* Sin módulo abierto (Inicio): no hay pantallas que listar. */
              <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-6 text-center">
                <p className="text-[12px] text-white/35 leading-snug">
                  Elegí un módulo del riel para ver sus pantallas.
                </p>
              </div>
            )}

            {role === "SUPER_ADMIN" && companies.length > 0 && (
              <div className="px-2.5 pb-2.5 flex-shrink-0">
                <CompanySwitcher showText />
              </div>
            )}
          </div>
        )}

      </aside>

      {/* ── Flyout: el panel del módulo cuando está suelto ── */}
      {!sidebarOpen && flyoutKey && (
        <div
          ref={flyoutRef}
          role="dialog"
          aria-label={flyoutModule?.name ?? "Buscar"}
          style={{ backgroundColor: theme.bg }}
          className="hidden md:flex fixed left-[76px] top-3 z-[60] w-[232px] max-h-[calc(100vh-24px)] flex-col rounded-xl border border-white/[0.12] shadow-2xl shadow-black/50 overflow-hidden"
        >
          {flyoutKey === "__search" ? (
            searchPanel
          ) : (
            <>
              <div className="px-3.5 pt-3 pb-2 border-b border-white/[0.08] flex-shrink-0">
                <p className="text-[13px] font-bold text-white tracking-tight">{flyoutModule?.name}</p>
                <p className="text-[10px] text-white/35 mt-0.5">
                  {flyoutModule?.items?.length ?? 0} pantallas
                </p>
              </div>
              <ul className="flex-1 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {flyoutModule?.items && renderItems(flyoutModule.items, () => setFlyoutKey(null))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
