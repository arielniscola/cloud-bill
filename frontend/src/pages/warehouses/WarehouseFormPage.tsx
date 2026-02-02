import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Input, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { warehousesService } from '../../services';

const warehouseSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  address: z.string().optional().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

type WarehouseFormData = z.infer<typeof warehouseSchema>;

export default function WarehouseFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      isDefault: false,
      isActive: true,
    },
  });

  useEffect(() => {
    if (isEditing) {
      const fetchWarehouse = async () => {
        try {
          const warehouse = await warehousesService.getById(id);
          setValue('name', warehouse.name);
          setValue('address', warehouse.address);
          setValue('isDefault', warehouse.isDefault);
          setValue('isActive', warehouse.isActive);
        } catch (error) {
          toast.error('Error al cargar almacén');
          navigate('/warehouses');
        } finally {
          setIsFetching(false);
        }
      };
      fetchWarehouse();
    }
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: WarehouseFormData) => {
    setIsLoading(true);
    try {
      if (isEditing) {
        await warehousesService.update(id, data);
        toast.success('Almacén actualizado');
      } else {
        await warehousesService.create(data);
        toast.success('Almacén creado');
      }
      navigate('/warehouses');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar almacén');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return <div className="p-6">Cargando...</div>;
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Almacén' : 'Nuevo Almacén'}
        backTo="/warehouses"
      />

      <Card className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Nombre *"
            {...register('name')}
            error={errors.name?.message}
          />

          <Input
            label="Dirección"
            {...register('address')}
            error={errors.address?.message}
          />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                {...register('isDefault')}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="isDefault" className="text-sm text-gray-700">
                Almacén predeterminado
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                {...register('isActive')}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">
                Almacén activo
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear almacén'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/warehouses')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
