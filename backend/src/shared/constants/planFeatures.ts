export type PlanName = 'STARTER' | 'PRO' | 'ENTERPRISE';

export const PLAN_NAMES: PlanName[] = ['STARTER', 'PRO', 'ENTERPRISE'];

export const FEATURE_KEYS = [
  'accounting',         // Plan de cuentas + Asientos contables
  'mercadopago',        // Integración MercadoPago
  'activity_log',       // Historial de actividad (si OFF → no escribe en BD)
  'stock_intelligence', // Inteligencia de stock
  'reports',            // Reportes de ventas
  'budgets',            // Presupuestos
  'bank_module',        // Cheques + cuentas bancarias
  'cards',              // Tarjetas de crédito/débito
  'iva_book',           // Libro IVA
  'current_accounts',   // Cuentas corrientes clientes
  'supplier_accounts',  // Cuentas corrientes proveedores
  'multi_warehouse',    // Múltiples almacenes
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

// Feature matrix — which features each plan includes
const STARTER_FEATURES: FeatureKey[] = [
  'budgets',
  'reports',
  'iva_book',
  'multi_warehouse',
];

const PRO_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  'current_accounts',
  'supplier_accounts',
  'bank_module',
  'cards',
  'activity_log',
  'stock_intelligence',
];

const ENTERPRISE_FEATURES: FeatureKey[] = [
  ...PRO_FEATURES,
  'accounting',
  'mercadopago',
];

export const PLAN_FEATURES: Record<PlanName, Set<FeatureKey>> = {
  STARTER:    new Set(STARTER_FEATURES),
  PRO:        new Set(PRO_FEATURES),
  ENTERPRISE: new Set(ENTERPRISE_FEATURES),
};

export function planHasFeature(plan: string, feature: FeatureKey): boolean {
  const p = plan as PlanName;
  return PLAN_FEATURES[p]?.has(feature) ?? false;
}

export function getFeaturesForPlan(plan: string): FeatureKey[] {
  const p = plan as PlanName;
  return Array.from(PLAN_FEATURES[p] ?? []);
}

// Modules (nav sections) each plan grants access to
export const PLAN_MODULES: Record<PlanName, string> = {
  STARTER:    'ventas,catalogo,finanzas',
  PRO:        'ALL',
  ENTERPRISE: 'ALL',
};
