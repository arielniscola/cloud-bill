import { useAuthStore } from '../stores';
import type { FeatureKey } from '../utils/planFeatures';

/**
 * Returns feature access helpers based on the authenticated user's company plan.
 * SUPER_ADMIN always has access to everything.
 * Reads the features array provided by the server in the login response.
 */
export function useFeatures() {
  const { user } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const plan = user?.plan ?? 'PRO';
  const features: string[] = user?.features ?? [];

  function hasFeature(feature: FeatureKey): boolean {
    if (isSuperAdmin) return true;
    return features.includes(feature);
  }

  return {
    plan,
    hasFeature,
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
