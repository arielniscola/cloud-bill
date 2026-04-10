export type PlanName = 'STARTER' | 'PRO' | 'ENTERPRISE';

export const PLAN_NAMES: PlanName[] = ['STARTER', 'PRO', 'ENTERPRISE'];

export const PLAN_LABELS: Record<PlanName, string> = {
  STARTER:    'Starter',
  PRO:        'Pro',
  ENTERPRISE: 'Enterprise',
};

export const PLAN_DESCRIPTIONS: Record<PlanName, string> = {
  STARTER:    'Ventas, catálogo, stock, presupuestos, reportes e IVA',
  PRO:        'Todo Starter + compras, cuentas corrientes, bancos, tarjetas, historial e inteligencia de stock',
  ENTERPRISE: 'Todo Pro + contabilidad completa y MercadoPago',
};

export const PLAN_COLORS: Record<PlanName, { bg: string; text: string; border: string }> = {
  STARTER:    { bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-700' },
  PRO:        { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
  ENTERPRISE: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-700' },
};

export type FeatureKey =
  | 'accounting'
  | 'mercadopago'
  | 'activity_log'
  | 'stock_intelligence'
  | 'reports'
  | 'budgets'
  | 'bank_module'
  | 'cards'
  | 'iva_book'
  | 'current_accounts'
  | 'supplier_accounts'
  | 'multi_warehouse';

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  accounting:         'Contabilidad (Plan de Cuentas + Asientos)',
  mercadopago:        'MercadoPago',
  activity_log:       'Historial de actividad',
  stock_intelligence: 'Inteligencia de stock',
  reports:            'Reportes de ventas',
  budgets:            'Presupuestos',
  bank_module:        'Banco de cheques + cuentas bancarias',
  cards:              'Tarjetas de crédito/débito',
  iva_book:           'Libro IVA',
  current_accounts:   'Cuentas corrientes (clientes)',
  supplier_accounts:  'Cuentas corrientes (proveedores)',
  multi_warehouse:    'Múltiples almacenes',
};

const STARTER_FEATURES: FeatureKey[] = [
  'budgets', 'reports', 'iva_book', 'multi_warehouse',
];

const PRO_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  'current_accounts', 'supplier_accounts', 'bank_module', 'cards',
  'activity_log', 'stock_intelligence',
];

const ENTERPRISE_FEATURES: FeatureKey[] = [
  ...PRO_FEATURES,
  'accounting', 'mercadopago',
];

export const PLAN_FEATURES: Record<PlanName, Set<FeatureKey>> = {
  STARTER:    new Set(STARTER_FEATURES),
  PRO:        new Set(PRO_FEATURES),
  ENTERPRISE: new Set(ENTERPRISE_FEATURES),
};

export function planHasFeature(plan: string, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan as PlanName]?.has(feature) ?? false;
}

// Modules (nav sections) included in each plan
export const PLAN_MODULES: Record<PlanName, string[]> = {
  STARTER:    ['ventas', 'catalogo', 'finanzas'],
  PRO:        ['ventas', 'catalogo', 'compras', 'finanzas'],
  ENTERPRISE: ['ventas', 'catalogo', 'compras', 'finanzas'],
};

// Feature breakdown by plan for display in UI
export const PLAN_FEATURE_MATRIX: { feature: FeatureKey; plans: PlanName[] }[] = [
  { feature: 'budgets',           plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
  { feature: 'reports',           plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
  { feature: 'iva_book',          plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
  { feature: 'multi_warehouse',   plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
  { feature: 'current_accounts',  plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'supplier_accounts', plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'bank_module',       plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'cards',             plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'activity_log',      plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'stock_intelligence',plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'accounting',        plans: ['ENTERPRISE'] },
  { feature: 'mercadopago',       plans: ['ENTERPRISE'] },
];
