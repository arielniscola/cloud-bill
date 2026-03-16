import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Banknote, XCircle, Info, RefreshCw,
  ArrowLeftRight, CreditCard, FileText, Smartphone, CheckCircle2,
} from 'lucide-react';
import { Modal, Button, Input, Select, Textarea } from '../ui';
import { cashRegistersService, appSettingsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { CreateReciboDTO, CashRegister } from '../../types';

const paymentSchema = z.object({
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  exchangeRate: z.coerce.number().positive('La cotización debe ser mayor a 0').default(1),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CHECK', 'CARD']),
  cashRegisterId: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  checkDueDate: z.string().optional().nullable(),
  installments: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const METHODS: Array<{
  value: PaymentFormData['paymentMethod'];
  label: string;
  icon: React.ReactNode;
}> = [
  { value: 'CASH',          label: 'Efectivo',       icon: <Banknote className="w-4 h-4" /> },
  { value: 'BANK_TRANSFER', label: 'Transferencia',  icon: <ArrowLeftRight className="w-4 h-4" /> },
  { value: 'CARD',          label: 'Tarjeta',        icon: <CreditCard className="w-4 h-4" /> },
  { value: 'MERCADO_PAGO',  label: 'Mercado Pago',   icon: <Smartphone className="w-4 h-4" /> },
  { value: 'CHECK',         label: 'Cheque',         icon: <FileText className="w-4 h-4" /> },
];

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
  const isUSD = currency === 'USD';
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [loadingCR, setLoadingCR] = useState(false);
  const [loadingRate, setLoadingRate] = useState(false);

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
      exchangeRate: 1,
      paymentMethod: 'CASH',
      cashRegisterId: null,
    },
  });

  const paymentMethod = watch('paymentMethod');
  const amount = watch('amount') || 0;
  const exchangeRate = watch('exchangeRate') || 1;
  const arsEquivalent = isUSD ? amount * exchangeRate : 0;
  const afterPayment = Math.max(0, remaining - amount);
  const isFullPayment = amount > 0 && afterPayment === 0;

  const fetchBNARate = async () => {
    setLoadingRate(true);
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
      const data = await res.json();
      if (data?.venta) setValue('exchangeRate', Number(data.venta));
    } catch {
      // leave current value
    } finally {
      setLoadingRate(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    reset({
      amount: remaining,
      exchangeRate: 1,
      paymentMethod: 'CASH',
      cashRegisterId: null,
      reference: null,
      bank: null,
      checkDueDate: null,
      installments: null,
      notes: null,
    });
    setLoadingCR(true);
    Promise.all([cashRegistersService.getAll(true), appSettingsService.get().catch(() => null)])
      .then(([crs, settings]) => {
        setCashRegisters(crs);
        const preferred = defaultCashRegisterId
          || settings?.defaultInvoiceCashRegisterId
          || settings?.defaultBudgetCashRegisterId;
        const found = preferred ? crs.find((c: CashRegister) => c.id === preferred) : null;
        setValue('cashRegisterId', found ? found.id : crs[0]?.id ?? null);
      })
      .finally(() => setLoadingCR(false));
    if (isUSD) fetchBNARate();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormSubmit = async (data: PaymentFormData) => {
    await onSubmit({
      amount: data.amount,
      exchangeRate: isUSD ? data.exchangeRate : undefined,
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
    <Modal isOpen={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">

        {/* ── Balance summary card ── */}
        <div className="rounded-xl bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-600">
            <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Saldo pendiente</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {formatCurrency(remaining, currency)}
            </span>
          </div>
          {amount > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {isFullPayment ? 'Pago completo' : 'Saldo después del pago'}
              </span>
              {isFullPayment ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Cancelado
                </span>
              ) : (
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatCurrency(afterPayment, currency)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Exchange rate (USD only) ── */}
        {isUSD && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
                Cotización Banco Nación (venta)
              </span>
              <button
                type="button"
                onClick={fetchBNARate}
                disabled={loadingRate}
                className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loadingRate ? 'animate-spin' : ''}`} />
                {loadingRate ? 'Consultando...' : 'Actualizar'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">$</span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                {...register('exchangeRate')}
                error={errors.exchangeRate?.message}
              />
              <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">ARS/USD</span>
            </div>
            {amount > 0 && exchangeRate > 0 && (
              <div className="flex justify-between items-center pt-1 border-t border-indigo-200 dark:border-indigo-700">
                <span className="text-xs text-indigo-700 dark:text-indigo-300">
                  {formatCurrency(amount, 'USD')} × {exchangeRate.toLocaleString('es-AR')}
                </span>
                <span className="text-sm font-bold text-indigo-800 dark:text-indigo-200 tabular-nums">
                  = {formatCurrency(arsEquivalent, 'ARS')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Amount ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {isUSD ? 'Monto a cobrar (USD)' : 'Monto a cobrar'}
            </label>
            {amount !== remaining && remaining > 0 && (
              <button
                type="button"
                onClick={() => setValue('amount', remaining)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium transition-colors"
              >
                Cobrar total
              </button>
            )}
          </div>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max={remaining}
            {...register('amount')}
            error={errors.amount?.message}
          />
        </div>

        {/* ── Payment method ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            Método de pago
          </label>
          <div className="grid grid-cols-5 gap-2">
            {METHODS.map((m) => {
              const active = paymentMethod === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setValue('paymentMethod', m.value)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-xs font-medium border transition-all duration-150 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40'
                      : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Cash register ── */}
        {loadingCR ? (
          <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
        ) : cashRegisters.length === 0 ? (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-400">
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

        {/* ── Mercado Pago notice ── */}
        {paymentMethod === 'MERCADO_PAGO' && (
          <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-400">
              Las transferencias de Mercado Pago se registran bajo <strong>Cuenta Corriente</strong> a efectos contables.
            </p>
          </div>
        )}

        {/* ── Conditional fields ── */}
        {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'MERCADO_PAGO') && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="N° de referencia"
              placeholder="Opcional"
              {...register('reference')}
            />
            {paymentMethod === 'BANK_TRANSFER' && (
              <Input
                label="Banco"
                placeholder="Opcional"
                {...register('bank')}
              />
            )}
          </div>
        )}

        {paymentMethod === 'CHECK' && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="N° de cheque"
              {...register('reference')}
              error={errors.reference?.message}
            />
            <Input
              label="Banco emisor"
              {...register('bank')}
            />
            <div className="col-span-2">
              <Input
                label="Fecha de vencimiento"
                type="date"
                {...register('checkDueDate')}
              />
            </div>
          </div>
        )}

        {paymentMethod === 'CARD' && (
          <div className="grid grid-cols-2 gap-3">
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
          </div>
        )}

        {/* ── Notes ── */}
        <Textarea
          label="Notas (opcional)"
          rows={2}
          {...register('notes')}
        />

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-1 border-t border-gray-100 dark:border-slate-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1 justify-center">
            Cancelar
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={cashRegisters.length === 0} className="flex-2 justify-center flex-1">
            <Banknote className="w-4 h-4 mr-2" />
            Confirmar pago
          </Button>
        </div>

      </form>
    </Modal>
  );
}
