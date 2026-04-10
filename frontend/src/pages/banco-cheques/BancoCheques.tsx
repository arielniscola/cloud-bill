import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle, ChevronDown,
  Landmark, ArrowUpDown, ArrowUp, ArrowDown, Plus, ArrowDownCircle, ArrowUpCircle,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Select } from '../../components/ui';
import { PageHeader, SearchInput, Pagination } from '../../components/shared';
import { recibosService, customersService, cashRegistersService, bankService, suppliersService } from '../../services';
import chequesService from '../../services/cheques.service';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CHECK_STATUSES, CHECK_STATUS_COLORS } from '../../utils/constants';
import {
  CHEQUE_STATUS_LABELS, CHEQUE_STATUS_COLORS, CHEQUE_NEXT_STATUSES,
  type Cheque, type CreateChequeDTO, type ChequeStatus,
} from '../../types/cheque.types';
import type { Recibo, CheckStatus, Customer } from '../../types';
import type { BankAccount } from '../../types/bank.types';

/* ── helpers ─────────────────────────────────────────────────────── */
function isOverdue(recibo: Recibo): boolean {
  if (!recibo.checkDueDate) return false;
  if (recibo.checkStatus !== 'PENDING') return false;
  return new Date(recibo.checkDueDate) < new Date();
}

type StatusFilter = CheckStatus | 'ALL' | 'OVERDUE';

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL',       label: 'Todos'       },
  { value: 'OVERDUE',   label: 'Vencidos'    },
  { value: 'PENDING',   label: 'En cartera'  },
  { value: 'DEPOSITED', label: 'Depositados' },
  { value: 'CLEARED',   label: 'Acreditados' },
  { value: 'BOUNCED',   label: 'Rechazados'  },
  { value: 'RETURNED',  label: 'Devueltos'   },
];

const NEXT_STATUSES: Record<string, Array<{ value: CheckStatus; label: string }>> = {
  PENDING:   [
    { value: 'DEPOSITED', label: 'Marcar como depositado' },
    { value: 'RETURNED',  label: 'Devolver al cliente'    },
    { value: 'BOUNCED',   label: 'Marcar como rechazado'  },
  ],
  DEPOSITED: [
    { value: 'CLEARED', label: 'Marcar como acreditado' },
    { value: 'BOUNCED', label: 'Marcar como rechazado'  },
  ],
  CLEARED: [],
  BOUNCED: [{ value: 'PENDING', label: 'Volver a cartera' }],
  RETURNED: [{ value: 'PENDING', label: 'Volver a cartera' }],
};

