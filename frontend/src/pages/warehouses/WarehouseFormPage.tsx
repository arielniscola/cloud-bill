import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Warehouse, MapPin, Star, Power } from 'lucide-react';
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

// ── Toggle switch ────────────────────────────────────────────────
function ToggleField({
  id,
  label,
  description,
  icon,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
        checked
          ? 'bg-indigo-50/60 border-indigo-200'
          : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100/60'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
          checked ? 'bg-indigo-100 text-indigo-500' : 'bg-white text-gray-400 border border-gray-200'
        }`}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${checked ? 'text-indigo-800' : 'text-gray-700'}`}>
          {label}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{description}</p>
      </div>

      {/* Toggle pill */}
      <div
        className={`relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors duration-200 ${
          checked ? 'bg-indigo-500' : 'bg-gray-200'
        }`}
        style={{ height: '22px', width: '40px' }}
      >
        <span
          className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[19px]' : 'translate-x-0.5'
          }`}
        />
      </div>

      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}

// ── Form skeleton ────────────────────────────────────────────────
function FormSkeleton() {
  return (
    <Card className="max-w-xl animate-pulse">
      <div className="space-y-6">
        <div>
          <div className="h-3.5 w-16 bg-gray-100 rounded mb-2" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
        <div>
          <div className="h-3.5 w-20 bg-gray-100 rounded mb-2" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
        <div className="space-y-3">
          <div className="h-16 bg-gray-100 rounded-xl" />
          <div className="h-16 bg-gray-100 rounded-xl" />
        </div>
        <div className="flex gap-3 pt-2">
          <div className="h-9 w-32 bg-gray-100 rounded-lg" />
          <div className="h-9 w-20 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function WarehouseFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      isDefault: false,
      isActive: true,
    },
  });

  const isDefaultVal = watch('isDefault');
  const isActiveVal = watch('isActive');

  useEffect(() => {
    if (!isEditing) return;
    const fetch = async () => {
      try {
        const warehouse = await warehousesService.getById(id);
        setValue('name', warehouse.name);
        setValue('address', warehouse.address);
        setValue('isDefault', warehouse.isDefault);
        setValue('isActive', warehouse.isActive);
      } catch {
        toast.error('Error al cargar almacén');
        navigate('/warehouses');
      } finally {
        setIsFetching(false);
      }
    };
    fetch();
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

  if (isFetching) return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Almacén' : 'Nuevo Almacén'}
        backTo="/warehouses"
      />
      <FormSkeleton />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Almacén' : 'Nuevo Almacén'}
        backTo="/warehouses"
      />

      <Card className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Identification */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              <Warehouse className="w-3.5 h-3.5" />
              Identificación
            </div>

            <Input
              label="Nombre *"
              placeholder="Ej: Depósito Central"
              {...register('name')}
              error={errors.name?.message}
              autoFocus={!isEditing}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  Dirección
                </span>
              </label>
              <input
                type="text"
                placeholder="Ej: Av. Corrientes 1234, CABA"
                {...register('address')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
              />
              {errors.address && (
                <p className="mt-1 text-xs text-red-500">{errors.address.message}</p>
              )}
            </div>
          </div>

          {/* Options */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Opciones
            </p>
            <div className="space-y-2.5">
              <ToggleField
                id="isDefault"
                label="Almacén predeterminado"
                description="Se usará automáticamente al crear compras, remitos y movimientos."
                icon={<Star className="w-4 h-4" />}
                checked={isDefaultVal}
                onChange={(v) => setValue('isDefault', v)}
              />
              <ToggleField
                id="isActive"
                label="Almacén activo"
                description="Solo los almacenes activos aparecen en los selectores del sistema."
                icon={<Power className="w-4 h-4" />}
                checked={isActiveVal}
                onChange={(v) => setValue('isActive', v)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear almacén'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/warehouses')}
              disabled={isLoading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
