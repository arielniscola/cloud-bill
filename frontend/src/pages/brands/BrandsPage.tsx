import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit, Trash2, Tag, Search, Power } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Modal, Input } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { brandsService } from '../../services';
import type { Brand } from '../../types';

// ── Schema ───────────────────────────────────────────────────────
const brandSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  isActive: z.boolean().default(true),
});
type BrandFormData = z.infer<typeof brandSchema>;

// ── Helpers ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700 ring-violet-200',
  'bg-blue-100 text-blue-700 ring-blue-200',
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-amber-100 text-amber-700 ring-amber-200',
  'bg-rose-100 text-rose-700 ring-rose-200',
  'bg-cyan-100 text-cyan-700 ring-cyan-200',
  'bg-orange-100 text-orange-700 ring-orange-200',
  'bg-pink-100 text-pink-700 ring-pink-200',
  'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'bg-teal-100 text-teal-700 ring-teal-200',
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Brand card ───────────────────────────────────────────────────
function BrandCard({
  brand,
  onEdit,
  onDelete,
}: {
  brand: Brand;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = avatarColor(brand.name);

  return (
    <div
      onClick={onEdit}
      className="group relative bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md rounded-xl p-4 cursor-pointer transition-all duration-150 select-none flex items-center gap-3"
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-bold ring-1 transition-all duration-150 group-hover:ring-2 ${color}`}
      >
        {brand.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 truncate leading-tight transition-colors duration-150">
          {brand.name}
        </p>
        <p className={`text-[11px] mt-0.5 leading-none font-medium ${brand.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
          {brand.isActive ? 'Activa' : 'Inactiva'}
        </p>
      </div>

      {/* Actions — appear on hover */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Editar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150 active:scale-[0.92]"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-[background-color,color] duration-150 active:scale-[0.92]"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
      <div className="w-10 h-10 bg-gray-100 rounded-xl flex-shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 w-24 bg-gray-100 rounded mb-2" />
        <div className="h-2.5 w-12 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

// ── Toggle row (inside modal) ────────────────────────────────────
function ModalToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
        checked
          ? 'bg-emerald-50/70 border-emerald-200'
          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
        checked ? 'bg-emerald-100 text-emerald-600' : 'bg-white border border-gray-200 text-gray-400'
      }`}>
        <Power className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium leading-none ${checked ? 'text-emerald-800' : 'text-gray-600'}`}>
          Marca activa
        </p>
        <p className="text-xs text-gray-400 mt-1 leading-none">
          Solo las marcas activas aparecen al cargar productos.
        </p>
      </div>
      {/* Pill */}
      <div
        className={`relative flex-shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`}
        style={{ width: 36, height: 20 }}
      >
        <span
          className={`absolute top-[3px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[17px]' : 'translate-x-[3px]'
          }`}
        />
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}

// ── Filter tabs ──────────────────────────────────────────────────
type FilterTab = 'all' | 'active' | 'inactive';

// ── Main component ───────────────────────────────────────────────
export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: { isActive: true },
  });

  const isActiveVal = watch('isActive');

  // ── Data ─────────────────────────────────────────────────────
  const fetchBrands = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await brandsService.getAll();
      setBrands(data);
    } catch {
      toast.error('Error al cargar marcas');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  // ── Computed ─────────────────────────────────────────────────
  const activeCount = useMemo(() => brands.filter((b) => b.isActive).length, [brands]);
  const inactiveCount = brands.length - activeCount;

  const filtered = useMemo(() => {
    let base = brands;
    if (activeTab === 'active') base = brands.filter((b) => b.isActive);
    else if (activeTab === 'inactive') base = brands.filter((b) => !b.isActive);

    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, activeTab, search]);

  // ── Modal helpers ─────────────────────────────────────────────
  const openModal = (brand?: Brand) => {
    if (brand) {
      setEditingBrand(brand);
      reset({ name: brand.name, isActive: brand.isActive });
    } else {
      setEditingBrand(null);
      reset({ name: '', isActive: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBrand(null);
    reset();
  };

  const onSubmit = async (data: BrandFormData) => {
    setIsSaving(true);
    try {
      if (editingBrand) {
        await brandsService.update(editingBrand.id, data);
        toast.success('Marca actualizada');
      } else {
        await brandsService.create(data);
        toast.success('Marca creada');
      }
      closeModal();
      fetchBrands();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar marca');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await brandsService.delete(deleteId);
      toast.success('Marca eliminada');
      setDeleteId(null);
      fetchBrands();
    } catch {
      toast.error('Error al eliminar marca. Verificá que no tenga productos asociados.');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: brands.length },
    { id: 'active', label: 'Activas', count: activeCount },
    { id: 'inactive', label: 'Inactivas', count: inactiveCount },
  ];

  return (
    <div>
      <PageHeader
        title="Marcas"
        subtitle={
          isFirstLoad
            ? undefined
            : `${brands.length} ${brands.length === 1 ? 'marca' : 'marcas'} · ${activeCount} activas`
        }
        actions={
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva marca
          </Button>
        }
      />

      {/* Toolbar */}
      {!isFirstLoad && brands.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === tab.id ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar marcas..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
            />
          </div>
        </div>
      )}

      {/* Content */}
      {isFirstLoad && isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Tag className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">
            {search ? 'Sin resultados' : activeTab !== 'all' ? 'Sin marcas en esta categoría' : 'Sin marcas'}
          </p>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-5">
            {search
              ? `No se encontraron marcas para "${search}".`
              : activeTab !== 'all'
              ? 'Probá con otro filtro o creá una nueva marca.'
              : 'Creá tu primera marca para organizarla con los productos.'}
          </p>
          {!search && activeTab === 'all' && (
            <Button onClick={() => openModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva marca
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              onEdit={() => openModal(brand)}
              onDelete={() => setDeleteId(brand.id)}
            />
          ))}
          {/* Add tile */}
          {activeTab === 'all' && !search && (
            <button
              onClick={() => openModal()}
              className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 px-4 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-150 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-medium">Nueva marca</span>
            </button>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingBrand ? `Editar "${editingBrand.name}"` : 'Nueva marca'}
        size="sm"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nombre *"
            placeholder="Ej: Samsung, Nike, Arcor…"
            {...register('name')}
            error={errors.name?.message}
            autoFocus
          />

          <ModalToggle
            checked={isActiveVal}
            onChange={(v) => setValue('isActive', v)}
          />

          <div className="flex gap-2.5 pt-1">
            <Button type="submit" isLoading={isSaving}>
              {editingBrand ? 'Guardar cambios' : 'Crear marca'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar marca"
        message={`¿Eliminar esta marca? Los productos asociados quedarán sin marca asignada.`}
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