/* ── Deposit modal (recibos) ─────────────────────────────────────── */
function DepositModal({
  recibo, bankAccounts, cashRegisters, onClose, onDeposited,
}: {
  recibo: Recibo;
  bankAccounts: BankAccount[];
  cashRegisters: { id: string; name: string }[];
  onClose: () => void;
  onDeposited: (updated: Recibo) => void;
}) {
  const [dest,   setDest]   = useState<'BANK' | 'CASH'>('BANK');
  const [bankId, setBankId] = useState('');
  const [cashId, setCashId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (dest === 'BANK' && !bankId) { toast.error('Seleccioná una cuenta bancaria'); return; }
    if (dest === 'CASH' && !cashId) { toast.error('Seleccioná una caja');            return; }
    setSaving(true);
    try {
      if (dest === 'BANK') {
        await bankService.depositCheck(bankId, recibo.id);
      } else {
        await recibosService.depositCheckToCash(recibo.id, cashId);
      }
      const updated = await recibosService.findById(recibo.id);
      onDeposited(updated);
      toast.success('Cheque depositado');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al depositar');
    } finally {
      setSaving(false);
    }
  };

  const bankOptions = bankAccounts.map(b => ({ value: b.id, label: `${b.name} — ${b.bank}` }));
  const cashOptions = cashRegisters.map(c => ({ value: c.id, label: c.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Depositar cheque</h2>
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
          {recibo.number} · {formatCurrency(Number(recibo.amount), recibo.currency as 'ARS' | 'USD')}
        </p>
        <div className="flex gap-2 mb-4">
          {(['BANK', 'CASH'] as const).map((d) => (
            <button key={d} onClick={() => setDest(d)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                dest === d
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {d === 'BANK' ? <><Landmark className="w-4 h-4" />Cuenta bancaria</> : <><RefreshCw className="w-4 h-4" />Caja</>}
            </button>
          ))}
        </div>
        {dest === 'BANK' && (
          bankOptions.length > 0
            ? <Select label="Cuenta bancaria" value={bankId} onChange={setBankId} options={[{ value: '', label: 'Seleccionar...' }, ...bankOptions]} />
            : <p className="text-xs text-amber-600 dark:text-amber-400">No hay cuentas bancarias. <a href="/banks" className="underline">Crear una</a></p>
        )}
        {dest === 'CASH' && (
          cashOptions.length > 0
            ? <Select label="Caja" value={cashId} onChange={setCashId} options={[{ value: '', label: 'Seleccionar...' }, ...cashOptions]} />
            : <p className="text-xs text-amber-600 dark:text-amber-400">No hay cajas disponibles.</p>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button isLoading={saving} onClick={handleConfirm}>Depositar</Button>
        </div>
      </div>
    </div>
  );
}

/* ── Manual cheque form modal ────────────────────────────────────── */
function ChequeFormModal({
  type, customers, suppliers, onClose, onCreated,
}: {
  type:      'INGRESO' | 'EGRESO';
  customers: Customer[];
  suppliers: { id: string; name: string }[];
  onClose:   () => void;
  onCreated: (c: Cheque) => void;
}) {
  const [form, setForm] = useState<CreateChequeDTO>({
    type,
    currency: 'ARS',
    amount: 0,
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof CreateChequeDTO, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      const created = await chequesService.create(form);
      onCreated(created);
      toast.success(`Cheque ${type === 'INGRESO' ? 'ingresado' : 'egresado'} correctamente`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const isIngreso = type === 'INGRESO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {isIngreso
            ? <ArrowDownCircle className="w-6 h-6 text-emerald-500" />
            : <ArrowUpCircle   className="w-6 h-6 text-red-500" />
          }
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {isIngreso ? 'Ingreso de cheque' : 'Egreso de cheque'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Monto + Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                Monto <span className="text-red-500">*</span>
              </label>
              <input
                type="number" step="0.01" min="0" required
                value={form.amount || ''}
                onChange={(e) => set('amount', parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Moneda</label>
              <select
                value={form.currency ?? 'ARS'}
                onChange={(e) => set('currency', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* N° cheque + Banco */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">N° de cheque</label>
              <input
                type="text"
                value={form.checkNumber ?? ''}
                onChange={(e) => set('checkNumber', e.target.value)}
                placeholder="Ej: 00012345"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Banco</label>
              <input
                type="text"
                value={form.bank ?? ''}
                onChange={(e) => set('bank', e.target.value)}
                placeholder="Ej: Galicia, Santander…"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Vencimiento */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Fecha de vencimiento</label>
            <input
              type="date"
              value={form.dueDate ?? ''}
              onChange={(e) => set('dueDate', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Librador / Beneficiario */}
          {isIngreso ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Librador (quien firma el cheque)</label>
              <input
                type="text"
                value={form.issuer ?? ''}
                onChange={(e) => set('issuer', e.target.value)}
                placeholder="Nombre del emisor"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Beneficiario (a quien se paga)</label>
              <input
                type="text"
                value={form.beneficiary ?? ''}
                onChange={(e) => set('beneficiary', e.target.value)}
                placeholder="Nombre del beneficiario"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Vinculación opcional */}
          {isIngreso ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Cliente (opcional)</label>
              <select
                value={form.customerId ?? ''}
                onChange={(e) => set('customerId', e.target.value || null)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin cliente</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Proveedor (opcional)</label>
              <select
                value={form.supplierId ?? ''}
                onChange={(e) => set('supplierId', e.target.value || null)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Observaciones</label>
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" isLoading={saving}>Guardar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Manual cheques table ────────────────────────────────────────── */
function ManualChequesTab({
  cheques, isLoading, onStatusChange, onDelete, updatingId,
}: {
  cheques:      Cheque[];
  isLoading:    boolean;
  onStatusChange: (id: string, status: ChequeStatus) => void;
  onDelete:     (id: string) => void;
  updatingId:   string | null;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos,    setMenuPos]    = useState<{ top: number; right: number } | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  if (isLoading) {
    return (
      <div className="p-8 space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
      </div>
    );
  }

  if (cheques.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-400 dark:text-slate-500 text-sm">No hay cheques manuales</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">N° / Fecha</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Banco / N° cheque</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Librador / Beneficiario</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Vinculado</th>
            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Monto</th>
            <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Vencimiento</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Estado</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
          {cheques.map((ch) => {
            const overdue = ch.status === 'PENDING' && ch.dueDate && new Date(ch.dueDate) < new Date();
            const nextActions = CHEQUE_NEXT_STATUSES[ch.status] ?? [];
            const isUpdating = updatingId === ch.id;

            return (
              <tr key={ch.id} className={`hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}>
                <td className="px-5 py-3.5">
                  <p className="text-sm font-mono font-medium text-gray-700 dark:text-slate-200">{ch.number}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(ch.createdAt)}</p>
                </td>

                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                    ch.type === 'INGRESO'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {ch.type === 'INGRESO'
                      ? <ArrowDownCircle className="w-3 h-3" />
                      : <ArrowUpCircle   className="w-3 h-3" />
                    }
                    {ch.type}
                  </span>
                </td>

                <td className="px-5 py-3.5">
                  <p className="text-sm text-gray-700 dark:text-slate-300">{ch.bank ?? '—'}</p>
                  {ch.checkNumber && <p className="text-xs font-mono text-gray-400 dark:text-slate-500">{ch.checkNumber}</p>}
                </td>

                <td className="px-5 py-3.5">
                  <p className="text-sm text-gray-700 dark:text-slate-300">
                    {ch.type === 'INGRESO' ? (ch.issuer ?? '—') : (ch.beneficiary ?? '—')}
                  </p>
                </td>

                <td className="px-5 py-3.5">
                  {ch.customer
                    ? <p className="text-xs text-indigo-600 dark:text-indigo-400">{ch.customer.name}</p>
                    : ch.supplier
                    ? <p className="text-xs text-indigo-600 dark:text-indigo-400">{ch.supplier.name}</p>
                    : <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                  }
                </td>

                <td className="px-5 py-3.5 text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(ch.amount, ch.currency as 'ARS' | 'USD')}
                  </p>
                </td>

                <td className="px-5 py-3.5 text-center">
                  {ch.dueDate ? (
                    <span className={`text-sm font-medium tabular-nums ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-slate-300'}`}>
                      {overdue && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                      {formatDate(ch.dueDate)}
                    </span>
                  ) : (
                    <span className="text-gray-300 dark:text-slate-600">—</span>
                  )}
                </td>

                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${CHEQUE_STATUS_COLORS[ch.status]}`}>
                    {CHEQUE_STATUS_LABELS[ch.status]}
                  </span>
                </td>

                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 justify-end">
                    {nextActions.length > 0 && (
                      <div className="relative">
                        <Button
                          variant="outline" size="sm" isLoading={isUpdating}
                          ref={(el) => {
                            if (el) buttonRefs.current.set(ch.id, el);
                            else     buttonRefs.current.delete(ch.id);
                          }}
                          onClick={() => {
                            if (openMenuId === ch.id) { setOpenMenuId(null); setMenuPos(null); return; }
                            const btn = buttonRefs.current.get(ch.id);
                            if (btn) {
                              const rect = btn.getBoundingClientRect();
                              setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                            }
                            setOpenMenuId(ch.id);
                          }}
                        >
                          Acción <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                        </Button>
                        {openMenuId === ch.id && menuPos && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => { setOpenMenuId(null); setMenuPos(null); }} />
                            <div
                              style={{ top: menuPos.top, right: menuPos.right }}
                              className="fixed bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 min-w-52 py-1"
                            >
                              {nextActions.map((action) => (
                                <button
                                  key={action.value}
                                  onClick={() => { setOpenMenuId(null); setMenuPos(null); onStatusChange(ch.id, action.value); }}
                                  className={`flex w-full items-center text-left px-4 py-2.5 text-sm transition-colors ${
                                    action.value === 'BOUNCED'
                                      ? 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                      : action.value === 'CLEARED'
                                      ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <button
                      title="Eliminar"
                      onClick={() => onDelete(ch.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════════ */
export default function BancoCheques() {
  const navigate = useNavigate();

  // ── Tab state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'cobranzas' | 'ingreso' | 'egreso'>('cobranzas');

  // ── Recibos (cobranzas CHECK) state ───────────────────────────
  const [checks,    setChecks]    = useState<Recibo[]>([]);
  const [isLoadingR, setIsLoadingR] = useState(true);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const limit = 50;
  const [totalPages,  setTotalPages]  = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);
  const [openMenuId,  setOpenMenuId]  = useState<string | null>(null);
  const [menuPos,     setMenuPos]     = useState<{ top: number; right: number } | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [depositRecibo, setDepositRecibo] = useState<Recibo | null>(null);
  const [sortField, setSortField] = useState<'createdAt' | 'checkDueDate'>('createdAt');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');

  // ── Manual cheques state ───────────────────────────────────────
  const [manualCheques,  setManualCheques]  = useState<Cheque[]>([]);
  const [isLoadingM,     setIsLoadingM]     = useState(false);
  const [manualTotal,    setManualTotal]    = useState(0);
  const [updatingManId,  setUpdatingManId]  = useState<string | null>(null);
  const [showFormType,   setShowFormType]   = useState<'INGRESO' | 'EGRESO' | null>(null);

  // ── Shared reference data ──────────────────────────────────────
  const [customers,     setCustomers]     = useState<Customer[]>([]);
  const [suppliers,     setSuppliers]     = useState<{ id: string; name: string }[]>([]);
  const [bankAccounts,  setBankAccounts]  = useState<BankAccount[]>([]);
  const [cashRegisters, setCashRegisters] = useState<{ id: string; name: string }[]>([]);

  // ── Load recibos checks ────────────────────────────────────────
  const loadRecibos = useCallback(async () => {
    setIsLoadingR(true);
    try {
      const filters: Record<string, any> = { page, limit };
      if (selectedCustomerId) filters.customerId = selectedCustomerId;
      if (statusFilter === 'OVERDUE') {
        filters.checkStatus = 'PENDING';
        filters.dueDateTo = new Date().toISOString();
      } else if (statusFilter !== 'ALL') {
        filters.checkStatus = statusFilter;
      }
      const result = await recibosService.getChecks(filters);
      let data = result.data;
      if (statusFilter === 'OVERDUE') data = data.filter(isOverdue);
      setChecks(data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('Error al cargar cheques');
    } finally {
      setIsLoadingR(false);
    }
  }, [page, statusFilter, selectedCustomerId]);

  // ── Load manual cheques ────────────────────────────────────────
  const loadManual = useCallback(async (type: 'INGRESO' | 'EGRESO') => {
    setIsLoadingM(true);
    try {
      const result = await chequesService.getAll({ type, limit: 200 });
      setManualCheques(result.data);
      setManualTotal(result.total);
    } catch {
      toast.error('Error al cargar cheques manuales');
    } finally {
      setIsLoadingM(false);
    }
  }, []);

  useEffect(() => { loadRecibos(); }, [loadRecibos]);

  useEffect(() => {
    if (activeTab === 'ingreso') loadManual('INGRESO');
    else if (activeTab === 'egreso') loadManual('EGRESO');
  }, [activeTab, loadManual]);

  useEffect(() => {
    customersService.getAll({ limit: 1000, isActive: true }).then((r) => setCustomers(r.data)).catch(() => {});
    bankService.getAll().then(setBankAccounts).catch(() => {});
    cashRegistersService.getAll(true).then((r: any[]) => setCashRegisters(r.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
    suppliersService.getAll({ limit: 1000 }).then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);

  // ── Recibos actions ────────────────────────────────────────────
  const handleUpdateStatus = async (id: string, status: CheckStatus) => {
    setOpenMenuId(null);
    if (status === 'DEPOSITED') {
      const recibo = checks.find((c) => c.id === id);
      if (recibo) setDepositRecibo(recibo);
      return;
    }
    setUpdatingId(id);
    try {
      const updated = await recibosService.updateCheckStatus(id, status);
      setChecks((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success(`Estado actualizado`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Manual cheques actions ─────────────────────────────────────
  const handleManualStatusChange = async (id: string, status: ChequeStatus) => {
    setUpdatingManId(id);
    try {
      const updated = await chequesService.updateStatus(id, status);
      setManualCheques((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success(`Estado actualizado`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar');
    } finally {
      setUpdatingManId(null);
    }
  };

  const handleManualDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cheque?')) return;
    try {
      await chequesService.delete(id);
      setManualCheques((prev) => prev.filter((c) => c.id !== id));
      toast.success('Cheque eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // ── Sort (cobranzas) ───────────────────────────────────────────
  const toggleSort = (field: 'createdAt' | 'checkDueDate') => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir(field === 'createdAt' ? 'desc' : 'asc'); }
  };

  const sortedChecks = [...checks].sort((a, b) => {
    const vA = a[sortField] ?? '', vB = b[sortField] ?? '';
    if (!vA && !vB) return 0;
    if (!vA) return sortDir === 'asc' ? -1 : 1;
    if (!vB) return sortDir === 'asc' ? 1 : -1;
    const cmp = vA < vB ? -1 : vA > vB ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ── Summary counts ─────────────────────────────────────────────
  const pending   = checks.filter((c) => c.checkStatus === 'PENDING').length;
  const overdue   = checks.filter(isOverdue).length;
  const deposited = checks.filter((c) => c.checkStatus === 'DEPOSITED').length;
  const cleared   = checks.filter((c) => c.checkStatus === 'CLEARED').length;
  const bounced   = checks.filter((c) => c.checkStatus === 'BOUNCED').length;

  return (
    <div>
      <PageHeader
        title="Banco de Cheques"
        subtitle="Gestión de cheques recibidos y emitidos"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => activeTab === 'cobranzas' ? loadRecibos() : loadManual(activeTab === 'ingreso' ? 'INGRESO' : 'EGRESO')}>
              <RefreshCw className="w-4 h-4 mr-2" />Actualizar
            </Button>
            <Button
              variant="outline"
              onClick={() => { setActiveTab('ingreso'); setShowFormType('INGRESO'); }}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              <ArrowDownCircle className="w-4 h-4 mr-2" />Ingreso
            </Button>
            <Button
              variant="outline"
              onClick={() => { setActiveTab('egreso'); setShowFormType('EGRESO'); }}
              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <ArrowUpCircle className="w-4 h-4 mr-2" />Egreso
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'En cartera', value: pending,   icon: Clock,        color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Vencidos',   value: overdue,   icon: AlertTriangle, color: 'text-red-600 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Depositados',value: deposited, icon: RefreshCw,    color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Acreditados',value: cleared,   icon: CheckCircle,  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Rechazados', value: bounced,   icon: XCircle,      color: 'text-red-700 dark:text-red-500',       bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-3`}>
            <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
            <div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-slate-700">
        {([
          { key: 'cobranzas', label: 'Cobranzas (recibos)', icon: Clock },
          { key: 'ingreso',   label: 'Ingresos manuales',   icon: ArrowDownCircle },
          { key: 'egreso',    label: 'Egresos manuales',    icon: ArrowUpCircle   },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Tab: Cobranzas ── */}
      {activeTab === 'cobranzas' && (
        <>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="relative ml-auto">
              <select
                className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-48"
                value={selectedCustomerId}
                onChange={(e) => { setSelectedCustomerId(e.target.value); setPage(1); }}
              >
                <option value="">Todos los clientes</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {isLoadingR ? (
              <div className="p-8 space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
              </div>
            ) : sortedChecks.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 dark:text-slate-500 text-sm">No hay cheques para mostrar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                        <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-slate-200">
                          N° Recibo
                          {sortField === 'createdAt' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                        </button>
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Banco</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">N° Cheque</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Monto</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                        <button onClick={() => toggleSort('checkDueDate')} className="flex items-center gap-1 mx-auto hover:text-gray-700 dark:hover:text-slate-200">
                          Vencimiento
                          {sortField === 'checkDueDate' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                        </button>
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Origen</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {sortedChecks.map((check) => {
                      const overdueFlag = isOverdue(check);
                      const nextActions = check.checkStatus ? NEXT_STATUSES[check.checkStatus] ?? [] : [];
                      const isUpdating = updatingId === check.id;

                      return (
                        <tr key={check.id} className={`hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors ${overdueFlag ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}>
                          <td className="px-5 py-3.5">
                            <button onClick={() => navigate(`/recibos/${check.id}`)} className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                              {check.number}
                            </button>
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(check.date)}</p>
                          </td>
                          <td className="px-5 py-3.5"><p className="text-sm font-medium text-gray-900 dark:text-white">{check.customer?.name ?? '—'}</p></td>
                          <td className="px-5 py-3.5"><p className="text-sm text-gray-700 dark:text-slate-300">{check.bank ?? '—'}</p></td>
                          <td className="px-5 py-3.5"><p className="text-sm font-mono text-gray-700 dark:text-slate-300">{check.reference ?? '—'}</p></td>
                          <td className="px-5 py-3.5 text-right">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(check.amount, check.currency)}</p>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {check.checkDueDate ? (
                              <span className={`text-sm font-medium tabular-nums ${overdueFlag ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-slate-300'}`}>
                                {overdueFlag && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                                {formatDate(check.checkDueDate)}
                              </span>
                            ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {check.invoice && <button onClick={() => navigate(`/invoices/${check.invoice!.id}`)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono">{check.invoice.number}</button>}
                            {check.budget && <button onClick={() => navigate(`/budgets/${check.budget!.id}`)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono">{check.budget.number}</button>}
                            {check.ordenPedido && <button onClick={() => navigate(`/orden-pedidos/${check.ordenPedido!.id}`)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono">{check.ordenPedido.number}</button>}
                            {!check.invoice && !check.budget && !check.ordenPedido && <span className="text-xs text-gray-400 dark:text-slate-500">Directo</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {check.checkStatus ? (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${CHECK_STATUS_COLORS[check.checkStatus]}`}>
                                {CHECK_STATUSES[check.checkStatus as keyof typeof CHECK_STATUSES] ?? check.checkStatus}
                              </span>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {nextActions.length > 0 && (
                              <div className="relative">
                                <Button variant="outline" size="sm" isLoading={isUpdating}
                                  ref={(el) => { if (el) buttonRefs.current.set(check.id, el); else buttonRefs.current.delete(check.id); }}
                                  onClick={() => {
                                    if (openMenuId === check.id) { setOpenMenuId(null); setMenuPos(null); return; }
                                    const btn = buttonRefs.current.get(check.id);
                                    if (btn) { const rect = btn.getBoundingClientRect(); setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right }); }
                                    setOpenMenuId(check.id);
                                  }}
                                >
                                  Acción <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                                </Button>
                                {openMenuId === check.id && menuPos && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => { setOpenMenuId(null); setMenuPos(null); }} />
                                    <div style={{ top: menuPos.top, right: menuPos.right }} className="fixed bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 min-w-52 py-1">
                                      {nextActions.map((action) => (
                                        <button key={action.value} onClick={() => handleUpdateStatus(check.id, action.value)}
                                          className={`flex w-full items-center text-left px-4 py-2.5 text-sm transition-colors ${
                                            action.value === 'BOUNCED' ? 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' :
                                            action.value === 'CLEARED' ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' :
                                            'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                                          }`}
                                        >
                                          {action.label}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} limit={limit} total={total} onPageChange={setPage} onLimitChange={() => {}} />
            </div>
          )}
        </>
      )}

      {/* ── Tab: Ingresos manuales ── */}
      {activeTab === 'ingreso' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500 dark:text-slate-400">{manualTotal} cheque{manualTotal !== 1 ? 's' : ''} registrado{manualTotal !== 1 ? 's' : ''}</p>
            <Button onClick={() => setShowFormType('INGRESO')}>
              <Plus className="w-4 h-4 mr-2" />Nuevo ingreso
            </Button>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <ManualChequesTab
              cheques={manualCheques}
              isLoading={isLoadingM}
              onStatusChange={handleManualStatusChange}
              onDelete={handleManualDelete}
              updatingId={updatingManId}
            />
          </div>
        </>
      )}

      {/* ── Tab: Egresos manuales ── */}
      {activeTab === 'egreso' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500 dark:text-slate-400">{manualTotal} cheque{manualTotal !== 1 ? 's' : ''} registrado{manualTotal !== 1 ? 's' : ''}</p>
            <Button onClick={() => setShowFormType('EGRESO')}>
              <Plus className="w-4 h-4 mr-2" />Nuevo egreso
            </Button>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <ManualChequesTab
              cheques={manualCheques}
              isLoading={isLoadingM}
              onStatusChange={handleManualStatusChange}
              onDelete={handleManualDelete}
              updatingId={updatingManId}
            />
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {depositRecibo && (
        <DepositModal
          recibo={depositRecibo}
          bankAccounts={bankAccounts}
          cashRegisters={cashRegisters}
          onClose={() => setDepositRecibo(null)}
          onDeposited={(updated) => {
            setChecks((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setDepositRecibo(null);
          }}
        />
      )}

      {showFormType && (
        <ChequeFormModal
          type={showFormType}
          customers={customers}
          suppliers={suppliers}
          onClose={() => setShowFormType(null)}
          onCreated={(created) => {
            setManualCheques((prev) => [created, ...prev]);
            setManualTotal((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
