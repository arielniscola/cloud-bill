import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Building2, Hash, Phone, Mail,
  MapPin, FileText, Power, Check,
} from 'lucide-react';
import { Button, Card, Textarea } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { suppliersService } from '../../services';
import type { TaxCondition } from '../../types';

// ── Schema ───────────────────────────────────────────────────────
const supplierSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  cuit: z.string().optional().nullable(),
  taxCondition: z.enum([
    'RESPONSABLE_INSCRIPTO',
    'MONOTRIBUTISTA',
    'EXENTO',
    'CONSUMIDOR_FINAL',
  ]),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Email inválido').optional().or(z.literal('')).nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

// ── Tax condition cards ──────────────────────────────────────────
const TAX_OPTIONS: {
  value: TaxCondition;
  label: string;
  desc: string;
  activeColor: string;
  hoverColor: string;
}[] = [
  {
    value: 'RESPONSABLE_INSCRIPTO',
    label: 'Resp. Inscripto',
    desc: 'IVA discriminado (Factura A)',
    activeColor: 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300',
    hoverColor: 'border-gray-200 hover:border-indigo-300 bg-white',
  },
  {
    value: 'MONOTRIBUTISTA',
    label: 'Monotributista',
    desc: 'Sin IVA discriminado (Factura B/C)',
    activeColor: 'border-violet-400 bg-violet-50 ring-1 ring-violet-300',
    hoverColor: 'border-gray-200 hover:border-violet-300 bg-white',
  },
  {
    value: 'EXENTO',
    label: 'Exento',
    desc: 'Exento de IVA (Factura B)',
    activeColor: 'border-amber-400 bg-amber-50 ring-1 ring-amber-300',
    hoverColor: 'border-gray-200 hover:border-amber-300 bg-white',
  },
  {
    value: 'CONSUMIDOR_FINAL',
    label: 'Cons. Final',
    desc: 'Sin CUIT requerido (Factura B/C)',
    activeColor: 'border-gray-400 bg-gray-50 ring-1 ring-gray-300',
    hoverColor: 'border-gray-200 hover:border-gray-400 bg-white',
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
      <label className="block text-sm font-medium text-gray-700 mb-2">
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
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 ${
                isSelected ? opt.activeColor : opt.hoverColor
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                isSelected ? 'border-current bg-current' : 'border-gray-300'
              }`}>
                {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold leading-tight ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">
      {icon}
      {label}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────
function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
      checked ? 'bg-emerald-50/70 border-emerald-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
        checked ? 'bg-emerald-100 text-emerald-600' : 'bg-white border border-gray-200 text-gray-400'
      }`}>
        <Power className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium leading-none ${checked ? 'text-emerald-800' : 'text-gray-600'}`}>
          Proveedor activo
        </p>
        <p className="text-xs text-gray-400 mt-1 leading-none">
          Solo los proveedores activos aparecen al registrar compras.
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
            <div className="h-3 w-28 bg-gray-100 rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          </div>
        ))}
        <div className="h-20 bg-gray-100 rounded-xl" />
        <div className="flex gap-3 pt-2">
          <div className="h-9 w-36 bg-gray-100 rounded-lg" />
          <div className="h-9 w-24 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

// ── Shared input style ───────────────────────────────────────────
const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150';

// ── Main component ───────────────────────────────────────────────
export default function SupplierFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      taxCondition: 'RESPONSABLE_INSCRIPTO',
      isActive: true,
    },
  });

  const taxCondition = watch('taxCondition');
  const isActiveVal = watch('isActive');

  useEffect(() => {
    if (!isEditing) return;
    suppliersService
      .getById(id)
      .then((s) => {
        setValue('name', s.name);
        setValue('cuit', s.cuit);
        setValue('taxCondition', s.taxCondition);
        setValue('address', s.address);
        setValue('city', s.city);
        setValue('phone', s.phone);
        setValue('email', s.email);
        setValue('notes', s.notes);
        setValue('isActive', s.isActive);
      })
      .catch(() => {
        toast.error('Error al cargar proveedor');
        navigate('/suppliers');
      })
      .finally(() => setIsFetching(false));
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: SupplierFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        cuit:    data.cuit    || undefined,
        address: data.address || undefined,
        city:    data.city    || undefined,
        phone:   data.phone   || undefined,
        email:   data.email   || undefined,
        notes:   data.notes   || undefined,
      };
      if (isEditing) {
        await suppliersService.update(id, payload);
        toast.success('Proveedor actualizado');
      } else {
        await suppliersService.create(payload);
        toast.success('Proveedor creado');
      }
      navigate('/suppliers');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar proveedor');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div>
        <PageHeader title={isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'} backTo="/suppliers" />
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        backTo="/suppliers"
      />

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Identificación ── */}
          <div className="space-y-4">
            <SectionHeader icon={<Building2 className="w-3.5 h-3.5" />} label="Identificación" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nombre / Razón Social *
              </label>
              <input
                type="text"
                placeholder="Ej: Distribuidora García S.A."
                {...register('name')}
                autoFocus={!isEditing}
                className={inputCls}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-gray-400" />
                  CUIT
                </label>
                <input
                  type="text"
                  placeholder="20-12345678-1"
                  {...register('cuit')}
                  className={`${inputCls} font-mono`}
                />
                {errors.cuit && <p className="mt-1 text-xs text-red-500">{errors.cuit.message}</p>}
              </div>
              <div />
            </div>

            <TaxConditionSelector
              value={taxCondition}
              onChange={(v) => setValue('taxCondition', v)}
              error={errors.taxCondition?.message}
            />
          </div>

          {/* ── Contacto ── */}
          <div className="space-y-4">
            <SectionHeader icon={<Phone className="w-3.5 h-3.5" />} label="Contacto" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  Email
                </label>
                <input
                  type="email"
                  placeholder="proveedor@ejemplo.com"
                  {...register('email')}
                  className={inputCls}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  Teléfono
                </label>
                <input
                  type="text"
                  placeholder="11 1234-5678"
                  {...register('phone')}
                  className={inputCls}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
              </div>
            </div>
          </div>

          {/* ── Ubicación ── */}
          <div className="space-y-4">
            <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} label="Ubicación" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
              <input
                type="text"
                placeholder="Av. San Martín 2500"
                {...register('address')}
                className={inputCls}
              />
            </div>
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                Ciudad
              </label>
              <input
                type="text"
                placeholder="Buenos Aires"
                {...register('city')}
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Notas ── */}
          <div className="space-y-3">
            <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} label="Notas" />
            <Textarea
              placeholder="Condiciones de pago, contacto comercial, plazos de entrega…"
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
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/suppliers')} disabled={isLoading}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
