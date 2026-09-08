import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Building2, MapPin, FileText, AlertCircle, AlertTriangle, Receipt } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import {
  PageHeader,
  PadronLookup,
  OptionCards,
  ActiveToggle,
  SectionHeader,
  FieldLabel,
  FieldError,
  fieldClass,
  requiresCuit,
  cuitIssueMessage,
  TAX_OPTIONS,
  COMPROBANTE_BY_TAX,
} from '../../components/shared';
import type { PadronState } from '../../components/shared';
import { suppliersService } from '../../services';

const FORM_ID = 'supplier-form';

// ── Schema ───────────────────────────────────────────────────────
const supplierSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
    if (!requiresCuit(data.taxCondition)) return;
    if ((data.cuit ?? '').replace(/\D/g, '').length === 11) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cuit'],
      message: cuitIssueMessage(data.taxCondition),
    });
  });

// El tipo de ENTRADA del formulario (lo que escribe el usuario) y el de SALIDA
// (lo ya parseado) se declaran por separado para que useForm y handleSubmit usen
// cada uno el suyo.
type SupplierFormInput = z.input<typeof supplierSchema>;
type SupplierFormData = z.output<typeof supplierSchema>;

// ── Skeleton ─────────────────────────────────────────────────────
function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start animate-pulse">
      <div className="space-y-5">
        {[1, 2].map((s) => (
          <Card key={s}>
            <div className="space-y-4">
              <div className="h-3 w-32 bg-gray-100 dark:bg-slate-700 rounded" />
              <div className="h-24 bg-gray-100 dark:bg-slate-700 rounded-xl" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
                <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        <div className="h-20 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        <div className="h-40 bg-gray-100 dark:bg-slate-700 rounded-xl" />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function SupplierFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [padronState, setPadronState] = useState<PadronState>('idle');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    clearErrors,
    formState: { errors },
  } = useForm<SupplierFormInput, unknown, SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      taxCondition: 'RESPONSABLE_INSCRIPTO',
      isActive: true,
    },
  });

  const taxCondition = watch('taxCondition');
  const cuitVal = watch('cuit');
  const isActiveVal = watch('isActive');

  const cuitRequired = requiresCuit(taxCondition);
  const isPadronLoading = padronState === 'loading';
  const errorCount = Object.keys(errors).length;

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

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => navigate('/suppliers')}
        disabled={isLoading}
      >
        Cancelar
      </Button>
      <Button type="submit" form={FORM_ID} isLoading={isLoading}>
        {isEditing ? 'Guardar cambios' : 'Crear proveedor'}
      </Button>
    </>
  );

  const errorBadge = errorCount > 0 && (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
      <AlertCircle className="w-4 h-4" />
      {errorCount === 1 ? 'Falta 1 dato obligatorio' : `Faltan ${errorCount} datos obligatorios`}
    </span>
  );

  if (isFetching) {
    return (
      <div>
        <PageHeader title="Editar Proveedor" backTo="/suppliers" />
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        subtitle="Los campos con * son obligatorios"
        backTo="/suppliers"
        actions={
          <div className="hidden sm:flex items-center gap-2.5">
            {errorBadge}
            {actionButtons}
          </div>
        }
      />

      <form
        id={FORM_ID}
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start"
      >
        {/* ══ Columna principal ══ */}
        <div className="space-y-5">

          {/* ── Identificación fiscal ── */}
          <Card>
            <SectionHeader icon={<Building2 className="w-3.5 h-3.5" />} label="Identificación fiscal" />

            <div className="mt-3.5">
              <PadronLookup
                value={cuitVal}
                onChange={(raw) => setValue('cuit', raw || null, { shouldValidate: !!errors.cuit })}
                required={cuitRequired}
                error={errors.cuit?.message}
                onStateChange={setPadronState}
                onResult={(p) => {
                  if (p.name) setValue('name', p.name, { shouldValidate: true });
                  setValue('taxCondition', p.taxCondition);
                  if (p.address) setValue('address', p.address);
                  if (p.city) setValue('city', p.city);
                  clearErrors('cuit');
                }}
              />
            </div>

            {/* Nombre */}
            <div className="mt-4">
              <FieldLabel required>Nombre / Razón Social</FieldLabel>
              <input
                type="text"
                placeholder="Ej: Distribuidora García S.A."
                autoFocus={!isEditing}
                disabled={isPadronLoading}
                {...register('name')}
                className={fieldClass(!!errors.name)}
              />
              <FieldError message={errors.name?.message} />
            </div>

            {/* Condición IVA */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <FieldLabel required>Condición frente al IVA</FieldLabel>
                {cuitRequired && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Esta condición exige CUIT
                  </span>
                )}
              </div>
              <OptionCards
                options={TAX_OPTIONS}
                value={taxCondition}
                onChange={(v) => setValue('taxCondition', v, { shouldValidate: !!errors.cuit })}
                columns={4}
              />
            </div>
          </Card>

          {/* ── Contacto y ubicación ── */}
          <Card>
            <SectionHeader
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="Contacto y ubicación"
              suffix="opcional"
            />

            <div className="mt-3.5 grid grid-cols-1 md:grid-cols-6 gap-3.5">
              <div className="md:col-span-3">
                <FieldLabel>Email</FieldLabel>
                <input
                  type="email"
                  placeholder="proveedor@ejemplo.com"
                  {...register('email')}
                  className={fieldClass(!!errors.email)}
                />
                <FieldError message={errors.email?.message} />
              </div>
              <div className="md:col-span-3">
                <FieldLabel>Teléfono</FieldLabel>
                <input
                  type="text"
                  placeholder="11 1234-5678"
                  {...register('phone')}
                  className={fieldClass(!!errors.phone)}
                />
                <FieldError message={errors.phone?.message} />
              </div>
              <div className="md:col-span-4">
                <FieldLabel>Dirección</FieldLabel>
                <input
                  type="text"
                  placeholder="Av. San Martín 2500"
                  disabled={isPadronLoading}
                  {...register('address')}
                  className={fieldClass()}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Ciudad</FieldLabel>
                <input
                  type="text"
                  placeholder="Buenos Aires"
                  disabled={isPadronLoading}
                  {...register('city')}
                  className={fieldClass()}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* ══ Rail derecho ══ */}
        <div className="space-y-4">

          {/* Consecuencias de lo elegido */}
          <Card>
            <SectionHeader icon={<Receipt className="w-3.5 h-3.5" />} label="Qué implica" />
            <div className="mt-3 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Vas a recibir</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">
                  {COMPROBANTE_BY_TAX[taxCondition]}
                </span>
              </div>
              <div className="h-px bg-gray-100 dark:bg-slate-700" />
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">IVA discriminado</span>
                <span
                  className={clsx(
                    'text-sm font-semibold text-right',
                    taxCondition === 'RESPONSABLE_INSCRIPTO'
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-gray-900 dark:text-white'
                  )}
                >
                  {taxCondition === 'RESPONSABLE_INSCRIPTO' ? 'Sí' : 'No'}
                </span>
              </div>
            </div>
            <p className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-700 text-xs leading-[17px] text-gray-500 dark:text-slate-400">
              {taxCondition === 'RESPONSABLE_INSCRIPTO'
                ? 'El crédito fiscal de sus facturas entra al Libro IVA Compras.'
                : 'Sus comprobantes no generan crédito fiscal computable.'}
            </p>
          </Card>

          {/* Estado */}
          <ActiveToggle
            checked={isActiveVal}
            onChange={(v) => setValue('isActive', v)}
            label="Proveedor activo"
            hint="Solo los activos aparecen al registrar compras."
          />

          {/* Notas */}
          <Card>
            <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} label="Notas internas" />
            <textarea
              rows={4}
              placeholder="Condiciones de pago, contacto comercial, plazos de entrega…"
              {...register('notes')}
              className={fieldClass(!!errors.notes, 'mt-3 resize-none leading-5')}
            />
            <FieldError message={errors.notes?.message} />
          </Card>
        </div>
      </form>

      {/* Acciones al pie para pantallas angostas, donde el header no las muestra */}
      <div className="sm:hidden mt-5 space-y-3">
        {errorBadge}
        <div className="flex gap-3">{actionButtons}</div>
      </div>
    </div>
  );
}
