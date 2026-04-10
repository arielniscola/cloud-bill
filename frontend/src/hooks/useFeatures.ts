import { useAuthStore } from '../stores';
import { planHasFeature, type FeatureKey } from '../utils/planFeatures';

/**
 * Returns feature access helpers based on the authenticated user's company plan.
 * SUPER_ADMIN always has access to everything.
 */
export function useFeatures() {
  const { user } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const plan = user?.plan ?? 'PRO';
  // features array from login response (pre-computed by server)
  const features: string[] = user?.features ?? [];

  function hasFeature(feature: FeatureKey): boolean {
    if (isSuperAdmin) return true;
    // Use server-provided features array if available, fallback to local matrix
    if (features.length > 0) return features.includes(feature);
    return planHasFeature(plan, feature);
  }

  return {
    plan,
    hasFeature,
    // Convenience flags for commonly-gated features
    canUseAccounting:        hasFeature('accounting'),
    canUseMercadoPago:       hasFeature('mercadopago'),
    hasActivityLog:          hasFeature('activity_log'),
    hasStockIntelligence:    hasFeature('stock_intelligence'),
    hasReports:              hasFeature('reports'),
    hasBudgets:              hasFeature('budgets'),
    hasBankModule:           hasFeature('bank_module'),
    hasCards:                hasFeature('cards'),
    hasIvaBook:              hasFeature('iva_book'),
    hasCurrentAccounts:      hasFeature('current_accounts'),
    hasSupplierAccounts:     hasFeature('supplier_accounts'),
    hasMultiWarehouse:       hasFeature('multi_warehouse'),
  };
}
