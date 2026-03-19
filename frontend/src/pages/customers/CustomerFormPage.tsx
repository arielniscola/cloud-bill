import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  User, Hash, Building2, Phone, Mail,
  MapPin, FileText, Power, Check,
} from 'lucide-react';
import { Button, Input, Textarea, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { customersService } from '../../services';
import type { TaxCondition } from '../../types';

// ── Schema ───────────────────────────────────────────────────────
const customerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  taxId: z.string().optional().nullable(),
  taxCondition: z.enum([
    'RESPONSABLE_INSCRIPTO',
    'MONOTRIBUTISTA',
    'EXENTO',
    'CONSUMIDOR_FINAL',
  ]),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']),
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

// ── Tax condition cards ──────────────────────────────────────────
const TAX_OPTIONS: {
  value: TaxCondition;
  label: string;
  desc: string;
  color: string;
  activeColor: string;
}[] = [
  {
    value: 'RESPONSABLE_INSCRIPTO',
    label: 'Resp. Inscripto',
    desc: 'IVA discriminado (Factura A)',
    color: 'border-gray-200 hover:border-indigo-300',
    activeColor: 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300',
  },
  {
    value: 'MONOTRIBUTISTA',
    label: 'Monotributista',
    desc: 'Sin IVA discriminado (Factura B/C)',
    color: 'border-gray-200 hover:border-violet-300',
    activeColor: 'border-violet-400 bg-violet-50 ring-1 ring-violet-300',
  },
  {
    value: 'EXENTO',
    label: 'Exento',
    desc: 'Exento de IVA (Factura B)',
    color: 'border-gray-200 hover:border-amber-300',
    activeColor: 'border-amber-400 bg-amber-50 ring-1 ring-amber-300',
  },
  {
    value: 'CONSUMIDOR_FINAL',
    label: 'Cons. Final',
    desc: 'Sin CUIT requerido (Factura B/C)',
    color: 'border-gray-200 hover:border-gray-400',
    activeColor: 'border-gray-400 bg-gray-50 ring-1 ring-gray-300',
  },
];

function TaxConditionSelector({
  value,
  onChange,
  error,
}: {
  value: TaxCondition;
  onChange: (v: TaxCondition) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
        Condición IVA *
      </label>
      <div className="grid grid-cols-2 gap-2">
        {TAX_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`relative flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 ${
                isSelected ? opt.activeColor : opt.color + ' bg-white dark:bg-slate-700 dark:border-slate-600'
              }`}
            >
              {/* Check mark */}
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                isSelected ? 'border-current bg-current' : 'border-gray-300 dark:border-slate-500'
              }`}>
                {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold leading-tight ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-slate-300'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Sale condition cards ─────────────────────────────────────────
const SALE_CONDITION_OPTIONS: {
  value: 'CONTADO' | 'CUENTA_CORRIENTE';
  label: string;
  desc: string;
  color: string;
  activeColor: string;
}[] = [
  {
    value: 'CONTADO',
    label: 'Contado',
    desc: 'Transacciones independientes',
    color: 'border-gray-200 hover:border-gray-400',
    activeColor: 'border-gray-400 bg-gray-50 ring-1 ring-gray-300',
  },
  {
    value: 'CUENTA_CORRIENTE',
    label: 'Cuenta Corriente',
    desc: 'Genera movimientos en cuenta corriente',
    color: 'border-gray-200 hover:border-blue-300',
    activeColor: 'border-blue-400 bg-blue-50 ring-1 ring-blue-300',
  },
];

function SaleConditionSelector({
  value,
  onChange,
}: {
  value: 'CONTADO' | 'CUENTA_CORRIENTE';
  onChange: (v: 'CONTADO' | 'CUENTA_CORRIENTE') => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
        Condición de cobro
      </label>
      <div className="grid grid-cols-2 gap-2">
        {SALE_CONDITION_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`relative flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 ${
                isSelected ? opt.activeColor : opt.color + ' bg-white dark:bg-slate-700 dark:border-slate-600'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                isSelected ? 'border-current bg-current' : 'border-gray-300 dark:border-slate-500'
              }`}>
                {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold leading-tight ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-slate-300'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider pt-1">
      {icon}
      {label}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────
function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
      checked ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
        checked ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-400 dark:text-slate-400'
      }`}>
        <Power className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium leading-none ${checked ? 'text-emerald-800 dark:text-emerald-400' : 'text-gray-600 dark:text-slate-400'}`}>
          Cliente activo
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 leading-none">
          Solo los clientes activos aparecen al crear facturas y remitos.
        </p>
      </div>
      <div
        className={`relative flex-shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`}
        style={{ width: 40, height: 22 }}
      >
        <span className={`absolute top-[3px] w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
        }`} />
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function FormSkeleton() {
  return (
    <Card className="max-w-2xl animate-pulse">
      <div className="space-y-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="space-y-3">
            <div className="h-3 w-28 bg-gray-100 dark:bg-slate-700 rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
              <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
            </div>
          </div>
        ))}
        <div className="h-24 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        <div className="flex gap-3 pt-2">
          <div className="h-9 w-36 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          <div className="h-9 w-24 bg-gray-100 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────
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
      saleCondition: 'CONTADO',
      isActive: true,
    },
  });

  const taxCondition = watch('taxCondition');
  const saleCondition = watch('saleCondition');
  const isActiveVal = watch('isActive');

  useEffect(() => {
    if (!isEditing) return;
    const fetchCustomer = async () => {
      try {
        const c = await customersService.getById(id);
        setValue('name', c.name);
        setValue('taxId', c.taxId);
        setValue('taxCondition', c.taxCondition);
        setValue('saleCondition', (c.saleCondition ?? 'CONTADO') as 'CONTADO' | 'CUENTA_CORRIENTE');
        setValue('address', c.address);
        setValue('city', c.city);
        setValue('province', c.province);
        setValue('postalCode', c.postalCode);
        setValue('phone', c.phone);
        setValue('email', c.email);
        setValue('notes', c.notes);
        setValue('isActive', c.isActive);
      } catch {
        toast.error('Error al cargar cliente');
        navigate('/customers');
      } finally {
        setIsFetching(false);
      }
    };
    fetchCustomer();
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: CustomerFormData) => {
    setIsLoading(true);
    try {
      const payload = { ...data, email: data.email || null };
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
    return (
      <div>
        <PageHeader title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'} backTo="/customers" />
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
        backTo="/customers"
      />

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Identificación ── */}
          <div className="space-y-4">
            <SectionHeader icon={<User className="w-3.5 h-3.5" />} label="Identificación" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre / Razón Social *"
                placeholder="Ej: Juan García o Acme S.A."
                {...register('name')}
                error={errors.name?.message}
                autoFocus={!isEditing}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                  CUIT / CUIL
                </label>
                <input
                  type="text"
                  placeholder="20-12345678-1"
                  {...register('taxId')}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
                {errors.taxId && <p className="mt-1 text-xs text-red-500">{errors.taxId.message}</p>}
              </div>
            </div>

            <TaxConditionSelector
              value={taxCondition}
              onChange={(v) => setValue('taxCondition', v)}
              error={errors.taxCondition?.message}
            />

            <SaleConditionSelector
              value={saleCondition}
              onChange={(v) => setValue('saleCondition', v)}
            />
          </div>

          {/* ── Contacto ── */}
          <div className="space-y-4">
            <SectionHeader icon={<Phone className="w-3.5 h-3.5" />} label="Contacto" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                  Email
                </label>
                <input
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  {...register('email')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                  Teléfono
                </label>
                <input
                  type="text"
                  placeholder="11 1234-5678"
                  {...register('phone')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
              </div>
            </div>
          </div>

          {/* ── Ubicación ── */}
          <div className="space-y-4">
            <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} label="Ubicación" />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Dirección</label>
              <input
                type="text"
                placeholder="Av. Corrientes 1234"
                {...register('address')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">C.P.</label>
                <input
                  type="text"
                  placeholder="1043"
                  {...register('postalCode')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Ciudad</label>
                <input
                  type="text"
                  placeholder="CABA"
                  {...register('city')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Provincia</label>
                <input
                  type="text"
                  placeholder="Buenos Aires"
                  {...register('province')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
              </div>
            </div>
          </div>

          {/* ── Notas ── */}
          <div className="space-y-3">
            <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} label="Notas" />
            <Textarea
              placeholder="Observaciones internas, condiciones especiales, contacto alternativo…"
              rows={3}
              {...register('notes')}
              error={errors.notes?.message}
            />
          </div>

          {/* ── Estado ── */}
          <ActiveToggle
            checked={isActiveVal}
            onChange={(v) => setValue('isActive', v)}
          />

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/customers')} disabled={isLoading}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
