import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { User, MapPin, FileText, AlertCircle, AlertTriangle, Receipt } from 'lucide-react';
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
import type { OptionCard, PadronState } from '../../components/shared';
import { customersService } from '../../services';

const FORM_ID = 'customer-form';

// ── Schema ───────────────────────────────────────────────────────
const customerSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
    if (!requiresCuit(data.taxCondition)) return;
    if ((data.taxId ?? '').replace(/\D/g, '').length === 11) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taxId'],
      message: cuitIssueMessage(data.taxCondition),
    });
  });

type CustomerFormData = z.infer<typeof customerSchema>;

const SALE_OPTIONS: OptionCard<'CONTADO' | 'CUENTA_CORRIENTE'>[] = [
  { value: 'CONTADO', label: 'Contado', desc: 'Cada venta se salda al emitirse' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta Corriente', desc: 'Genera saldo a cobrar' },
];

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
export default function CustomerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
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
  const taxIdVal = watch('taxId');

  const cuitRequired = requiresCuit(taxCondition);
  const isPadronLoading = padronState === 'loading';
  const errorCount = Object.keys(errors).length;

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

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => navigate('/customers')}
        disabled={isLoading}
      >
        Cancelar
      </Button>
      <Button type="submit" form={FORM_ID} isLoading={isLoading}>
        {isEditing ? 'Guardar cambios' : 'Crear cliente'}
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
        <PageHeader title="Editar Cliente" backTo="/customers" />
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
        subtitle="Los campos con * son obligatorios"
        backTo="/customers"
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
            <SectionHeader icon={<User className="w-3.5 h-3.5" />} label="Identificación fiscal" />

            <div className="mt-3.5">
              <PadronLookup
                value={taxIdVal}
                onChange={(raw) => setValue('taxId', raw || null, { shouldValidate: !!errors.taxId })}
                required={cuitRequired}
                error={errors.taxId?.message}
                onStateChange={setPadronState}
                onResult={(p) => {
                  if (p.name) setValue('name', p.name, { shouldValidate: true });
                  setValue('taxCondition', p.taxCondition);
                  if (p.address) setValue('address', p.address);
                  if (p.city) setValue('city', p.city);
                  if (p.province) setValue('province', p.province);
                  if (p.postalCode) setValue('postalCode', p.postalCode);
                  clearErrors('taxId');
                }}
              />
            </div>

            {/* Nombre */}
            <div className="mt-4">
              <FieldLabel required>Nombre / Razón Social</FieldLabel>
              <input
                type="text"
                placeholder="Ej: Juan García o Acme S.A."
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
                onChange={(v) => setValue('taxCondition', v, { shouldValidate: !!errors.taxId })}
                columns={4}
              />
            </div>

            {/* Condición de cobro */}
            <div className="mt-4">
              <FieldLabel>Condición de cobro</FieldLabel>
              <OptionCards
                options={SALE_OPTIONS}
                value={saleCondition}
                onChange={(v) => setValue('saleCondition', v)}
                columns={2}
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
                  placeholder="cliente@ejemplo.com"
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
                  placeholder="Av. Corrientes 1234"
                  disabled={isPadronLoading}
                  {...register('address')}
                  className={fieldClass()}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>C.P.</FieldLabel>
                <input
                  type="text"
                  placeholder="1043"
                  disabled={isPadronLoading}
                  {...register('postalCode')}
                  className={fieldClass()}
                />
              </div>
              <div className="md:col-span-3">
                <FieldLabel>Ciudad</FieldLabel>
                <input
                  type="text"
                  placeholder="CABA"
                  disabled={isPadronLoading}
                  {...register('city')}
                  className={fieldClass()}
                />
              </div>
              <div className="md:col-span-3">
                <FieldLabel>Provincia</FieldLabel>
                <input
                  type="text"
                  placeholder="Buenos Aires"
                  disabled={isPadronLoading}
                  {...register('province')}
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
                <span className="text-sm text-gray-500 dark:text-slate-400">Comprobante</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">
                  {COMPROBANTE_BY_TAX[taxCondition]}
                </span>
              </div>
              <div className="h-px bg-gray-100 dark:bg-slate-700" />
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Cuenta corriente</span>
                <span
                  className={clsx(
                    'text-sm font-semibold text-right',
                    saleCondition === 'CUENTA_CORRIENTE'
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-gray-900 dark:text-white'
                  )}
                >
                  {saleCondition === 'CUENTA_CORRIENTE' ? 'Sí, genera saldo' : 'No genera saldo'}
                </span>
              </div>
            </div>
            <p className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-700 text-xs leading-[17px] text-gray-500 dark:text-slate-400">
              {saleCondition === 'CUENTA_CORRIENTE'
                ? 'Cada factura emitida suma al saldo del cliente y se cancela con recibos.'
                : 'Las ventas se cobran en el momento; no se acumula deuda en cuenta corriente.'}
            </p>
          </Card>

          {/* Estado */}
          <ActiveToggle
            checked={isActiveVal}
            onChange={(v) => setValue('isActive', v)}
            label="Cliente activo"
            hint="Solo los activos aparecen al facturar."
          />

          {/* Notas */}
          <Card>
            <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} label="Notas internas" />
            <textarea
              rows={4}
              placeholder="Condiciones especiales, contacto alternativo…"
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
