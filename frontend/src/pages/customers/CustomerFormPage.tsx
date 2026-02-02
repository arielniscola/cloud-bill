import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { customersService } from '../../services';
import { TAX_CONDITION_OPTIONS } from '../../utils/constants';
import type { TaxCondition } from '../../types';

const customerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  taxId: z.string().optional().nullable(),
  taxCondition: z.enum([
    'RESPONSABLE_INSCRIPTO',
    'MONOTRIBUTISTA',
    'EXENTO',
    'CONSUMIDOR_FINAL',
  ]),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Email inválido').optional().or(z.literal('')).nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function CustomerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      taxCondition: 'CONSUMIDOR_FINAL',
      isActive: true,
    },
  });

  const taxCondition = watch('taxCondition');

  useEffect(() => {
    if (isEditing) {
      const fetchCustomer = async () => {
        try {
          const customer = await customersService.getById(id);
          setValue('name', customer.name);
          setValue('taxId', customer.taxId);
          setValue('taxCondition', customer.taxCondition);
          setValue('address', customer.address);
          setValue('city', customer.city);
          setValue('province', customer.province);
          setValue('postalCode', customer.postalCode);
          setValue('phone', customer.phone);
          setValue('email', customer.email);
          setValue('notes', customer.notes);
          setValue('isActive', customer.isActive);
        } catch (error) {
          toast.error('Error al cargar cliente');
          navigate('/customers');
        } finally {
          setIsFetching(false);
        }
      };
      fetchCustomer();
    }
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: CustomerFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        email: data.email || null,
      };

      if (isEditing) {
        await customersService.update(id, payload);
        toast.success('Cliente actualizado');
      } else {
        await customersService.create(payload);
        toast.success('Cliente creado');
      }
      navigate('/customers');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar cliente');
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
        title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
        backTo="/customers"
      />

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre *"
              {...register('name')}
              error={errors.name?.message}
            />
            <Input
              label="CUIT/CUIL"
              {...register('taxId')}
              error={errors.taxId?.message}
            />
          </div>

          <Select
            label="Condición IVA *"
            options={TAX_CONDITION_OPTIONS}
            value={taxCondition}
            onChange={(value) => setValue('taxCondition', value as TaxCondition)}
            error={errors.taxCondition?.message}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              {...register('email')}
              error={errors.email?.message}
            />
            <Input
              label="Teléfono"
              {...register('phone')}
              error={errors.phone?.message}
            />
          </div>

          <Input
            label="Dirección"
            {...register('address')}
            error={errors.address?.message}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Ciudad"
              {...register('city')}
              error={errors.city?.message}
            />
            <Input
              label="Provincia"
              {...register('province')}
              error={errors.province?.message}
            />
            <Input
              label="Código Postal"
              {...register('postalCode')}
              error={errors.postalCode?.message}
            />
          </div>

          <Textarea
            label="Notas"
            {...register('notes')}
            error={errors.notes?.message}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Cliente activo
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/customers')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
