import { useState, useEffect } from 'react';
import { X, Receipt } from 'lucide-react';
import { Button } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import type { PurchaseInvoice, CreatePurchaseInvoiceDTO } from '../../types';

const INVOICE_TYPE_OPTIONS = [
  { value: 'FACTURA_A',       label: 'Factura A' },
  { value: 'FACTURA_B',       label: 'Factura B' },
  { value: 'FACTURA_C',       label: 'Factura C' },
  { value: 'FACTURA_M',       label: 'Factura M' },
  { value: 'NOTA_DEBITO_A',   label: 'Nota Débito A' },
  { value: 'NOTA_DEBITO_B',   label: 'Nota Débito B' },
  { value: 'NOTA_CREDITO_A',  label: 'Nota Crédito A' },
  { value: 'NOTA_CREDITO_B',  label: 'Nota Crédito B' },
  { value: 'RECIBO',          label: 'Recibo' },
  { value: 'OTRO',            label: 'Otro' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'Transferencia bancaria' },
  { value: 'CASH',          label: 'Efectivo' },
  { value: 'CHECK',         label: 'Cheque' },
  { value: 'CARD',          label: 'Tarjeta' },
  { value: 'OTHER',         label: 'Otro' },
];

const TAX_RATE_OPTIONS = [
  { value: 0,    label: 'Exento / 0%' },
  { value: 10.5, label: '10.5%' },
  { value: 21,   label: '21%' },
  { value: 27,   label: '27%' },
];

interface Props {
  isOpen: boolean;
  purchaseId: string;
  currency: string;
  existing?: PurchaseInvoice | null;   // if set → edit mode
  onClose: () => void;
  onSave: (data: CreatePurchaseInvoiceDTO) => Promise<void>;
  isLoading: boolean;
}

const EMPTY: CreatePurchaseInvoiceDTO = {
  number:        '',
  type:          'FACTURA_A',
  subtotal:      0,
  taxRate:       21,
  taxAmount:     0,
  amount:        0,
  dueDate:       null,
  paymentMethod: 'BANK_TRANSFER',
  notes:         null,
};

export function AddPurchaseInvoiceModal({ isOpen, currency, existing, onClose, onSave, isLoading }: Props) {
  const [form, setForm] = useState<CreatePurchaseInvoiceDTO>(EMPTY);

  // Reset / populate when opening
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setForm({
        number:        existing.number,
        type:          existing.type,
        subtotal:      Number(existing.subtotal),
        taxRate:       Number(existing.taxRate),
        taxAmount:     Number(existing.taxAmount),
        amount:        Number(existing.amount),
        dueDate:       existing.dueDate ? existing.dueDate.split('T')[0] : null,
        paymentMethod: existing.paymentMethod,
        notes:         existing.notes,
      });
    } else {
      setForm(EMPTY);
    }
  }, [isOpen, existing]);

  if (!isOpen) return null;

  const set = (field: keyof CreatePurchaseInvoiceDTO, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Auto-recalculate when subtotal or taxRate changes
  const handleSubtotalChange = (val: number) => {
    const taxAmount = val * (form.taxRate / 100);
    setForm((prev) => ({ ...prev, subtotal: val, taxAmount, amount: val + taxAmount }));
  };
  const handleTaxRateChange = (val: number) => {
    const taxAmount = form.subtotal * (val / 100);
    setForm((prev) => ({ ...prev, taxRate: val, taxAmount, amount: prev.subtotal + taxAmount }));
  };
  const handleTotalChange = (val: number) => {
    // back-calculate subtotal from total
    const subtotal  = val / (1 + form.taxRate / 100);
    const taxAmount = val - subtotal;
    setForm((prev) => ({ ...prev, amount: val, subtotal, taxAmount }));
  };

  const isValid = form.number.trim() && form.amount > 0;

  const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700';
  const labelCls = 'block text-xs text-gray-500 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {existing ? 'Editar factura' : 'Agregar factura del proveedor'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Number + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Número de factura *</label>
              <input
                className={inputCls}
                placeholder="0001-00012345"
                value={form.number}
                onChange={(e) => set('number', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Tipo de comprobante *</label>
              <select
                className={inputCls}
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
              >
                {INVOICE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* IVA section */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Neto gravado</label>
              <input
                type="number" min={0} step="0.01"
                className={inputCls + ' text-right'}
                value={form.subtotal || ''}
                placeholder="0.00"
                onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={labelCls}>Alícuota IVA</label>
              <select
                className={inputCls}
                value={form.taxRate}
                onChange={(e) => handleTaxRateChange(parseFloat(e.target.value))}
              >
                {TAX_RATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>IVA $</label>
              <input
                type="number" min={0} step="0.01"
                className={inputCls + ' text-right bg-gray-50 dark:bg-slate-600'}
                value={form.taxAmount ? Number(form.taxAmount).toFixed(2) : ''}
                readOnly
              />
            </div>
          </div>

          {/* Total */}
          <div>
            <label className={labelCls + ' font-semibold text-gray-700 dark:text-slate-300'}>Total *</label>
            <input
              type="number" min={0} step="0.01"
              className={inputCls + ' text-right text-base font-semibold'}
              value={form.amount || ''}
              placeholder="0.00"
              onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)}
            />
            {form.subtotal > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Neto {formatCurrency(form.subtotal, currency)} + IVA {formatCurrency(form.taxAmount, currency)}
              </p>
            )}
          </div>

          {/* Due date + Payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Vencimiento de pago</label>
              <input
                type="date"
                className={inputCls}
                value={form.dueDate ?? ''}
                onChange={(e) => set('dueDate', e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelCls}>Forma de pago</label>
              <select
                className={inputCls}
                value={form.paymentMethod}
                onChange={(e) => set('paymentMethod', e.target.value)}
              >
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notas</label>
            <input
              className={inputCls}
              placeholder="Opcional"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => onSave(form)}
            isLoading={isLoading}
            disabled={!isValid}
          >
            {existing ? 'Guardar cambios' : 'Agregar factura'}
          </Button>
        </div>
      </div>
    </div>
  );
}
