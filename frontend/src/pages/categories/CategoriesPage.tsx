import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, FolderTree } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Card, Modal, Input, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { categoriesService } from '../../services';
import type { Category } from '../../types';

const categorySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  parentId: z.string().optional().nullable(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const parentId = watch('parentId') || '';

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const data = await categoriesService.getAll();
      setCategories(data);
    } catch (error) {
      toast.error('Error al cargar categorías');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setValue('name', category.name);
      setValue('parentId', category.parentId);
    } else {
      setEditingCategory(null);
      reset({ name: '', parentId: null });
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
      const payload = {
        ...data,
        parentId: data.parentId || null,
      };

      if (editingCategory) {
        await categoriesService.update(editingCategory.id, payload);
        toast.success('Categoría actualizada');
      } else {
        await categoriesService.create(payload);
        toast.success('Categoría creada');
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
      setDeleteId(null);
      fetchCategories();
    } catch (error) {
      toast.error('Error al eliminar categoría');
    } finally {
      setIsDeleting(false);
    }
  };

  const parentOptions = [
    { value: '', label: 'Sin categoría padre' },
    ...categories
      .filter((cat) => cat.id !== editingCategory?.id)
      .map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  const renderCategory = (category: Category, level = 0) => (
    <div key={category.id}>
      <div
        className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 border-b border-gray-100"
        style={{ paddingLeft: `${16 + level * 24}px` }}
      >
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-900">
            {category.name}
          </span>
          {category.parent && (
            <span className="text-xs text-gray-500">
              (en {category.parent.name})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => openModal(category)}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(category.id)}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
      {category.children?.map((child) => renderCategory(child, level + 1))}
    </div>
  );

  // Group categories by parent
  const rootCategories = categories.filter((cat) => !cat.parentId);

  return (
    <div>
      <PageHeader
        title="Categorías"
        subtitle={`${categories.length} categorías registradas`}
        actions={
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Categoría
          </Button>
        }
      />

      <Card padding="none">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay categorías registradas
          </div>
        ) : (
          <div>{rootCategories.map((cat) => renderCategory(cat))}</div>
        )}
      </Card>

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nombre *"
            {...register('name')}
            error={errors.name?.message}
          />

          <Select
            label="Categoría padre"
            options={parentOptions}
            value={parentId}
            onChange={(value) => setValue('parentId', value || null)}
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isSaving}>
              {editingCategory ? 'Guardar' : 'Crear'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar categoría"
        message="¿Estás seguro de que deseas eliminar esta categoría? Los productos asociados quedarán sin categoría."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
