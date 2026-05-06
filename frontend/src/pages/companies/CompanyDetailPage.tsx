import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, CheckCircle2, XCircle, Save, Crown, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button } from '../../components/ui';
import companiesService from '../../services/companies.service';
import type { Company } from '../../types/company.types';
import { MODULE_LABELS, ALL_MODULE_KEYS, type ModuleKey } from '../../types/company.types';
import { formatDate } from '../../utils/formatters';
import {
  PLAN_NAMES, PLAN_LABELS, PLAN_DESCRIPTIONS, PLAN_COLORS,
  PLAN_FEATURE_MATRIX, FEATURE_LABELS, type PlanName,
} from '../../utils/planFeatures';

const TAX_LABEL: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTISTA:        'Monotributista',
  EXENTO:                'Exento',
};

export default function CompanyDetailPage() {
  const navigate     = useNavigate();
  const { id }       = useParams<{ id: string }>();
  const [company, setCompany]   = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanName>('PRO');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [togglingModule, setTogglingModule] = useState<ModuleKey | null>(null);

  useEffect(() => {
    if (!id) return;
    companiesService.getById(id)
      .then(c => {
        setCompany(c);
        setSelectedPlan((c.plan as PlanName) ?? 'PRO');
      })
      .catch(() => toast.error('Error al cargar empresa'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleToggleModule = async (key: ModuleKey) => {
    if (!id || !company) return;
    const current = company.enabledModules ?? [];
    const expanded: string[] = current.includes('ALL')
      ? [...ALL_MODULE_KEYS]
      : current.filter((k) => k !== 'ALL');
    const next = expanded.includes(key)
      ? expanded.filter((k) => k !== key)
      : [...expanded, key];
    const finalList = next.length === ALL_MODULE_KEYS.length
      && ALL_MODULE_KEYS.every((k) => next.includes(k))
      ? ['ALL']
      : next;

    setTogglingModule(key);
    try {
      await companiesService.updateModules(id, finalList);
      setCompany((prev) => prev ? { ...prev, enabledModules: finalList } : prev);
      toast.success(`Módulo "${MODULE_LABELS[key].label}" ${next.includes(key) ? 'activado' : 'desactivado'}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al actualizar módulos');
    } finally {
      setTogglingModule(null);
    }
  };

  const handleSavePlan = async () => {
    if (!id) return;
    setIsSavingPlan(true);
    try {
      await companiesService.updatePlan(id, selectedPlan);
      setCompany(prev => prev ? { ...prev, plan: selectedPlan } : prev);
      toast.success(`Plan actualizado a ${PLAN_LABELS[selectedPlan]}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al actualizar el plan');
    } finally {
      setIsSavingPlan(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>;
  }

  if (!company) {
    return <div className="text-center py-16 text-gray-400">Empresa no encontrada</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/companies')}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{company.name}</h1>
              {company.isActive
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                : <XCircle className="w-5 h-5 text-red-400" />
              }
            </div>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">
              {company.cuit ? `CUIT ${company.cuit} · ` : ''}{TAX_LABEL[company.taxCondition] ?? company.taxCondition}
            </p>
          </div>
        </div>
        <Link to={`/companies/${company.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Editar datos
          </Button>
        </Link>
      </div>

      {/* Info card */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Información</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {company.address && (
            <><dt className="text-gray-400">Dirección</dt><dd className="text-gray-700 dark:text-slate-200">{company.address}</dd></>
          )}
          {company.city && (
            <><dt className="text-gray-400">Ciudad</dt><dd className="text-gray-700 dark:text-slate-200">{company.city}</dd></>
          )}
          {company.phone && (
            <><dt className="text-gray-400">Teléfono</dt><dd className="text-gray-700 dark:text-slate-200">{company.phone}</dd></>
          )}
          {company.email && (
            <><dt className="text-gray-400">Email</dt><dd className="text-gray-700 dark:text-slate-200">{company.email}</dd></>
          )}
          <dt className="text-gray-400">Creada</dt>
          <dd className="text-gray-700 dark:text-slate-200">{formatDate(company.createdAt)}</dd>
        </dl>
      </div>

      {/* Plan card */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" />
              Plan de suscripción
            </h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              El plan determina qué funcionalidades avanzadas están disponibles
            </p>
          </div>
          <Button size="sm" onClick={handleSavePlan} isLoading={isSavingPlan} disabled={selectedPlan === (company.plan as PlanName)}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Guardar
          </Button>
        </div>

        <div className="p-5">
          {/* Plan selector */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {PLAN_NAMES.map((plan) => {
              const colors = PLAN_COLORS[plan];
              const isSelected = selectedPlan === plan;
              return (
                <button
                  key={plan}
                  onClick={() => setSelectedPlan(plan)}
                  className={clsx(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    isSelected
                      ? `${colors.bg} ${colors.border} ${colors.text}`
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                  )}
                >
                  <p className={clsx('font-bold text-sm', isSelected ? colors.text : 'text-gray-700 dark:text-slate-200')}>
                    {PLAN_LABELS[plan]}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 leading-tight">
                    {PLAN_DESCRIPTIONS[plan]}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Feature matrix */}
          <div className="border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-slate-400 font-medium w-1/2">Funcionalidad</th>
                  {PLAN_NAMES.map(p => (
                    <th key={p} className={clsx('px-3 py-2 text-center font-semibold', selectedPlan === p ? PLAN_COLORS[p].text : 'text-gray-400 dark:text-slate-500')}>
                      {PLAN_LABELS[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {PLAN_FEATURE_MATRIX.map(({ feature, plans }) => (
                  <tr key={feature} className={clsx(
                    plans.includes(selectedPlan) ? '' : 'opacity-40',
                    'hover:bg-gray-50/50 dark:hover:bg-slate-700/20'
                  )}>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{FEATURE_LABELS[feature]}</td>
                    {PLAN_NAMES.map(p => (
                      <td key={p} className="px-3 py-2 text-center">
                        {plans.includes(p)
                          ? <span className="text-emerald-500 font-bold">✓</span>
                          : <span className="text-gray-200 dark:text-slate-700">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modules card */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" />
            Módulos habilitados
          </h3>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            Los módulos se gestionan de forma independiente al plan. Hacé click en cada uno para activarlo o desactivarlo.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-2">
            {ALL_MODULE_KEYS.map((key) => {
              const enabled = company?.enabledModules?.includes('ALL') || company?.enabledModules?.includes(key) || false;
              const { label, description } = MODULE_LABELS[key];
              const isToggling = togglingModule === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleToggleModule(key)}
                  disabled={isToggling}
                  className={clsx(
                    'text-left p-3 rounded-lg border text-sm transition-all duration-150 disabled:opacity-50',
                    enabled
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : 'border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 opacity-60 hover:opacity-100 hover:border-gray-300 dark:hover:border-slate-500'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={enabled ? 'text-emerald-500' : 'text-gray-300 dark:text-slate-600'}>
                      {enabled ? '✓' : '—'}
                    </span>
                    <span className={clsx('font-medium', enabled ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500')}>
                      {label}
                    </span>
                    {isToggling && <span className="ml-auto text-[10px] text-gray-400">guardando…</span>}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 ml-4 leading-tight">{description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
