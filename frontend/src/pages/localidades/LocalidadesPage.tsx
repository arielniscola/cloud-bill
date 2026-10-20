import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit, Trash2, MapPinned, Search, RotateCcw, Download } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Modal, Input } from '../../components/ui';
import { PageHeader, ConfirmDialog, refreshLocalidades, useProvincias } from '../../components/shared';
import { normalizeProvincia } from '../../components/shared/provinciasCatalog';
import { localidadesService } from '../../services';
import type { Localidad } from '../../types';

const localidadSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  provinciaId: z.string().optional(),
  postalCode: z.string().trim().max(10, 'Máximo 10 caracteres').optional(),
});
type LocalidadFormData = z.infer<typeof localidadSchema>;

type FilterTab = 'all' | 'active' | 'inactive';

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const selectCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';

export default function LocalidadesPage() {
  const provincias = useProvincias();
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [provFilter, setProvFilter] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Localidad | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Localidad | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LocalidadFormData>({
    resolver: zodResolver(localidadSchema),
  });

  const fetchLocalidades = useCallback(async () => {
    setIsLoading(true);
    try {
      setLocalidades(await localidadesService.getAll());
      refreshLocalidades();   // invalida el catálogo cacheado que usa LocalidadSelect
    } catch {
      toast.error('Error al cargar localidades');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLocalidades(); }, [fetchLocalidades]);

  const activeCount = useMemo(() => localidades.filter((l) => l.isActive).length, [localidades]);

  const filtered = useMemo(() => {
    let base = localidades;
    if (activeTab === 'active') base = base.filter((l) => l.isActive);
    else if (activeTab === 'inactive') base = base.filter((l) => !l.isActive);
    if (provFilter === '__none') base = base.filter((l) => !l.provinciaId);
    else if (provFilter) base = base.filter((l) => l.provinciaId === provFilter);
    const q = normalizeProvincia(search);
    if (!q) return base;
    return base.filter((l) => normalizeProvincia(l.name).includes(q) || (l.postalCode ?? '').includes(search.trim()));
  }, [localidades, activeTab, provFilter, search]);

  const openModal = (localidad?: Localidad) => {
    setEditing(localidad ?? null);
    reset({
      name: localidad?.name ?? '',
      provinciaId: localidad?.provinciaId ?? (provFilter && provFilter !== '__none' ? provFilter : ''),
      postalCode: localidad?.postalCode ?? '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditing(null); };

  const onSubmit = async (data: LocalidadFormData) => {
    const payload = {
      name: data.name,
      provinciaId: data.provinciaId || null,
      postalCode: data.postalCode?.trim() || null,
    };
    setIsSaving(true);
    try {
      if (editing) {
        await localidadesService.update(editing.id, payload);
        toast.success('Localidad actualizada');
      } else {
        await localidadesService.create(payload);
        toast.success('Localidad creada');
      }
      closeModal();
      fetchLocalidades();
    } catch (error) {
      toast.error(errorMessage(error, 'Error al guardar la localidad'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const { created } = await localidadesService.importFromParties();
      toast.success(created > 0
        ? `${created} localidad${created === 1 ? '' : 'es'} importada${created === 1 ? '' : 's'}`
        : 'No hay localidades nuevas para importar');
      if (created > 0) fetchLocalidades();
    } catch (error) {
      toast.error(errorMessage(error, 'Error al importar localidades'));
    } finally {
      setIsImporting(false);
    }
  };

  const reactivate = async (localidad: Localidad) => {
    try {
      await localidadesService.update(localidad.id, { isActive: true });
      toast.success(`${localidad.name} vuelve a aparecer en los desplegables`);
      fetchLocalidades();
    } catch (error) {
      toast.error(errorMessage(error, 'Error al reactivar la localidad'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await localidadesService.delete(deleteTarget.id);
      toast.success('Localidad desactivada');
      setDeleteTarget(null);
      fetchLocalidades();
    } catch {
      toast.error('Error al desactivar la localidad');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'active',   label: 'Activas',   count: activeCount },
    { id: 'inactive', label: 'Inactivas', count: localidades.length - activeCount },
    { id: 'all',      label: 'Todas',     count: localidades.length },
  ];

  return (
    <div>
      <PageHeader
        title="Localidades"
        subtitle={isLoading && localidades.length === 0 ? undefined : `${activeCount} activas · se usan en clientes y proveedores`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleImport} isLoading={isImporting} title="Crea las localidades que ya están cargadas en clientes y proveedores">
              <Download className="w-4 h-4 mr-2" /> Importar de clientes
            </Button>
            <Button onClick={() => openModal()}><Plus className="w-4 h-4 mr-2" /> Nueva localidad</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                activeTab === tab.id ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}>
              {tab.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-300">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select value={provFilter} onChange={(e) => setProvFilter(e.target.value)} className={`${selectCls} sm:w-48`}>
            <option value="">Todas las provincias</option>
            <option value="__none">Sin provincia</option>
            {provincias.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o C.P.…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-700">
              <th className="px-4 py-2.5 font-semibold">Localidad</th>
              <th className="px-4 py-2.5 font-semibold">Provincia</th>
              <th className="px-4 py-2.5 font-semibold">C.P.</th>
              <th className="px-4 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && localidades.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-slate-700/50 animate-pulse">
                  <td className="px-4 py-3" colSpan={5}><div className="h-3.5 w-40 bg-gray-100 dark:bg-slate-700 rounded" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <MapPinned className="w-7 h-7 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 dark:text-slate-500">
                    {search
                      ? `Sin resultados para "${search}"`
                      : localidades.length === 0
                        ? 'Todavía no hay localidades. Creá una o importá las que ya usan tus clientes.'
                        : 'No hay localidades en esta vista'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.id} className="group border-b border-gray-50 dark:border-slate-700/50 last:border-0 hover:bg-gray-50/70 dark:hover:bg-slate-700/40">
                  <td className={`px-4 py-2.5 font-medium ${l.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>{l.name}</td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-slate-300">{l.provinciaName ?? <span className="text-gray-300 dark:text-slate-600">—</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{l.postalCode ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium ${l.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
                      {l.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-0.5">
                      <button onClick={() => openModal(l)} title="Editar"
                        className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {l.isActive ? (
                        <button onClick={() => setDeleteTarget(l)} title="Desactivar"
                          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => reactivate(l)} title="Reactivar"
                          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? `Editar "${editing.name}"` : 'Nueva localidad'} size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nombre *" placeholder="Ej: Villa María" {...register('name')} error={errors.name?.message} autoFocus />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Provincia</label>
            <select {...register('provinciaId')} className={selectCls}>
              <option value="">Sin provincia</option>
              {provincias.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <Input label="Código postal (opcional)" placeholder="Ej: 5900" {...register('postalCode')} error={errors.postalCode?.message} />
          <p className="-mt-2 text-xs text-gray-400 dark:text-slate-500">Al elegir la localidad en un cliente se completan su provincia y su código postal.</p>
          <div className="flex gap-2.5 pt-1">
            <Button type="submit" isLoading={isSaving}>{editing ? 'Guardar cambios' : 'Crear localidad'}</Button>
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>Cancelar</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Desactivar localidad"
        message={`¿Desactivar "${deleteTarget?.name ?? ''}"? Deja de aparecer en los desplegables; los clientes y proveedores que ya la tienen no cambian.`}
        confirmText="Desactivar"
        isLoading={isDeleting}
      />
    </div>
  );
}
