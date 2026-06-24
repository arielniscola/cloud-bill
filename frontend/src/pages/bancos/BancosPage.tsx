import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit, Trash2, Landmark, Search, Power } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Modal, Input } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { bancosService } from '../../services';
import type { Banco } from '../../types';

const bancoSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  code: z.string().optional().nullable(),
  sucursal: z.string().optional().nullable(),
  isActive: z.boolean(),
});
type BancoFormData = z.infer<typeof bancoSchema>;

function BancoCard({ banco, onEdit, onDelete }: { banco: Banco; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      onClick={onEdit}
      className="group relative bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md rounded-xl p-4 cursor-pointer transition-all duration-150 select-none flex items-center gap-3"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-800 transition-all duration-150 group-hover:ring-2">
        <Landmark className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-400 truncate leading-tight transition-colors duration-150">
          {banco.name}
        </p>
        {(banco.code || banco.sucursal) && (
          <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">
            {[banco.code && `Código: ${banco.code}`, banco.sucursal && `Suc.: ${banco.sucursal}`].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className={`text-[11px] mt-0.5 leading-none font-medium ${banco.isActive ? 'text-emerald-600' : 'text-gray-400 dark:text-slate-500'}`}>
          {banco.isActive ? 'Activo' : 'Inactivo'}
        </p>
      </div>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Editar"
          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.92]">
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Eliminar"
          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150 active:scale-[0.92]">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-3 animate-pulse">
      <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded-xl flex-shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 w-28 bg-gray-100 dark:bg-slate-700 rounded mb-2" />
        <div className="h-2.5 w-16 bg-gray-100 dark:bg-slate-700 rounded" />
      </div>
    </div>
  );
}

function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
        checked ? 'bg-emerald-50/70 border-emerald-200' : 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
        checked ? 'bg-emerald-100 text-emerald-600' : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-400 dark:text-slate-500'
      }`}>
        <Power className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium leading-none ${checked ? 'text-emerald-800' : 'text-gray-600 dark:text-slate-300'}`}>
          Banco activo
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 leading-none">
          Solo los bancos activos aparecen en los desplegables.
        </p>
      </div>
      <div className={`relative flex-shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-600'}`} style={{ width: 36, height: 20 }}>
        <span className={`absolute top-[3px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-[17px]' : 'translate-x-[3px]'}`} />
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

type FilterTab = 'all' | 'active' | 'inactive';

export default function BancosPage() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Banco | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<BancoFormData>({
    resolver: zodResolver(bancoSchema),
    defaultValues: { isActive: true },
  });

  const isActiveVal = watch('isActive') ?? true;

  const fetchBancos = useCallback(async () => {
    setIsLoading(true);
    try {
      setBancos(await bancosService.getAll());
    } catch {
      toast.error('Error al cargar bancos');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, []);

  useEffect(() => { fetchBancos(); }, [fetchBancos]);

  const activeCount = useMemo(() => bancos.filter((b) => b.isActive).length, [bancos]);
  const inactiveCount = bancos.length - activeCount;

  const filtered = useMemo(() => {
    let base = bancos;
    if (activeTab === 'active') base = bancos.filter((b) => b.isActive);
    else if (activeTab === 'inactive') base = bancos.filter((b) => !b.isActive);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((b) => b.name.toLowerCase().includes(q) || (b.code ?? '').toLowerCase().includes(q) || (b.sucursal ?? '').toLowerCase().includes(q));
  }, [bancos, activeTab, search]);

  const openModal = (banco?: Banco) => {
    if (banco) {
      setEditing(banco);
      reset({ name: banco.name, code: banco.code, sucursal: banco.sucursal, isActive: banco.isActive });
    } else {
      setEditing(null);
      reset({ name: '', code: null, sucursal: null, isActive: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditing(null); reset(); };

  const onSubmit = async (data: BancoFormData) => {
    setIsSaving(true);
    try {
      if (editing) {
        await bancosService.update(editing.id, data);
        toast.success('Banco actualizado');
      } else {
        await bancosService.create(data);
        toast.success('Banco creado');
      }
      closeModal();
      fetchBancos();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar banco');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await bancosService.delete(deleteId);
      toast.success('Banco eliminado');
      setDeleteId(null);
      fetchBancos();
    } catch {
      toast.error('Error al eliminar banco');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',      label: 'Todos',     count: bancos.length },
    { id: 'active',   label: 'Activos',   count: activeCount },
    { id: 'inactive', label: 'Inactivos', count: inactiveCount },
  ];

  return (
    <div>
      <PageHeader
        title="Bancos"
        subtitle={isFirstLoad ? undefined : `${bancos.length} ${bancos.length === 1 ? 'banco' : 'bancos'} · ${activeCount} activos`}
        actions={
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo banco
          </Button>
        }
      />

      {!isFirstLoad && bancos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  activeTab === tab.id ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === tab.id ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300' : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar bancos..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150" />
          </div>
        </div>
      )}

      {isFirstLoad && isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
            <Landmark className="w-7 h-7 text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            {search ? 'Sin resultados' : activeTab !== 'all' ? 'Sin bancos en esta vista' : 'Sin bancos'}
          </p>
          <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mb-5">
            {search ? `No se encontraron bancos para "${search}".`
              : activeTab !== 'all' ? 'Probá con otro filtro o creá uno nuevo.'
              : 'Creá el catálogo de bancos para usarlos en cheques, pagos y cuentas.'}
          </p>
          {!search && activeTab === 'all' && (
            <Button onClick={() => openModal()}><Plus className="w-4 h-4 mr-2" /> Nuevo banco</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((banco) => (
            <BancoCard key={banco.id} banco={banco} onEdit={() => openModal(banco)} onDelete={() => setDeleteId(banco.id)} />
          ))}
          {activeTab === 'all' && !search && (
            <button onClick={() => openModal()}
              className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl py-4 px-4 text-gray-400 dark:text-slate-500 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-150 active:scale-[0.98]">
              <Plus className="w-4 h-4" />
              <span className="text-xs font-medium">Nuevo banco</span>
            </button>
          )}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? `Editar "${editing.name}"` : 'Nuevo banco'} size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nombre *" placeholder="Ej: Banco Nación, Galicia, Santander…" {...register('name')} error={errors.name?.message} autoFocus />
          <Input label="Código (opcional)" placeholder="Código de entidad" {...register('code')} />
          <Input label="Sucursal (opcional)" placeholder="Ej: Casa Central, Sucursal Centro…" {...register('sucursal')} />
          <ActiveToggle checked={isActiveVal} onChange={(v) => setValue('isActive', v)} />
          <div className="flex gap-2.5 pt-1">
            <Button type="submit" isLoading={isSaving}>{editing ? 'Guardar cambios' : 'Crear banco'}</Button>
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>Cancelar</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar banco"
        message="¿Eliminar este banco del catálogo? No afecta los registros que ya lo usan."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
