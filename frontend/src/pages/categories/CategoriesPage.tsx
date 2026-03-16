import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Edit, Trash2, FolderTree, Search,
  FolderOpen, Folder, Layers, ChevronRight,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { categoriesService } from '../../services';
import type { Category } from '../../types';

const categorySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  parentId: z.string().optional().nullable(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

// ── Subcategory card ─────────────────────────────────────────────
function SubcategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative bg-gray-50 dark:bg-slate-700/50 hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-500 rounded-xl p-4 transition-all duration-150 cursor-default select-none">
      <div className="flex items-start gap-2.5 pr-5 min-w-0">
        <FolderTree className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors duration-150" />
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200 group-hover:text-gray-900 dark:group-hover:text-white leading-snug break-words min-w-0">
          {category.name}
        </span>
      </div>
      {/* Actions — appear on hover */}
      <div className="absolute top-2.5 right-2.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={onEdit}
          title="Editar"
          className="p-1 rounded-md text-gray-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.95]"
        >
          <Edit className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          title="Eliminar"
          className="p-1 rounded-md text-gray-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150 active:scale-[0.95]"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Left panel skeleton ──────────────────────────────────────────
function LeftSkeleton() {
  return (
    <div className="p-2 space-y-1 animate-pulse">
      {[80, 60, 90, 70, 50].map((w, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="w-4 h-4 bg-gray-100 dark:bg-slate-700 rounded flex-shrink-0" />
          <div className={`h-3.5 bg-gray-100 dark:bg-slate-700 rounded flex-1`} style={{ maxWidth: `${w}%` }} />
          <div className="w-5 h-3.5 bg-gray-100 dark:bg-slate-700 rounded-full flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
  });

  const parentIdValue = watch('parentId') || '';

  // ── Data fetching ────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await categoriesService.getAll();
      setCategories(data);
    } catch {
      toast.error('Error al cargar categorías');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // ── Computed ─────────────────────────────────────────────────
  const rootCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories]
  );

  const filteredRoots = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rootCategories;
    return rootCategories.filter(
      (root) =>
        root.name.toLowerCase().includes(q) ||
        root.children?.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [rootCategories, search]);

  const selectedRoot = useMemo(
    () => filteredRoots.find((c) => c.id === selectedRootId) ?? null,
    [filteredRoots, selectedRootId]
  );

  const subcategories = useMemo(
    () => selectedRoot?.children ?? [],
    [selectedRoot]
  );

  const totalSub = useMemo(
    () => rootCategories.reduce((s, r) => s + (r.children?.length ?? 0), 0),
    [rootCategories]
  );

  // Auto-select first root when list loads for the first time
  useEffect(() => {
    if (!isFirstLoad && rootCategories.length > 0 && !selectedRootId) {
      setSelectedRootId(rootCategories[0].id);
    }
  }, [isFirstLoad, rootCategories, selectedRootId]);

  // Deselect if the selected root is filtered out by search
  useEffect(() => {
    if (selectedRootId && !filteredRoots.find((c) => c.id === selectedRootId)) {
      setSelectedRootId(filteredRoots[0]?.id ?? null);
    }
  }, [filteredRoots, selectedRootId]);

  // ── Modal helpers ────────────────────────────────────────────
  const openModal = (category?: Category, presetParentId?: string | null) => {
    if (category) {
      setEditingCategory(category);
      reset({ name: category.name, parentId: category.parentId ?? '' });
    } else {
      setEditingCategory(null);
      reset({
        name: '',
        parentId: presetParentId !== undefined ? (presetParentId ?? '') : '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    reset();
  };

  const onSubmit = async (data: CategoryFormData) => {
    setIsSaving(true);
    try {
      const payload = { name: data.name, parentId: data.parentId || null };
      if (editingCategory) {
        await categoriesService.update(editingCategory.id, payload);
        toast.success('Categoría actualizada');
      } else {
        const created = await categoriesService.create(payload);
        toast.success('Categoría creada');
        // Auto-select newly created root
        if (!payload.parentId) setSelectedRootId(created.id);
      }
      closeModal();
      fetchCategories();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar categoría');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await categoriesService.delete(deleteId);
      toast.success('Categoría eliminada');
      if (deleteId === selectedRootId) setSelectedRootId(null);
      setDeleteId(null);
      fetchCategories();
    } catch {
      toast.error('Error al eliminar categoría. Verificá que no tenga productos asociados.');
    } finally {
      setIsDeleting(false);
    }
  };

  const parentOptions = [
    { value: '', label: 'Sin categoría padre (raíz)' },
    ...rootCategories
      .filter((cat) => cat.id !== editingCategory?.id)
      .map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  const modalTitle = editingCategory
    ? `Editar "${editingCategory.name}"`
    : parentIdValue
    ? 'Nueva subcategoría'
    : 'Nueva categoría raíz';

  return (
    <div>
      <PageHeader
        title="Categorías"
        subtitle={
          isFirstLoad
            ? undefined
            : `${rootCategories.length} ${rootCategories.length === 1 ? 'categoría raíz' : 'categorías raíz'} · ${totalSub} subcategorías`
        }
        actions={
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva categoría
          </Button>
        }
      />

      {/* ── Two-panel card ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden flex min-h-[560px]">

        {/* ── Left: root category list ── */}
        <div className="w-56 xl:w-64 flex-shrink-0 border-r border-gray-100 dark:border-slate-700 flex flex-col">

          {/* Search */}
          <div className="p-3 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 dark:placeholder-slate-500 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
              />
            </div>
          </div>

          {/* Root list */}
          <div className="flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
            {isFirstLoad && isLoading ? (
              <LeftSkeleton />
            ) : filteredRoots.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {search ? 'Sin resultados' : 'Sin categorías aún'}
                </p>
              </div>
            ) : (
              filteredRoots.map((root) => {
                const isSelected = selectedRootId === root.id;
                const count = root.children?.length ?? 0;
                return (
                  <button
                    key={root.id}
                    onClick={() => setSelectedRootId(root.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-[background-color,color] duration-150 active:scale-[0.99] group ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                        : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {isSelected
                      ? <FolderOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      : <Folder className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0 group-hover:text-gray-500 transition-colors duration-150" />
                    }
                    <span className="text-sm font-medium flex-1 truncate leading-none">
                      {root.name}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none flex-shrink-0 ${
                      isSelected
                        ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Add root button */}
          <div className="p-3 border-t border-gray-100 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.98] w-full"
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              Nueva raíz
            </button>
          </div>
        </div>

        {/* ── Right: detail panel ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedRoot ? (
            /* Nothing selected */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
                <FolderTree className="w-5 h-5 text-gray-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-1">
                {rootCategories.length === 0
                  ? 'Sin categorías'
                  : 'Seleccioná una categoría'}
              </p>
              <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed">
                {rootCategories.length === 0
                  ? 'Creá categorías raíz para organizar el catálogo de productos.'
                  : 'Hacé clic en una categoría para ver y gestionar sus subcategorías.'}
              </p>
              {rootCategories.length === 0 && (
                <Button className="mt-5" onClick={() => openModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear primera categoría
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Selected root header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-4 flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate leading-tight">
                    {selectedRoot.name}
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-none">
                    {subcategories.length === 0
                      ? 'Sin subcategorías'
                      : `${subcategories.length} subcategor${subcategories.length === 1 ? 'ía' : 'ías'}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openModal(selectedRoot)}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-[background-color,color] duration-150 active:scale-[0.98]"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>
                  <button
                    onClick={() => openModal(undefined, selectedRoot.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.98]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Subcategoría</span>
                  </button>
                  <button
                    onClick={() => setDeleteId(selectedRoot.id)}
                    title="Eliminar categoría"
                    className="p-1.5 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150 active:scale-[0.98]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Subcategories grid */}
              <div className="flex-1 p-6 overflow-y-auto [scrollbar-width:thin]">
                {subcategories.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
                      <Layers className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Sin subcategorías</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mb-4 max-w-xs leading-relaxed">
                      Agregá subcategorías para clasificar los productos dentro de{' '}
                      <span className="font-medium text-gray-600 dark:text-slate-300">{selectedRoot.name}</span>.
                    </p>
                    <button
                      onClick={() => openModal(undefined, selectedRoot.id)}
                      className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar primera subcategoría
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {subcategories.map((sub) => (
                      <SubcategoryCard
                        key={sub.id}
                        category={sub}
                        onEdit={() => openModal(sub)}
                        onDelete={() => setDeleteId(sub.id)}
                      />
                    ))}
                    {/* Dashed "add" tile */}
                    <button
                      onClick={() => openModal(undefined, selectedRoot.id)}
                      className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl py-5 px-3 text-gray-400 dark:text-slate-500 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-150 active:scale-[0.97]"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-xs font-medium">Nueva</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal form ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalTitle}
        size="sm"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nombre *"
            {...register('name')}
            error={errors.name?.message}
            autoFocus
          />

          <Select
            label="Categoría padre"
            options={parentOptions}
            value={parentIdValue}
            onChange={(value) => setValue('parentId', value || null)}
          />

          {parentIdValue && (
            <div className="flex items-start gap-2 text-xs text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-lg px-3 py-2.5">
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Se creará como subcategoría de{' '}
                <strong>
                  {rootCategories.find((c) => c.id === parentIdValue)?.name ?? parentIdValue}
                </strong>.
              </span>
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <Button type="submit" isLoading={isSaving}>
              {editingCategory ? 'Guardar cambios' : 'Crear'}
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
        title="Eliminar categoría"
        message={
          deleteId === selectedRootId
            ? `¿Eliminar "${selectedRoot?.name}"? Todas sus subcategorías también serán eliminadas y los productos asociados quedarán sin categoría.`
            : '¿Eliminar esta subcategoría? Los productos asociados quedarán sin categoría.'
        }
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
