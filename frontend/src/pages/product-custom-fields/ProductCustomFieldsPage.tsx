import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit, Trash2, Sliders, Search, Power, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { productCustomFieldsService } from '../../services';
import {
  PRODUCT_CUSTOM_FIELD_TYPE_LABELS,
  type ProductCustomField,
  type ProductCustomFieldType,
} from '../../types/product-custom-field.types';

const TYPES: ProductCustomFieldType[] = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'];

const fieldSchema = z
  .object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
    key: z
      .string()
      .min(2, 'La clave debe tener al menos 2 caracteres')
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/, 'Solo minúsculas, números y guion bajo, comenzando con letra'),
    type: z.enum(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT']),
    options: z.string().optional().nullable(),
    isRequired: z.boolean(),
    order: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'SELECT') {
      const opts = (data.options ?? '').split(',').map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Ingresá al menos 2 opciones separadas por coma' });
      }
    }
  });

type FieldFormData = z.infer<typeof fieldSchema>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function FieldRow({
  field,
  onEdit,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: {
  field: ProductCustomField;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      onClick={onEdit}
      className="group bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm rounded-xl p-3.5 cursor-pointer transition-all duration-150 flex items-center gap-3"
    >
      <GripVertical className="w-4 h-4 text-gray-300 dark:text-slate-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{field.name}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold uppercase">
            {PRODUCT_CUSTOM_FIELD_TYPE_LABELS[field.type]}
          </span>
          {field.isRequired && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold uppercase">Requerido</span>
          )}
          {!field.isActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-bold uppercase">Inactivo</span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 font-mono truncate">{field.key}</p>
        {field.type === 'SELECT' && field.options && (
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">Opciones: {field.options}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onMove(-1); }}
          disabled={isFirst}
          title="Subir"
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove(1); }}
          disabled={isLast}
          title="Bajar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Editar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ProductCustomFieldsPage() {
  const [fields, setFields] = useState<ProductCustomField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCustomField | null>(null);
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
  } = useForm<FieldFormData>({
    resolver: zodResolver(fieldSchema),
    defaultValues: { type: 'TEXT', isRequired: false, isActive: true, order: 0, options: '' },
  });

  const watchType = watch('type');
  const watchName = watch('name');
  const watchKey = watch('key');
  const watchActive = watch('isActive');
  const watchRequired = watch('isRequired');
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!editing && !keyTouched && watchName) {
      setValue('key', slugify(watchName));
    }
  }, [watchName, keyTouched, editing, setValue]);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await productCustomFieldsService.getAll();
      setFields(data);
    } catch {
      toast.error('Error al cargar campos personalizados');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(
      (f) => f.name.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
    );
  }, [fields, search]);

  const openModal = (field?: ProductCustomField) => {
    if (field) {
      setEditing(field);
      setKeyTouched(true);
      reset({
        name: field.name,
        key: field.key,
        type: field.type,
        options: field.options ?? '',
        isRequired: field.isRequired,
        order: field.order,
        isActive: field.isActive,
      });
    } else {
      setEditing(null);
      setKeyTouched(false);
      reset({
        name: '',
        key: '',
        type: 'TEXT',
        options: '',
        isRequired: false,
        order: fields.length,
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setKeyTouched(false);
    reset();
  };

  const onSubmit = async (data: FieldFormData) => {
    setIsSaving(true);
    try {
      const payload = {
        ...data,
        options: data.type === 'SELECT' ? (data.options ?? '').trim() : null,
      };
      if (editing) {
        await productCustomFieldsService.update(editing.id, payload);
        toast.success('Campo actualizado');
      } else {
        await productCustomFieldsService.create(payload);
        toast.success('Campo creado');
      }
      closeModal();
      fetch();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar campo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await productCustomFieldsService.delete(deleteId);
      toast.success('Campo eliminado');
      setDeleteId(null);
      fetch();
    } catch {
      toast.error('Error al eliminar el campo');
    } finally {
      setIsDeleting(false);
    }
  };

  const moveField = async (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;

    const swapped = [...fields];
    [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
    const reordered = swapped.map((f, i) => ({ ...f, order: i }));
    setFields(reordered);

    try {
      await Promise.all(
        [reordered[idx], reordered[target]].map((f) =>
          productCustomFieldsService.update(f.id, { order: f.order }),
        ),
      );
    } catch {
      toast.error('Error al reordenar');
      fetch();
    }
  };

  const typeOptions = TYPES.map((t) => ({ value: t, label: PRODUCT_CUSTOM_FIELD_TYPE_LABELS[t] }));

  return (
    <div>
      <PageHeader
        title="Campos personalizados de productos"
        subtitle={`${fields.length} ${fields.length === 1 ? 'campo' : 'campos'} configurados`}
        actions={
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo campo
          </Button>
        }
      />

      {fields.length > 0 && (
        <div className="flex justify-end mb-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campos..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
            <Sliders className="w-7 h-7 text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            {search ? 'Sin resultados' : 'Sin campos personalizados'}
          </p>
          <p className="text-sm text-gray-400 dark:text-slate-500 max-w-sm leading-relaxed mb-5">
            {search
              ? `No hay campos que coincidan con "${search}".`
              : 'Definí campos extra (texto, número, fecha, lista) para parametrizar tus productos.'}
          </p>
          {!search && (
            <Button onClick={() => openModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Crear primer campo
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f, idx) => (
            <FieldRow
              key={f.id}
              field={f}
              onEdit={() => openModal(f)}
              onDelete={() => setDeleteId(f.id)}
              onMove={(dir) => moveField(f.id, dir)}
              isFirst={idx === 0}
              isLast={idx === filtered.length - 1}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editing ? `Editar "${editing.name}"` : 'Nuevo campo personalizado'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nombre *"
            placeholder='Ej: "Voltaje", "Color", "Garantía"'
            {...register('name')}
            error={errors.name?.message}
            autoFocus
          />

          <Input
            label="Clave técnica *"
            placeholder="ej: voltaje"
            {...register('key', { onChange: () => setKeyTouched(true) })}
            error={errors.key?.message}
            hint="Identificador interno (minúsculas, sin espacios). Se autogenera desde el nombre."
            value={watchKey ?? ''}
          />

          <Select
            label="Tipo de dato *"
            options={typeOptions}
            value={watchType}
            onChange={(v) => setValue('type', v as ProductCustomFieldType)}
            error={errors.type?.message}
          />

          {watchType === 'SELECT' && (
            <Input
              label="Opciones *"
              placeholder="Rojo, Azul, Verde"
              {...register('options')}
              error={errors.options?.message}
              hint="Separadas por coma. Mínimo 2 opciones."
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={watchRequired}
                onChange={(e) => setValue('isRequired', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">Requerido al crear producto</span>
            </label>

            <label className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={watchActive}
                onChange={(e) => setValue('isActive', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <Power className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-slate-300">Campo activo</span>
            </label>
          </div>

          <div className="flex gap-2.5 pt-1">
            <Button type="submit" isLoading={isSaving}>
              {editing ? 'Guardar cambios' : 'Crear campo'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar campo"
        message="¿Eliminar este campo? Se borrarán todos los valores asociados a productos."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
