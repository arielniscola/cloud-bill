import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Textarea } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { cashRegistersService } from '../../services';

const cashRegisterSchema = z.object({
  name:        z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional().nullable(),
  isActive:    z.boolean(),
});

type CashRegisterFormData = z.infer<typeof cashRegisterSchema>;

function FormSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 max-w-xl animate-pulse space-y-5">
      <div className="flex items-center gap-3 pb-5 border-b border-gray-100 dark:border-slate-700">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-24" />
          <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-48" />
        </div>
      </div>
      <div className="h-9 bg-gray-100 dark:bg-slate-700 rounded-lg" />
      <div className="h-20 bg-gray-100 dark:bg-slate-700 rounded-lg" />
      <div className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl" />
    </div>
  );
}

export default function CashRegisterFormPage() {
  const navigate    = useNavigate();
  const { id }      = useParams();
  const isEditing   = !!id;
  const [isLoading, setIsLoading]   = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CashRegisterFormData>({
    resolver: zodResolver(cashRegisterSchema),
    defaultValues: { isActive: true },
  });

  const isActive = watch('isActive');

  useEffect(() => {
    if (!isEditing) return;
    cashRegistersService
      .getById(id)
      .then((cr) => {
        setValue('name', cr.name);
        setValue('description', cr.description);
        setValue('isActive', cr.isActive);
      })
      .catch(() => {
        toast.error('Error al cargar caja');
        navigate('/cash-registers');
      })
      .finally(() => setIsFetching(false));
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
    return (
      <div>
        <PageHeader title={isEditing ? 'Editar caja' : 'Nueva caja'} backTo="/cash-registers" />
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar caja' : 'Nueva caja'}
        backTo="/cash-registers"
      />

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {isEditing ? 'Editar caja' : 'Nueva caja'}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Las cajas agrupan cobros de facturas y presupuestos.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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

          {/* Toggle switch */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Caja activa</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                Solo las cajas activas aparecen al registrar cobros.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setValue('isActive', !isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                isActive ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" isLoading={isLoading}>
              <Save className="w-4 h-4 mr-2" />
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
      </div>
    </div>
  );
}
