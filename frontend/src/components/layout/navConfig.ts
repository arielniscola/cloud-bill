import type React from "react";
import {
  Home, Users, Package, FolderTree, Tag, Layers, Warehouse, PackageSearch,
  FileText, ClipboardList, ClipboardCheck, CreditCard, Landmark, Settings,
  ArrowRightLeft, BarChart2, TrendingUp, History, BookOpen, Truck, ShoppingCart,
  Calculator, Brain, Receipt, ShoppingBag, Store, Banknote, Building2,
  Smartphone, FileEdit, BookMarked, Sliders, Crown, Repeat, Percent, Coins,
  Wallet, PieChart, ClipboardX, CloudOff,
} from "lucide-react";

/**
 * Fuente única del menú: la usan el Sidebar y el Navbar (barra superior).
 * Antes cada uno tenía su propia copia y el Navbar quedaba atrasado.
 */

export interface NavItem {
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
export interface NavModule {
  key: string;
  name: string;
  icon: React.ElementType;
  href: string;
  items?: NavItem[];
  moduleKey?: string;                 // enabledModules de la empresa
  featureKey?: string;
  requiredRoles?: readonly string[];
}

export const superAdminModules: NavModule[] = [
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

export const navModules: NavModule[] = [
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
export const hrefPath = (h: string) => {
  const i = h.indexOf("?");
  return i >= 0 ? h.slice(0, i) : h;
};

/** ¿El href (con query opcional) coincide con la ubicación actual? */
export const isHrefActive = (href: string, pathname: string, search: string) => {
  const i = href.indexOf("?");
  const path = i >= 0 ? href.slice(0, i) : href;
  if (pathname !== path) return false;
  if (i < 0) return true;
  const target = new URLSearchParams(href.slice(i + 1));
  const current = new URLSearchParams(search);
  for (const [k, v] of target) if (current.get(k) !== v) return false;
  return true;
};
