import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, User, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input } from '../ui';
import CuitInput from './CuitInput';
import { customersService } from '../../services';
import type { Customer, TaxCondition } from '../../types';

// ── Schema (campos mínimos para crear rápido) ─────────────────────
const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  taxId: z.string().optional().nullable(),
  taxCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'CONSUMIDOR_FINAL']),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']),
  phone: z.string().optional().nullable(),
  email: z.string().email('Email inválido').optional().or(z.literal('')).nullable(),
});

type FormData = z.infer<typeof schema>;

// ── Tax condition mini-cards ──────────────────────────────────────
const TAX_OPTIONS: { value: TaxCondition; label: string; color: string; activeColor: string }[] = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Resp. Inscripto', color: 'border-gray-200 hover:border-indigo-300 dark:border-slate-600 dark:hover:border-indigo-500', activeColor: 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-500 dark:ring-indigo-700' },
  { value: 'MONOTRIBUTISTA',        label: 'Monotributista',  color: 'border-gray-200 hover:border-violet-300 dark:border-slate-600 dark:hover:border-violet-500',  activeColor: 'border-violet-400 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-900/30 dark:border-violet-500 dark:ring-violet-700' },
  { value: 'EXENTO',                label: 'Exento',          color: 'border-gray-200 hover:border-amber-300 dark:border-slate-600 dark:hover:border-amber-500',    activeColor: 'border-amber-400 bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:border-amber-500 dark:ring-amber-700' },
  { value: 'CONSUMIDOR_FINAL',      label: 'Cons. Final',     color: 'border-gray-200 hover:border-gray-400 dark:border-slate-600 dark:hover:border-slate-400',     activeColor: 'border-gray-400 bg-gray-50 ring-1 ring-gray-300 dark:bg-slate-600 dark:border-slate-400 dark:ring-slate-500' },
];

function TaxSelector({ value, onChange }: { value: TaxCondition; onChange: (v: TaxCondition) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Condición IVA *</label>
      <div className="grid grid-cols-2 gap-1.5">
        {TAX_OPTIONS.map((opt) => {
          const sel = value === opt.value;
          return (
            <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all duration-150 ${sel ? opt.activeColor + ' text-gray-900 dark:text-white' : opt.color + ' bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${sel ? 'border-current bg-current' : 'border-gray-300 dark:border-slate-500'}`}>
                {sel && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
              </div>
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Sale condition mini-cards ─────────────────────────────────────
const SALE_OPTIONS = [
  { value: 'CONTADO' as const,           label: 'Contado',          color: 'border-gray-200 hover:border-gray-400 dark:border-slate-600 dark:hover:border-slate-400',  activeColor: 'border-gray-400 bg-gray-50 ring-1 ring-gray-300 dark:bg-slate-600 dark:border-slate-400 dark:ring-slate-500' },
  { value: 'CUENTA_CORRIENTE' as const,  label: 'Cta. Corriente',   color: 'border-gray-200 hover:border-blue-300 dark:border-slate-600 dark:hover:border-blue-500',   activeColor: 'border-blue-400 bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-900/30 dark:border-blue-500 dark:ring-blue-700' },
];

function SaleSelector({ value, onChange }: { value: 'CONTADO' | 'CUENTA_CORRIENTE'; onChange: (v: 'CONTADO' | 'CUENTA_CORRIENTE') => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Condición de cobro</label>
      <div className="grid grid-cols-2 gap-1.5">
        {SALE_OPTIONS.map((opt) => {
          const sel = value === opt.value;
          return (
            <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all duration-150 ${sel ? opt.activeColor + ' text-gray-900 dark:text-white' : opt.color + ' bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${sel ? 'border-current bg-current' : 'border-gray-300 dark:border-slate-500'}`}>
                {sel && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
              </div>
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the newly created customer after a successful save */
  onCreated: (customer: Customer) => void;
}

export default function CreateCustomerModal({ isOpen, onClose, onCreated }: CreateCustomerModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { taxCondition: 'CONSUMIDOR_FINAL', saleCondition: 'CONTADO' },
  });

  const taxCondition = watch('taxCondition');
  const saleCondition = watch('saleCondition');

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        email: data.email || null,
        isActive: true,
        address: null,
        city: null,
        province: null,
        postalCode: null,
        notes: null,
      };
      const newCustomer = await customersService.create(payload);
      toast.success('Cliente creado');
      reset();
      onCreated(newCustomer);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al crear cliente');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nuevo cliente" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Nombre + CUIT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Nombre / Razón Social *"
            placeholder="Ej: Juan García"
            {...register('name')}
            error={errors.name?.message}
            autoFocus
          />
          <CuitInput
            label="CUIT / CUIL"
            value={watch('taxId')}
            onChange={(raw) => setValue('taxId', raw || null)}
            error={errors.taxId?.message}
          />
        </div>

        {/* Condición IVA */}
        <TaxSelector value={taxCondition} onChange={(v) => setValue('taxCondition', v)} />

        {/* Condición de cobro */}
        <SaleSelector value={saleCondition} onChange={(v) => setValue('saleCondition', v)} />

        {/* Contacto (opcional) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              Teléfono
            </label>
            <input
              type="text"
              placeholder="11 1234-5678"
              {...register('phone')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              Email
            </label>
            <input
              type="email"
              placeholder="cliente@ejemplo.com"
              {...register('email')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow]"
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
          <Button type="submit" isLoading={isLoading} className="flex-1">
            Crear cliente
          </Button>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
