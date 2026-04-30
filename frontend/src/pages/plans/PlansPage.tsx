import { Crown, Check, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { PageHeader } from '../../components/shared';
import {
  PLAN_NAMES,
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_COLORS,
  PLAN_FEATURE_MATRIX,
  FEATURE_LABELS,
  type PlanName,
  type FeatureKey,
} from '../../utils/planFeatures';

function planIncludes(plan: PlanName, feature: FeatureKey): boolean {
  return PLAN_FEATURE_MATRIX.find((r) => r.feature === feature)?.plans.includes(plan) ?? false;
}

function PlanCard({ plan }: { plan: PlanName }) {
  const colors = PLAN_COLORS[plan];
  const featureCount = PLAN_FEATURE_MATRIX.filter((r) => r.plans.includes(plan)).length;

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className={clsx('px-5 py-5 border-b border-gray-100 dark:border-slate-700', colors.bg)}>
        <div className="flex items-center gap-2 mb-1">
          <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', 'bg-white/70 dark:bg-slate-800/50')}>
            <Crown className={clsx('w-4 h-4', colors.text)} />
          </div>
          <h3 className={clsx('text-base font-bold', colors.text)}>
            {PLAN_LABELS[plan]}
          </h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">{PLAN_DESCRIPTIONS[plan]}</p>
        <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mt-2">
          {featureCount} de {PLAN_FEATURE_MATRIX.length} funcionalidades
        </p>
      </div>

      {/* Features list */}
      <div className="p-5 flex-1">
        <ul className="space-y-2.5">
          {PLAN_FEATURE_MATRIX.map(({ feature }) => {
            const included = planIncludes(plan, feature);
            return (
              <li
                key={feature}
                className={clsx(
                  'flex items-start gap-2.5 text-sm',
                  included ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500',
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    included
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-gray-50 dark:bg-slate-700 text-gray-300 dark:text-slate-600',
                  )}
                >
                  {included ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                </span>
                <span className={clsx('leading-tight', !included && 'line-through opacity-70')}>
                  {FEATURE_LABELS[feature]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tabla comparativa</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Vista detallada feature por feature</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/50">
            <tr>
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Funcionalidad</th>
              {PLAN_NAMES.map((p) => (
                <th key={p} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-28">
                  {PLAN_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {PLAN_FEATURE_MATRIX.map(({ feature }) => (
              <tr key={feature} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/20">
                <td className="px-5 py-2.5 text-sm text-gray-700 dark:text-slate-300">{FEATURE_LABELS[feature]}</td>
                {PLAN_NAMES.map((p) => {
                  const included = planIncludes(p, feature);
                  return (
                    <td key={p} className="text-center px-3 py-2.5">
                      {included ? (
                        <Check className="w-4 h-4 text-emerald-500 inline-block" />
                      ) : (
                        <Minus className="w-4 h-4 text-gray-300 dark:text-slate-600 inline-block" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlansPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Planes y funcionalidades"
        subtitle="Comparativa de funcionalidades incluidas en cada plan"
      />

      {/* 3 cards de planes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLAN_NAMES.map((p) => (
          <PlanCard key={p} plan={p} />
        ))}
      </div>

      {/* Tabla comparativa */}
      <ComparisonTable />
    </div>
  );
}
