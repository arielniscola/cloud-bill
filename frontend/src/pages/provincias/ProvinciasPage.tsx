import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit, Trash2, MapPin, Search, RotateCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Modal, Input } from '../../components/ui';
import { PageHeader, ConfirmDialog, refreshProvincias } from '../../components/shared';
import { provinciasService } from '../../services';
import type { Provincia } from '../../types';

const provinciaSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  afipCode: z.string().regex(/^\d{0,2}$/, 'Número de 0 a 99').optional(),
  jurisdictionCode: z.string().max(10).optional(),
});
type ProvinciaFormData = z.infer<typeof provinciaSchema>;

type FilterTab = 'all' | 'active' | 'inactive';

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

export default function ProvinciasPage() {
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provincia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provincia | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProvinciaFormData>({
    resolver: zodResolver(provinciaSchema),
  });

  const fetchProvincias = useCallback(async () => {
    setIsLoading(true);
    try {
      setProvincias(await provinciasService.getAll());
      refreshProvincias();   // invalida el catálogo cacheado que usa ProvinciaSelect
    } catch {
      toast.error('Error al cargar provincias');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchProvincias(); }, [fetchProvincias]);

  const activeCount = useMemo(() => provincias.filter((p) => p.isActive).length, [provincias]);

  const filtered = useMemo(() => {
    let base = provincias;
    if (activeTab === 'active') base = provincias.filter((p) => p.isActive);
    else if (activeTab === 'inactive') base = provincias.filter((p) => !p.isActive);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      String(p.afipCode ?? '').includes(q) ||
      (p.jurisdictionCode ?? '').includes(q));
  }, [provincias, activeTab, search]);

  const openModal = (provincia?: Provincia) => {
    setEditing(provincia ?? null);
    reset({
      name: provincia?.name ?? '',
      afipCode: provincia?.afipCode != null ? String(provincia.afipCode) : '',
      jurisdictionCode: provincia?.jurisdictionCode ?? '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditing(null); };

  const onSubmit = async (data: ProvinciaFormData) => {
    const payload = {
      name: data.name,
      afipCode: data.afipCode ? Number(data.afipCode) : null,
      jurisdictionCode: data.jurisdictionCode?.trim() || null,
    };
    setIsSaving(true);
    try {
      if (editing) {
        await provinciasService.update(editing.id, payload);
        toast.success('Provincia actualizada');
      } else {
        await provinciasService.create(payload);
        toast.success('Provincia creada');
      }
      closeModal();
      fetchProvincias();
    } catch (error) {
      toast.error(errorMessage(error, 'Error al guardar la provincia'));
    } finally {
      setIsSaving(false);
    }
  };

  const reactivate = async (provincia: Provincia) => {
    try {
      await provinciasService.update(provincia.id, { isActive: true });
      toast.success(`${provincia.name} vuelve a aparecer en los desplegables`);
      fetchProvincias();
    } catch (error) {
      toast.error(errorMessage(error, 'Error al reactivar la provincia'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await provinciasService.delete(deleteTarget.id);
      toast.success('Provincia desactivada');
      setDeleteTarget(null);
      fetchProvincias();
    } catch {
      toast.error('Error al desactivar la provincia');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'active',   label: 'Activas',   count: activeCount },
    { id: 'inactive', label: 'Inactivas', count: provincias.length - activeCount },
    { id: 'all',      label: 'Todas',     count: provincias.length },
  ];

  return (
    <div>
      <PageHeader
        title="Provincias"
        subtitle={isLoading && provincias.length === 0 ? undefined : `${activeCount} activas · se usan en clientes y en las percepciones de IIBB`}
        actions={<Button onClick={() => openModal()}><Plus className="w-4 h-4 mr-2" /> Nueva provincia</Button>}
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

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o código…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-700">
              <th className="px-4 py-2.5 font-semibold">Provincia</th>
              <th className="px-4 py-2.5 font-semibold" title="Código de provincia del padrón de ARCA">Cód. ARCA</th>
              <th className="px-4 py-2.5 font-semibold" title="Código de jurisdicción del Convenio Multilateral">Jurisdicción CM</th>
              <th className="px-4 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && provincias.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-slate-700/50 animate-pulse">
                  <td className="px-4 py-3" colSpan={5}><div className="h-3.5 w-40 bg-gray-100 dark:bg-slate-700 rounded" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <MapPin className="w-7 h-7 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 dark:text-slate-500">
                    {search ? `Sin resultados para "${search}"` : 'No hay provincias en esta vista'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="group border-b border-gray-50 dark:border-slate-700/50 last:border-0 hover:bg-gray-50/70 dark:hover:bg-slate-700/40">
                  <td className={`px-4 py-2.5 font-medium ${p.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{p.afipCode ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{p.jurisdictionCode ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium ${p.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
                      {p.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-0.5">
                      <button onClick={() => openModal(p)} title="Editar"
                        className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {p.isActive ? (
                        <button onClick={() => setDeleteTarget(p)} title="Desactivar"
                          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => reactivate(p)} title="Reactivar"
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

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? `Editar "${editing.name}"` : 'Nueva provincia'} size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nombre *" placeholder="Ej: Córdoba" {...register('name')} error={errors.name?.message} autoFocus />
          <Input label="Código ARCA (opcional)" placeholder="Ej: 3" inputMode="numeric" {...register('afipCode')} error={errors.afipCode?.message} />
          <p className="-mt-2 text-xs text-gray-400 dark:text-slate-500">Con este código se completa la provincia al traer un cliente del padrón de ARCA.</p>
          <Input label="Jurisdicción Convenio Multilateral (opcional)" placeholder="Ej: 904" {...register('jurisdictionCode')} error={errors.jurisdictionCode?.message} />
          <div className="flex gap-2.5 pt-1">
            <Button type="submit" isLoading={isSaving}>{editing ? 'Guardar cambios' : 'Crear provincia'}</Button>
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>Cancelar</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Desactivar provincia"
        message={`¿Desactivar "${deleteTarget?.name ?? ''}"? Deja de aparecer en los desplegables; los clientes y comprobantes que ya la tienen no cambian.`}
        confirmText="Desactivar"
        isLoading={isDeleting}
      />
    </div>
  );
}
