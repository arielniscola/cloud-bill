import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { productsService, categoriesService } from '../../services';
import type { Category } from '../../types';

const productSchema = z.object({
  sku: z.string().min(1, 'El SKU es requerido'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  cost: z.coerce.number().min(0, 'El costo debe ser mayor o igual a 0'),
  price: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  taxRate: z.coerce.number().min(0).max(100).default(21),
  isActive: z.boolean(),
});

type ProductFormData = z.output<typeof productSchema>;

export default function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [categories, setCategories] = useState<Category[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      taxRate: 21,
      isActive: true,
    },
  });

  const categoryId = watch('categoryId') || '';

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoriesService.getAll();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (isEditing) {
      const fetchProduct = async () => {
        try {
          const product = await productsService.getById(id);
          setValue('sku', product.sku);
          setValue('name', product.name);
          setValue('description', product.description);
          setValue('categoryId', product.categoryId);
          setValue('cost', product.cost);
          setValue('price', product.price);
          setValue('taxRate', product.taxRate);
          setValue('isActive', product.isActive);
        } catch (error) {
          toast.error('Error al cargar producto');
          navigate('/products');
        } finally {
          setIsFetching(false);
        }
      };
      fetchProduct();
    }
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: ProductFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        categoryId: data.categoryId || null,
      };

      if (isEditing) {
        await productsService.update(id, payload);
        toast.success('Producto actualizado');
      } else {
        await productsService.create(payload);
        toast.success('Producto creado');
      }
      navigate('/products');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar producto');
    } finally {
      setIsLoading(false);
    }
  };

  // Opciones jerárquicas: raíces primero, luego sus hijos indentados
  const categoryOptions = (() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: 'Sin categoría' }];
    const roots = categories.filter((c) => !c.parentId);
    for (const root of roots) {
      opts.push({ value: root.id, label: root.name });
      for (const child of root.children ?? []) {
        opts.push({ value: child.id, label: `\u00A0\u00A0└ ${child.name}` });
      }
    }
    return opts;
  })();

  if (isFetching) {
    return <div className="p-6">Cargando...</div>;
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Producto' : 'Nuevo Producto'}
        backTo="/products"
      />

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="SKU *"
              {...register('sku')}
              error={errors.sku?.message}
            />
            <Input
              label="Nombre *"
              {...register('name')}
              error={errors.name?.message}
            />
          </div>

          <Select
            label="Categoría"
            options={categoryOptions}
            value={categoryId}
            onChange={(value) => setValue('categoryId', value || null)}
          />

          <Textarea
            label="Descripción"
            {...register('description')}
            error={errors.description?.message}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Costo *"
              type="number"
              step="0.01"
              {...register('cost')}
              error={errors.cost?.message}
            />
            <Input
              label="Precio *"
              type="number"
              step="0.01"
              {...register('price')}
              error={errors.price?.message}
            />
            <Input
              label="IVA (%)"
              type="number"
              step="0.01"
              {...register('taxRate')}
              error={errors.taxRate?.message}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Producto activo
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/products')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
