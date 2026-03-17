import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Building2, CheckCircle2, XCircle, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button } from '../../components/ui';
import { ConfirmDialog } from '../../components/shared';
import companiesService from '../../services/companies.service';
import type { Company } from '../../types/company.types';
import { formatDate } from '../../utils/formatters';

const MODULE_BADGES: Record<string, string> = {
  ventas:   'bg-blue-50 text-blue-700 border-blue-200',
  catalogo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  compras:  'bg-amber-50 text-amber-700 border-amber-200',
  finanzas: 'bg-purple-50 text-purple-700 border-purple-200',
};

function ModulesList({ modules }: { modules: string[] }) {
  if (modules.includes('ALL')) {
    return <span className="text-xs text-emerald-600 font-medium">Acceso completo</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {modules.map(m => (
        <span key={m} className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', MODULE_BADGES[m] ?? 'bg-gray-50 text-gray-600 border-gray-200')}>
          {m}
        </span>
      ))}
    </div>
  );
}

export default function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading]  = useState(true);
  const [deleteId, setDeleteId]    = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = async () => {
    try {
      const data = await companiesService.getAll();
      setCompanies(data);
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
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Empresas</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} registrada{companies.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => navigate('/companies/new')}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva empresa
        </Button>
      </div>

      {/* List */}
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
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {companies.map(company => (
              <div key={company.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/companies/${company.id}`}
                      className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                    >
                      {company.name}
                    </Link>
                    {company.isActive ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {company.cuit && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">CUIT {company.cuit}</span>
                    )}
                    <ModulesList modules={company.enabledModules} />
                  </div>
                </div>

                {/* Date */}
                <span className="hidden lg:block text-xs text-gray-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                  {formatDate(company.createdAt)}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link
                    to={`/companies/${company.id}/edit`}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => setDeleteId(company.id)}
                    disabled={company.id === '00000000-0000-0000-0000-000000000001'}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
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
