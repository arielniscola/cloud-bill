import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Input, Card, Textarea } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { cashRegistersService } from '../../services';

const cashRegisterSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional().nullable(),
  isActive: z.boolean(),
});

type CashRegisterFormData = z.infer<typeof cashRegisterSchema>;

export default function CashRegisterFormPage() {
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
  } = useForm<CashRegisterFormData>({
    resolver: zodResolver(cashRegisterSchema),
    defaultValues: {
      isActive: true,
    },
  });

  useEffect(() => {
    if (isEditing) {
      const fetchCashRegister = async () => {
        try {
          const cr = await cashRegistersService.getById(id);
          setValue('name', cr.name);
          setValue('description', cr.description);
          setValue('isActive', cr.isActive);
        } catch (error) {
          toast.error('Error al cargar caja');
          navigate('/cash-registers');
        } finally {
          setIsFetching(false);
        }
      };
      fetchCashRegister();
    }
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: CashRegisterFormData) => {
    setIsLoading(true);
    try {
      if (isEditing) {
        await cashRegistersService.update(id, data);
        toast.success('Caja actualizada');
      } else {
        await cashRegistersService.create(data);
        toast.success('Caja creada');
      }
      navigate('/cash-registers');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar caja');
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
        title={isEditing ? 'Editar Caja' : 'Nueva Caja'}
        backTo="/cash-registers"
      />

      <Card className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Nombre *"
            placeholder="Ej: Efectivo mostrador, Banco Santander, Mercado Pago..."
            {...register('name')}
            error={errors.name?.message}
          />

          <Textarea
            label="Descripción"
            placeholder="Descripción opcional de la caja"
            {...register('description')}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Caja activa
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear caja'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/cash-registers')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
