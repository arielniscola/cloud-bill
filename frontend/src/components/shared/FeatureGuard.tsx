import { Lock } from 'lucide-react';
import { useFeatures } from '../../hooks/useFeatures';
import { FEATURE_LABELS, PLAN_FEATURES, PLAN_NAMES, PLAN_LABELS, type FeatureKey } from '../../utils/planFeatures';

interface FeatureGuardProps {
  feature: FeatureKey;
  children: React.ReactNode;
  /** When true, renders nothing instead of the upgrade prompt */
  silent?: boolean;
}

export default function FeatureGuard({ feature, children, silent = false }: FeatureGuardProps) {
  const { hasFeature, plan } = useFeatures();

  if (hasFeature(feature)) return <>{children}</>;

  if (silent) return null;

  // Find the minimum plan that includes this feature
  const requiredPlan = PLAN_NAMES.find((p) => PLAN_FEATURES[p]?.has(feature));

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-gray-400 dark:text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-slate-200 mb-1">
        Funcionalidad no disponible
      </h3>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-1 max-w-xs">
        <span className="font-medium">{FEATURE_LABELS[feature]}</span> no está incluido en tu plan actual
        {plan ? ` (${PLAN_LABELS[plan as keyof typeof PLAN_LABELS] ?? plan})` : ''}.
      </p>
      {requiredPlan && (
        <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mt-1">
          Disponible desde el plan {PLAN_LABELS[requiredPlan]}
        </p>
      )}
    </div>
  );
}
