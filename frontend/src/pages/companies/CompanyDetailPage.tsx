import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, CheckCircle2, XCircle, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button } from '../../components/ui';
import companiesService from '../../services/companies.service';
import type { Company } from '../../types/company.types';
import { ALL_MODULE_KEYS, MODULE_LABELS } from '../../types/company.types';
import { formatDate } from '../../utils/formatters';

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
  const [modules, setModules]   = useState<string[]>(['ALL']);
  const [allEnabled, setAllEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    companiesService.getById(id)
      .then(c => {
        setCompany(c);
        const isAll = c.enabledModules.includes('ALL');
        setAllEnabled(isAll);
        setModules(isAll ? [...ALL_MODULE_KEYS] : c.enabledModules.filter(m => ALL_MODULE_KEYS.includes(m as any)));
      })
      .catch(() => toast.error('Error al cargar empresa'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const toggleModule = (key: string) => {
    setModules(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
  };

  const handleSaveModules = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const payload = allEnabled ? ['ALL'] : modules.length === ALL_MODULE_KEYS.length ? ['ALL'] : modules;
      const updated = await companiesService.updateModules(id, payload.length === 0 ? [ALL_MODULE_KEYS[0]] : payload);
      setCompany(updated);
      toast.success('Módulos actualizados');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al guardar módulos');
    } finally {
      setIsSaving(false);
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

      {/* Modules card */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Módulos habilitados</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Controlá a qué secciones tienen acceso los usuarios de esta empresa
            </p>
          </div>
          <Button size="sm" onClick={handleSaveModules} isLoading={isSaving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Guardar
          </Button>
        </div>

        <div className="p-5 space-y-3">
          {/* All access toggle */}
          <label className="flex items-center justify-between p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
            <div>
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">Acceso completo</p>
              <p className="text-xs text-indigo-500 dark:text-indigo-500 mt-0.5">Habilita todos los módulos presentes y futuros</p>
            </div>
            <input
              type="checkbox"
              checked={allEnabled}
              onChange={e => {
                setAllEnabled(e.target.checked);
                if (e.target.checked) setModules([...ALL_MODULE_KEYS]);
              }}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <div className={clsx('space-y-2 transition-opacity', allEnabled && 'opacity-40 pointer-events-none')}>
            {ALL_MODULE_KEYS.map(key => {
              const { label, description } = MODULE_LABELS[key];
              const enabled = modules.includes(key);
              return (
                <label
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-slate-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{label}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{description}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleModule(key)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
