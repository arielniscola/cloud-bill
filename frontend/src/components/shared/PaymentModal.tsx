import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Banknote, XCircle } from 'lucide-react';
import { Modal, Button, Input, Select, Textarea } from '../ui';
import { cashRegistersService, appSettingsService } from '../../services';
import { PAYMENT_METHOD_OPTIONS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import type { CreateReciboDTO, CashRegister } from '../../types';

const paymentSchema = z.object({
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD']),
  cashRegisterId: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  checkDueDate: z.string().optional().nullable(),
  installments: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateReciboDTO) => Promise<void>;
  remaining: number;
  currency: string;
  isLoading?: boolean;
  defaultCashRegisterId?: string | null;
  title?: string;
}

export function PaymentModal({
  open,
  onClose,
  onSubmit,
  remaining,
  currency,
  isLoading,
  defaultCashRegisterId,
  title = 'Registrar pago',
}: PaymentModalProps) {
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [loadingCR, setLoadingCR] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      amount: remaining,
      paymentMethod: 'CASH',
      cashRegisterId: null,
    },
  });

  const paymentMethod = watch('paymentMethod');

  useEffect(() => {
    if (!open) return;
    reset({
      amount: remaining,
      paymentMethod: 'CASH',
      cashRegisterId: null,
      reference: null,
      bank: null,
      checkDueDate: null,
      installments: null,
      notes: null,
    });
    setLoadingCR(true);
    Promise.all([
      cashRegistersService.getAll(true),
      appSettingsService.get().catch(() => null),
    ])
      .then(([crs, settings]) => {
        setCashRegisters(crs);
        const preferred = defaultCashRegisterId
          || settings?.defaultInvoiceCashRegisterId
          || settings?.defaultBudgetCashRegisterId;
        const found = preferred ? crs.find((c) => c.id === preferred) : null;
        setValue('cashRegisterId', found ? found.id : crs[0]?.id ?? null);
      })
      .finally(() => setLoadingCR(false));
  }, [open]);

  const handleFormSubmit = async (data: PaymentFormData) => {
    await onSubmit({
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      cashRegisterId: data.cashRegisterId || null,
      reference: data.reference || null,
      bank: data.bank || null,
      checkDueDate: data.checkDueDate || null,
      installments: data.installments || null,
      notes: data.notes || null,
    });
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Remaining balance */}
        <div className="flex justify-between items-center py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">Saldo pendiente</span>
          <span className="text-base font-bold text-gray-900 tabular-nums">
            {formatCurrency(remaining, currency)}
          </span>
        </div>

        {/* Amount */}
        <Input
          label="Monto a cobrar"
          type="number"
          step="0.01"
          min="0.01"
          max={remaining}
          {...register('amount')}
          error={errors.amount?.message}
        />

        {/* Payment method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Método de pago</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue('paymentMethod', opt.value as any)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors duration-150 ${
                  paymentMethod === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {errors.paymentMethod && (
            <p className="mt-1 text-xs text-red-600">{errors.paymentMethod.message}</p>
          )}
        </div>

        {/* Cash register */}
        {loadingCR ? (
          <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ) : cashRegisters.length === 0 ? (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              No hay cajas activas.{' '}
              <a href="/cash-registers" className="underline font-medium">Creá una caja</a>.
            </p>
          </div>
        ) : (
          <Select
            label="Caja destino"
            options={cashRegisters.map((cr) => ({ value: cr.id, label: cr.name }))}
            value={watch('cashRegisterId') ?? ''}
            onChange={(val) => setValue('cashRegisterId', val || null)}
          />
        )}

        {/* Conditional fields */}
        {(paymentMethod === 'BANK_TRANSFER') && (
          <>
            <Input
              label="N° de referencia / transferencia"
              placeholder="Opcional"
              {...register('reference')}
            />
            <Input
              label="Banco"
              placeholder="Opcional"
              {...register('bank')}
            />
          </>
        )}

        {paymentMethod === 'CHECK' && (
          <>
            <Input
              label="N° de cheque"
              {...register('reference')}
              error={errors.reference?.message}
            />
            <Input
              label="Banco emisor"
              {...register('bank')}
            />
            <Input
              label="Fecha de vencimiento"
              type="date"
              {...register('checkDueDate')}
            />
          </>
        )}

        {paymentMethod === 'CARD' && (
          <>
            <Input
              label="Últimos 4 dígitos"
              maxLength={4}
              placeholder="1234"
              {...register('reference')}
            />
            <Input
              label="Cuotas"
              type="number"
              min={1}
              defaultValue={1}
              {...register('installments')}
            />
          </>
        )}

        {/* Notes */}
        <Textarea
          label="Notas (opcional)"
          rows={2}
          {...register('notes')}
        />

        <div className="flex justify-end gap-2.5 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={cashRegisters.length === 0}>
            <Banknote className="w-4 h-4 mr-2" />
            Confirmar pago
          </Button>
        </div>
      </form>
    </Modal>
  );
}
