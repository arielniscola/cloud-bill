import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Building2, Pencil, Trash2, Crown, Search, X, Users, FileText, LogIn, SlidersHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Select } from '../../components/ui';
import { ConfirmDialog } from '../../components/shared';
import companiesService from '../../services/companies.service';
import type { Company, ModuleKey } from '../../types/company.types';
import { MODULE_LABELS } from '../../types/company.types';
import { useCompanyStore } from '../../stores/company.store';
import { formatDate } from '../../utils/formatters';
import { PLAN_LABELS, PLAN_COLORS, PLAN_NAMES, type PlanName } from '../../utils/planFeatures';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_OPTIONS = [
  { value: 'all',      label: 'Todos los estados' },
  { value: 'active',   label: 'Solo activas' },
  { value: 'inactive', label: 'Solo inactivas' },
];

const PLAN_OPTIONS = [
  { value: 'all', label: 'Todos los planes' },
  ...PLAN_NAMES.map((p) => ({ value: p, label: PLAN_LABELS[p] })),
];

/** Resume los módulos habilitados en una línea legible. */
function modulesSummary(enabledModules: string[]): string {
  if (!enabledModules || enabledModules.length === 0) return 'Sin módulos';
  if (enabledModules.includes('ALL')) return 'Todos los módulos';
  const labels = enabledModules.map((m) => MODULE_LABELS[m as ModuleKey]?.label ?? m);
  if (labels.length <= 3) return labels.join(' · ');
  return `${labels.slice(0, 3).join(' · ')} +${labels.length - 3}`;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3">
      <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">{value}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">{label}</p>
    </div>
  );
}

export default function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading]  = useState(true);
  const [deleteId, setDeleteId]    = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [query, setQuery]  = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [plan, setPlan]     = useState<string>('all');
  const { setCompanies: storeSetCompanies, setActiveCompany } = useCompanyStore();

  const load = async () => {
    try {
      const data = await companiesService.getAll();
      setCompanies(data);
      storeSetCompanies(data);
    } catch {
      toast.error('Error al cargar empresas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await companiesService.delete(deleteId);
      toast.success('Empresa eliminada');
      setDeleteId(null);
      load();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEnter = (company: Company) => {
    setActiveCompany(company.id);
    toast.success(`Trabajando en ${company.name}`);
    navigate('/');
  };

  const stats = useMemo(() => ({
    total:    companies.length,
    active:   companies.filter((c) => c.isActive).length,
    users:    companies.reduce((sum, c) => sum + (c.usersCount ?? 0), 0),
    invoices: companies.reduce((sum, c) => sum + (c.invoicesThisMonth ?? 0), 0),
  }), [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (status === 'active' && !c.isActive) return false;
      if (status === 'inactive' && c.isActive) return false;
      if (plan !== 'all' && c.plan !== plan) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.cuit ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [companies, query, status, plan]);

  const isFiltering = query.trim() !== '' || status !== 'all' || plan !== 'all';

  const clearFilters = () => { setQuery(''); setStatus('all'); setPlan('all'); };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Empresas</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Todas las empresas de la plataforma
          </p>
        </div>
        <Button onClick={() => navigate('/companies/new')} className="flex-shrink-0">
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva empresa
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Empresas" value={stats.total} />
        <StatTile label="Activas" value={stats.active} />
        <StatTile label="Usuarios activos" value={stats.users} />
        <StatTile label="Facturas del mes" value={stats.invoices} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, CUIT o email…"
            className="block w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 shadow-sm text-sm py-2 pl-9 pr-9 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select
          className="sm:w-44 flex-shrink-0"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
        <Select
          className="sm:w-44 flex-shrink-0"
          options={PLAN_OPTIONS}
          value={plan}
          onChange={setPlan}
        />
      </div>

      {/* Listado */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-40" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="w-12 h-12 text-gray-300 dark:text-slate-600 mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">No hay empresas registradas</p>
            <Button className="mt-4" onClick={() => navigate('/companies/new')}>Crear primera empresa</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <SlidersHorizontal className="w-10 h-10 text-gray-300 dark:text-slate-600 mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              Ninguna empresa coincide con los filtros
            </p>
            <Button variant="secondary" className="mt-4" onClick={clearFilters}>Limpiar filtros</Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {filtered.map(company => {
              const planKey = company.plan as PlanName;
              const planColors = PLAN_COLORS[planKey];
              const isDefault = company.id === DEFAULT_COMPANY_ID;

              return (
                <div
                  key={company.id}
                  className={clsx(
                    'flex items-center gap-4 px-5 py-3.5 transition-colors',
                    'hover:bg-gray-50/50 dark:hover:bg-slate-700/30',
                    !company.isActive && 'bg-gray-50/40 dark:bg-slate-900/20'
                  )}
                >
                  {/* Logo */}
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden',
                      company.logoUrl
                        ? 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600'
                        : 'bg-indigo-100 dark:bg-indigo-900/30',
                      !company.isActive && 'opacity-50 grayscale'
                    )}
                  >
                    {company.logoUrl ? (
                      <img src={company.logoUrl} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/companies/${company.id}`}
                        className={clsx(
                          'text-sm font-semibold truncate transition-colors',
                          company.isActive
                            ? 'text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400'
                            : 'text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                        )}
                      >
                        {company.name}
                      </Link>
                      <span className={clsx(
                        'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
                        planColors?.bg, planColors?.text, planColors?.border
                      )}>
                        <Crown className="w-2.5 h-2.5" />
                        {PLAN_LABELS[planKey] ?? company.plan}
                      </span>
                      {!company.isActive && (
                        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 dark:text-slate-500">
                      {company.cuit && (
                        <>
                          <span className="tabular-nums">CUIT {company.cuit}</span>
                          <span className="text-gray-200 dark:text-slate-700">·</span>
                        </>
                      )}
                      <span className="truncate">{modulesSummary(company.enabledModules)}</span>
                    </div>
                  </div>

                  {/* Métricas */}
                  <div className="hidden md:flex items-center gap-5 flex-shrink-0">
                    <div className="flex items-center gap-1.5" title="Usuarios activos">
                      <Users className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
                      <span className="text-xs text-gray-600 dark:text-slate-300 tabular-nums">
                        {company.usersCount ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5" title="Facturas emitidas este mes">
                      <FileText className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
                      <span className="text-xs text-gray-600 dark:text-slate-300 tabular-nums">
                        {company.invoicesThisMonth ?? '—'}
                      </span>
                    </div>
                  </div>

                  {/* Alta */}
                  <span className="hidden xl:block text-xs text-gray-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                    {formatDate(company.createdAt)}
                  </span>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEnter(company)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                      title={`Trabajar en ${company.name}`}
                    >
                      <LogIn className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      to={`/companies/${company.id}/edit`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => setDeleteId(company.id)}
                      disabled={isDefault}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isDefault ? 'La empresa principal no se puede eliminar' : 'Eliminar'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && isFiltering && filtered.length > 0 && (
          <div className="px-5 py-2.5 bg-gray-50/60 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {filtered.length} de {companies.length} empresas
            </span>
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar empresa"
        message="¿Estás seguro? Se eliminarán todos los datos asociados a esta empresa."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />

    </div>
  );
}
