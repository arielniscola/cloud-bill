import { useState, useEffect } from 'react';
import { X, FileEdit } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { CustomerSearchSelect } from '../../components/shared';
import { internalNotesService, customersService, suppliersService } from '../../services';
import type { CreateInternalNoteDTO, Customer, Supplier, InternalNoteEntity } from '../../types';

interface Props {
  onClose:   () => void;
  onCreated: () => void;
  /** Pre-fill customer (e.g. when opened from CustomerDetailPage) */
  defaultCustomerId?: string;
  /** Pre-fill supplier (e.g. when opened from SupplierDetailPage) */
  defaultSupplierId?: string;
  /** Preselecciona la entidad (sin bloquear) — ej. submenú Compras → SUPPLIER */
  defaultEntity?: InternalNoteEntity;
}

const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700';
const labelCls = 'block text-xs text-gray-500 dark:text-slate-400 mb-1';

export default function CreateInternalNoteModal({ onClose, onCreated, defaultCustomerId, defaultSupplierId, defaultEntity }: Props) {
  const initialEntity: InternalNoteEntity = defaultSupplierId ? 'SUPPLIER' : defaultCustomerId ? 'CUSTOMER' : defaultEntity ?? 'CUSTOMER';
  const [entity, setEntity] = useState<InternalNoteEntity>(initialEntity);

  const [form, setForm] = useState<CreateInternalNoteDTO>({
    type:       'DEBIT',
    customerId: defaultCustomerId ?? null,
    supplierId: defaultSupplierId ?? null,
    currency:   'ARS',
    amount:     0,
    reason:     '',
    notes:      null,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    customersService.getAll({ limit: 50 })
      .then((r) => setCustomers(r.data))
      .catch(() => {});
    suppliersService.getAll({ limit: 500 })
      .then((r) => setSuppliers(r.data))
      .catch(() => {});
  }, []);

  const set = (field: keyof CreateInternalNoteDTO, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const switchEntity = (next: InternalNoteEntity) => {
    if (defaultCustomerId || defaultSupplierId) return;
    setEntity(next);
    setForm((prev) => ({
      ...prev,
      customerId: next === 'CUSTOMER' ? prev.customerId ?? null : null,
      supplierId: next === 'SUPPLIER' ? prev.supplierId ?? null : null,
    }));
  };

  const entityId = entity === 'CUSTOMER' ? form.customerId : form.supplierId;
  const isValid  = !!entityId && form.amount > 0 && form.reason.trim();

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsLoading(true);
    try {
      const payload: CreateInternalNoteDTO = {
        ...form,
        customerId: entity === 'CUSTOMER' ? form.customerId : null,
        supplierId: entity === 'SUPPLIER' ? form.supplierId : null,
      };
      await internalNotesService.create(payload);
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al crear la nota');
    } finally {
      setIsLoading(false);
    }
  };

  const entityLocked = !!(defaultCustomerId || defaultSupplierId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Nueva nota interna
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Entity toggle */}
          {!entityLocked && (
            <div>
              <label className={labelCls}>Aplicar a *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CUSTOMER', 'SUPPLIER'] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => switchEntity(e)}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      entity === e
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-700'
                        : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
                    }`}
                  >
                    {e === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type */}
          <div>
            <label className={labelCls}>Tipo *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['DEBIT', 'CREDIT'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('type', t)}
                  className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    form.type === t
                      ? t === 'DEBIT'
                        ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
                        : 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700'
                      : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
                  }`}
                >
                  {t === 'DEBIT' ? 'Nota de Débito' : 'Nota de Crédito'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
              {entity === 'CUSTOMER'
                ? form.type === 'DEBIT'
                  ? 'Débito: aumenta el saldo que el cliente te debe'
                  : 'Crédito: reduce el saldo que el cliente te debe'
                : form.type === 'DEBIT'
                  ? 'Débito: aumenta el saldo que le debés al proveedor'
                  : 'Crédito: reduce el saldo que le debés al proveedor'}
            </p>
          </div>

          {/* Entity picker */}
          {!entityLocked && entity === 'CUSTOMER' && (
            <div>
              <label className={labelCls}>Cliente *</label>
              <CustomerSearchSelect
                customers={customers}
                value={form.customerId ?? ''}
                onChange={(v) => set('customerId', v || null)}
                placeholder="Buscar cliente..."
                serverSearch
              />
            </div>
          )}
          {!entityLocked && entity === 'SUPPLIER' && (
            <div>
              <label className={labelCls}>Proveedor *</label>
              <select
                className={inputCls}
                value={form.supplierId ?? ''}
                onChange={(e) => set('supplierId', e.target.value || null)}
              >
                <option value="">Seleccionar proveedor…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Currency + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Moneda</label>
              <select className={inputCls} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                <option value="ARS">ARS — Pesos</option>
                <option value="USD">USD — Dólares</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Monto *</label>
              <input
                type="number" min={0} step="0.01"
                className={inputCls + ' text-right'}
                value={form.amount || ''}
                placeholder="0.00"
                onChange={(e) => set('amount', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className={labelCls}>Motivo *</label>
            <input
              className={inputCls}
              placeholder="Ej: Interés por mora, bonificación especial..."
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notas adicionales</label>
            <textarea
              rows={2}
              className={inputCls + ' resize-none'}
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
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={!isValid}
          >
            Crear nota interna
          </Button>
        </div>
      </div>
    </div>
  );
}
