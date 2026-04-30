// UI metadata only. Source of truth for the feature matrix is the backend
// (`backend/src/shared/constants/planFeatures.ts`); the frontend receives the
// list of features for the current company in the login response (user.features)
// and consumes it via `useFeatures()`.

export type PlanName = 'STARTER' | 'PRO' | 'ENTERPRISE';

export const PLAN_NAMES: PlanName[] = ['STARTER', 'PRO', 'ENTERPRISE'];

export const PLAN_LABELS: Record<PlanName, string> = {
  STARTER:    'Starter',
  PRO:        'Pro',
  ENTERPRISE: 'Enterprise',
};

export const PLAN_DESCRIPTIONS: Record<PlanName, string> = {
  STARTER:    'Ventas básicas, catálogo, stock y presupuestos',
  PRO:        'Todo Starter + reportes, IVA, múltiples almacenes, cuentas corrientes, bancos, tarjetas, historial e inteligencia de stock',
  ENTERPRISE: 'Todo Pro + contabilidad completa y MercadoPago',
};

export const PLAN_COLORS: Record<PlanName, { bg: string; text: string; border: string }> = {
  STARTER:    { bg: 'bg-blue-50 dark:bg-blue-900/20',     text: 'text-blue-700 dark:text-blue-300',     border: 'border-blue-200 dark:border-blue-700' },
  PRO:        { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
  ENTERPRISE: { bg: 'bg-amber-50 dark:bg-amber-900/20',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-700' },
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
  reports:            'Reportes',
  budgets:            'Presupuestos',
  bank_module:        'Banco de cheques + cuentas bancarias',
  cards:              'Tarjetas de crédito/débito',
  iva_book:           'Libro IVA',
  current_accounts:   'Cuentas corrientes (clientes)',
  supplier_accounts:  'Cuentas corrientes (proveedores)',
  multi_warehouse:    'Múltiples almacenes',
};

// Mirrors the backend matrix — used only for UI display (matrix in CompanyDetailPage)
// and for FeatureGuard to compute the minimum required plan to show in the lock screen.
// Keep in sync with `backend/src/shared/constants/planFeatures.ts`.
export const PLAN_FEATURE_MATRIX: { feature: FeatureKey; plans: PlanName[] }[] = [
  { feature: 'budgets',           plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
  { feature: 'reports',           plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'iva_book',          plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'multi_warehouse',   plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'current_accounts',  plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'supplier_accounts', plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'bank_module',       plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'cards',             plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'activity_log',      plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'stock_intelligence',plans: ['PRO', 'ENTERPRISE'] },
  { feature: 'accounting',        plans: ['ENTERPRISE'] },
  { feature: 'mercadopago',       plans: ['ENTERPRISE'] },
];

/** Minimum plan that includes the given feature (used by FeatureGuard upgrade prompt). */
export function minimumPlanFor(feature: FeatureKey): PlanName | undefined {
  const row = PLAN_FEATURE_MATRIX.find((r) => r.feature === feature);
  if (!row) return undefined;
  return PLAN_NAMES.find((p) => row.plans.includes(p));
}
