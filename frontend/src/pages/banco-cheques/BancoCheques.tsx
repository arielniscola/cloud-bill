import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle, ChevronDown,
  Landmark, ArrowUpDown, ArrowUp, ArrowDown, Plus, ArrowDownCircle, ArrowUpCircle,
  Trash2, Pencil, BookText, ChevronRight, LogOut,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Select } from '../../components/ui';
import {
  PageHeader, Pagination, BancoSelect, ChequeNumberInput, CustomerSearchSelect, SupplierSearchSelect, SearchInput,
  useBancos, findBancoByName, joinChequeNumber, parseChequeNumber, formatChequeNumber,
} from '../../components/shared';
import { recibosService, customersService, cashRegistersService, bankService, suppliersService } from '../../services';
import chequesService from '../../services/cheques.service';
import chequerasService from '../../services/chequeras.service';
import type { Chequera, CreateChequeraDTO } from '../../types/chequera.types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CHECK_STATUSES, CHECK_STATUS_COLORS } from '../../utils/constants';
import {
  CHEQUE_STATUS_LABELS, CHEQUE_STATUS_COLORS, CHEQUE_NEXT_STATUSES,
  type Cheque, type CreateChequeDTO, type ChequeStatus,
  type ChequeBounceMode, type ChequeBounceOptions, type ChequeBounceResult,
} from '../../types/cheque.types';
import type { Recibo, CheckStatus, Customer, Supplier } from '../../types';
import type { BankAccount } from '../../types/bank.types';
import { apiErrorMessage } from '../../utils/apiError';
import { useAuthStore } from '../../stores';
import { roleAllowed } from '../../utils/roles';
import EgresoCarteraModal from './EgresoCarteraModal';
import EgresosCarteraTab from './EgresosCarteraTab';

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
  { value: 'EGRESADO',  label: 'Egresados'   },
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
  // Egresado de cartera: se revierte anulando el egreso (pestaña "Egresos de cartera").
  EGRESADO: [],
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
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al depositar');
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

/* ── Bounce modal: elegir cómo se documenta el débito ────────────── */
interface BounceTarget {
  kind:       'recibo' | 'cheque';
  id:         string;
  party:      'CUSTOMER' | 'SUPPLIER';
  partyName:  string;
  reference:  string;
  amount:     number;
  currency:   string;
  /** Letra sugerida para la ND de compra (según la condición del proveedor). */
  defaultLetter?: 'A' | 'B' | 'C';
}

function BounceModal({
  target, onClose, onConfirm,
}: {
  target:    BounceTarget;
  onClose:   () => void;
  onConfirm: (opts: ChequeBounceOptions) => Promise<void>;
}) {
  const [mode,   setMode]   = useState<ChequeBounceMode>('INTERNAL_NOTE');
  const [number, setNumber] = useState('');
  const [letter, setLetter] = useState<'A' | 'B' | 'C'>(target.defaultLetter ?? 'A');
  const [saving, setSaving] = useState(false);
  const isSupplier = target.party === 'SUPPLIER';

  const handleConfirm = async () => {
    if (mode === 'DEBIT_NOTE' && isSupplier && !number.trim()) {
      toast.error('Indicá el número de la Nota de Débito del proveedor');
      return;
    }
    setSaving(true);
    try {
      await onConfirm({
        bounceMode: mode,
        ...(mode === 'DEBIT_NOTE' && isSupplier ? { debitNoteNumber: number.trim(), debitNoteLetter: letter } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ value: ChequeBounceMode; title: string; desc: string }> = [
    {
      value: 'INTERNAL_NOTE',
      title: 'Débito interno',
      desc:  'Nota de débito interna (no fiscal) en la cuenta corriente. Se revierte sola si el cheque vuelve a cartera.',
    },
    {
      value: 'DEBIT_NOTE',
      title: 'Nota de Débito',
      desc:  isSupplier
        ? 'Registra la Nota de Débito que te envió el proveedor (comprobante de compra) por el importe del cheque.'
        : 'Emite una Nota de Débito al cliente por el importe del cheque (no gravado). No se envía a ARCA: podés autorizarla después desde el comprobante.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Rechazar cheque</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          {formatChequeNumber(target.reference) || target.reference} · {formatCurrency(target.amount, target.currency as 'ARS' | 'USD')}
          {' · '}{isSupplier ? 'Proveedor' : 'Cliente'}: <span className="font-medium text-gray-700 dark:text-slate-200">{target.partyName}</span>
        </p>

        <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">¿Cómo se debita el importe?</p>
        <div className="space-y-2 mb-4">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                mode === o.value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <input
                type="radio"
                name="bounceMode"
                className="mt-0.5 accent-indigo-600"
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{o.title}</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === 'DEBIT_NOTE' && isSupplier && (
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Letra</label>
              <select
                value={letter}
                onChange={(e) => setLetter(e.target.value as 'A' | 'B' | 'C')}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="A">ND A</option>
                <option value="B">ND B</option>
                <option value="C">ND C</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">N° de la ND del proveedor *</label>
              <input
                autoFocus
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="0001-00001234"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button isLoading={saving} onClick={handleConfirm} className="bg-red-600 hover:bg-red-700">
            Rechazar cheque
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Mensaje de éxito según el documento que generó el rechazo. */
function bounceToast(bounce: ChequeBounceResult | null) {
  switch (bounce?.kind) {
    case 'SALES_DEBIT_NOTE':    toast.success(`Cheque rechazado · Nota de Débito ${bounce.number} emitida (sin enviar a ARCA)`); break;
    case 'PURCHASE_DEBIT_NOTE': toast.success(`Cheque rechazado · Nota de Débito de compra ${bounce.number} cargada`); break;
    case 'INTERNAL_NOTE':       toast.success(`Cheque rechazado · débito interno ${bounce.number ?? ''} generado`.trim()); break;
    case 'REVERSED':            toast.success('Estado actualizado · débito del rechazo revertido'); break;
    default:                    toast.success('Estado actualizado');
  }
}

/** Letra habitual de la ND que manda un proveedor según su condición fiscal. */
function supplierDefaultLetter(taxCondition?: string | null): 'A' | 'B' | 'C' {
  if (taxCondition === 'RESPONSABLE_INSCRIPTO') return 'A';
  if (taxCondition === 'MONOTRIBUTISTA' || taxCondition === 'EXENTO') return 'C';
  return 'B';
}

/* ── Manual cheque form modal ────────────────────────────────────── */
function ChequeFormModal({
  type, customers, suppliers, chequeras, onClose, onCreated,
}: {
  type:      'INGRESO' | 'EGRESO';
  customers: Customer[];
  suppliers: { id: string; name: string }[];
  chequeras: Chequera[];
  onClose:   () => void;
  onCreated: (c: Cheque) => void;
}) {
  const [form, setForm] = useState<CreateChequeDTO>({
    type,
    currency: 'ARS',
    amount: 0,
  });
  const [saving, setSaving] = useState(false);
  const bancos = useBancos();
  const bancoCat = findBancoByName(bancos, form.bank);

  const set = (field: keyof CreateChequeDTO, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Al elegir una chequera (egresos): hereda banco y sugiere el próximo N° de cheque.
  const onChequera = (id: string) => {
    const ch = chequeras.find((c) => c.id === id);
    setForm((prev) => {
      const cat = ch ? findBancoByName(bancos, ch.bank) : null;
      const prevParts = parseChequeNumber(prev.checkNumber);
      const checkNumber = ch && ch.nextNumber != null
        ? joinChequeNumber({
            banco:    cat?.code ?? prevParts.banco,
            sucursal: cat?.sucursal ?? prevParts.sucursal,
            numero:   String(ch.nextNumber),
          })
        : prev.checkNumber;
      return {
        ...prev,
        chequeraId:  id || null,
        bank:        ch ? ch.bank : prev.bank,
        checkNumber,
      };
    });
  };
  const activeChequeras = chequeras.filter((c) => c.isActive);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      const created = await chequesService.create(form);
      onCreated(created);
      toast.success(`Cheque ${type === 'INGRESO' ? 'ingresado' : 'egresado'} correctamente`);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al guardar');
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

          {/* Chequera (solo egresos): autocompleta banco y N° de cheque */}
          {!isIngreso && activeChequeras.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Chequera (talonario propio)</label>
              <select
                value={form.chequeraId ?? ''}
                onChange={(e) => onChequera(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin chequera (manual)</option>
                {activeChequeras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} · ` : ''}{c.bank} — Cta. {c.accountNumber}{c.nextNumber != null ? ` (próx. N° ${c.nextNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Banco + N° cheque */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Banco</label>
              <BancoSelect
                value={form.bank}
                onChange={(v) => set('bank', v)}
                placeholder="Seleccionar banco…"
              />
            </div>
            <ChequeNumberInput
              value={form.checkNumber}
              onChange={(v) => set('checkNumber', v)}
              bancoCode={bancoCat?.code}
              sucursal={bancoCat?.sucursal}
            />
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
              <CustomerSearchSelect
                customers={customers}
                value={form.customerId ?? ''}
                onChange={(id) => set('customerId', id || null)}
                clearLabel="Sin cliente"
                serverSearch
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Proveedor (opcional)</label>
              <SupplierSearchSelect
                suppliers={suppliers}
                value={form.supplierId ?? ''}
                onChange={(id) => set('supplierId', id || null)}
                clearLabel="Sin proveedor"
                serverSearch
              />
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
                  {ch.checkNumber && <p className="text-xs font-mono text-gray-400 dark:text-slate-500">{formatChequeNumber(ch.checkNumber)}</p>}
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

/* ── Chequera form modal ─────────────────────────────────────────── */
function ChequeraFormModal({
  existing, onClose, onSaved,
}: {
  existing: Chequera | null;
  onClose:  () => void;
  onSaved:  () => void;
}) {
  const [form, setForm] = useState<CreateChequeraDTO>({
    name:          existing?.name ?? '',
    bank:          existing?.bank ?? '',
    accountNumber: existing?.accountNumber ?? '',
    numberFrom:    existing?.numberFrom ?? null,
    numberTo:      existing?.numberTo ?? null,
    nextNumber:    existing?.nextNumber ?? null,
    isActive:      existing?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const num = (v: string): number | null => (v === '' ? null : parseInt(v, 10));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bank?.trim()) { toast.error('Indicá el banco'); return; }
    if (!form.accountNumber?.trim()) { toast.error('Indicá el número de cuenta'); return; }
    setSaving(true);
    try {
      if (existing) await chequerasService.update(existing.id, form);
      else          await chequerasService.create(form);
      toast.success(existing ? 'Chequera actualizada' : 'Chequera creada');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelCls = 'block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-5">
          {existing ? 'Editar chequera' : 'Nueva chequera'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Alias / descripción (opcional)</label>
            <input className={inputCls} value={form.name ?? ''} placeholder="Ej: Chequera Galicia operativa"
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Banco *</label>
              <BancoSelect value={form.bank} onChange={(v) => setForm((p) => ({ ...p, bank: v }))} placeholder="Seleccionar banco…" />
            </div>
            <div>
              <label className={labelCls}>N° de cuenta *</label>
              <input className={inputCls} value={form.accountNumber} placeholder="Ej: 1234-5/6"
                onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Desde N°</label>
              <input type="number" className={inputCls} value={form.numberFrom ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, numberFrom: num(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Hasta N°</label>
              <input type="number" className={inputCls} value={form.numberTo ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, numberTo: num(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Próximo N°</label>
              <input type="number" className={inputCls} value={form.nextNumber ?? ''} placeholder="auto"
                onChange={(e) => setForm((p) => ({ ...p, nextNumber: num(e.target.value) }))} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            El "Próximo N°" se usa al emitir un cheque de egreso desde esta chequera y se incrementa solo. Si lo dejás vacío arranca en "Desde N°".
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
            <input type="checkbox" checked={form.isActive ?? true}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Activa
          </label>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" isLoading={saving}>Guardar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Cheques emitidos desde una chequera ─────────────────────────── */
/**
 * Detalle que se despliega debajo de la chequera: los cheques que salieron de
 * ese talonario y —lo que no se veía en ningún lado— a quién se le entregó cada
 * uno y con qué orden de pago.
 */
function ChequeraChequesDetail({ chequeraId, colSpan }: { chequeraId: string; colSpan: number }) {
  const [cheques, setCheques] = useState<Cheque[] | null>(null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    let alive = true;
    chequesService.getAll({ chequeraId, limit: 200 })
      .then((r) => { if (alive) setCheques(r.data); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [chequeraId]);

  const body = () => {
    if (error) return <p className="text-sm text-red-500">No se pudieron cargar los cheques de esta chequera.</p>;
    if (cheques === null) return <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />;
    if (cheques.length === 0) return <p className="text-sm text-gray-400 dark:text-slate-500">Todavía no se emitió ningún cheque de este talonario.</p>;

    return (
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
            <th className="px-3 py-2 text-left">N° cheque</th>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Entregado a</th>
            <th className="px-3 py-2 text-left">Orden de pago</th>
            <th className="px-3 py-2 text-center">Vencimiento</th>
            <th className="px-3 py-2 text-right">Monto</th>
            <th className="px-3 py-2 text-center">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
          {cheques.map((ch) => (
            <tr key={ch.id}>
              <td className="px-3 py-2 font-mono text-gray-700 dark:text-slate-300 whitespace-nowrap">
                {ch.checkNumber ? formatChequeNumber(ch.checkNumber) : ch.number}
              </td>
              <td className="px-3 py-2 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(ch.createdAt)}</td>
              <td className="px-3 py-2 text-gray-800 dark:text-slate-200">
                {ch.supplier?.name ?? ch.beneficiary ?? <span className="text-gray-400 dark:text-slate-500">Sin destinatario</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {ch.ordenPago
                  ? <Link to={`/orden-pagos/${ch.ordenPago.id}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">{ch.ordenPago.number}</Link>
                  : <span className="text-gray-400 dark:text-slate-500">—</span>}
              </td>
              <td className="px-3 py-2 text-center text-gray-600 dark:text-slate-400 whitespace-nowrap">
                {ch.dueDate ? formatDate(ch.dueDate) : '—'}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                {formatCurrency(ch.amount, ch.currency as 'ARS' | 'USD')}
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CHEQUE_STATUS_COLORS[ch.status]}`}>
                  {CHEQUE_STATUS_LABELS[ch.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <tr className="bg-gray-50/60 dark:bg-slate-700/30">
      <td colSpan={colSpan} className="px-5 py-4">
        <div className="overflow-x-auto">{body()}</div>
      </td>
    </tr>
  );
}

/* ── Chequeras tab ───────────────────────────────────────────────── */
function ChequerasTab({
  chequeras, isLoading, onNew, onEdit, onDelete,
}: {
  chequeras: Chequera[];
  isLoading: boolean;
  onNew:     () => void;
  onEdit:    (c: Chequera) => void;
  onDelete:  (c: Chequera) => void;
}) {
  // Chequera desplegada: muestra los cheques que salieron de ese talonario.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">{chequeras.length} chequera{chequeras.length !== 1 ? 's' : ''}</p>
        <Button onClick={onNew}><Plus className="w-4 h-4 mr-2" />Nueva chequera</Button>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}</div>
        ) : chequeras.length === 0 ? (
          <div className="p-12 text-center"><p className="text-gray-400 dark:text-slate-500 text-sm">No hay chequeras. Creá un talonario para numerar los cheques de egreso.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Chequera</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Cheques emitidos</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Banco / Cuenta</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Rango</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Próximo N°</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {chequeras.map((c) => (
                  <Fragment key={c.id}>
                  <tr className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-gray-800 dark:text-slate-200">{c.name || '—'}</td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => setOpenId((prev) => (prev === c.id ? null : c.id))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {openId === c.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {openId === c.id ? 'Ocultar cheques' : 'Ver cheques'}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-gray-700 dark:text-slate-300">{c.bank}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500">Cta. {c.accountNumber}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center text-sm tabular-nums text-gray-600 dark:text-slate-400">
                      {c.numberFrom != null || c.numberTo != null ? `${c.numberFrom ?? '?'} – ${c.numberTo ?? '?'}` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                      {c.nextNumber ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                        {c.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button title="Editar" onClick={() => onEdit(c)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button title="Eliminar" onClick={() => onDelete(c)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {openId === c.id && <ChequeraChequesDetail chequeraId={c.id} colSpan={7} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════════ */
export default function BancoCheques() {
  const navigate = useNavigate();

  // ── Tab state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'cobranzas' | 'ingreso' | 'egreso' | 'egresosCartera' | 'chequeras'>('cobranzas');

  // ── Egreso de cheques en cartera ───────────────────────────────
  const role = useAuthStore((s) => s.user?.role);
  const canEgresar = roleAllowed(role, ['ADMIN', 'FINANCES']);
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresosReloadKey, setEgresosReloadKey] = useState(0);

  // ── Recibos (cobranzas CHECK) state ───────────────────────────
  const [checks,    setChecks]    = useState<Recibo[]>([]);
  const [isLoadingR, setIsLoadingR] = useState(true);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const limit = 50;
  const [totalPages,  setTotalPages]  = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [checkSearch, setCheckSearch] = useState('');
  const [bounceTarget, setBounceTarget] = useState<BounceTarget | null>(null);
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
  const [manualSearch,   setManualSearch]   = useState('');

  // ── Chequeras state ────────────────────────────────────────────
  const [chequeras,        setChequeras]        = useState<Chequera[]>([]);
  const [isLoadingCheq,    setIsLoadingCheq]    = useState(false);
  const [showChequeraForm, setShowChequeraForm] = useState(false);
  const [editingChequera,  setEditingChequera]  = useState<Chequera | null>(null);
  const [deleteChequera,   setDeleteChequera]   = useState<Chequera | null>(null);

  // ── Shared reference data ──────────────────────────────────────
  const [customers,     setCustomers]     = useState<Customer[]>([]);
  const [suppliers,     setSuppliers]     = useState<Supplier[]>([]);
  const [bankAccounts,  setBankAccounts]  = useState<BankAccount[]>([]);
  const [cashRegisters, setCashRegisters] = useState<{ id: string; name: string }[]>([]);

  // ── Load recibos checks ────────────────────────────────────────
  const loadRecibos = useCallback(async () => {
    setIsLoadingR(true);
    try {
      const filters: Record<string, any> = { page, limit };
      if (selectedCustomerId) filters.customerId = selectedCustomerId;
      if (checkSearch.trim()) filters.search = checkSearch.trim();
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
  }, [page, statusFilter, selectedCustomerId, checkSearch]);

  // ── Load manual cheques ────────────────────────────────────────
  const loadManual = useCallback(async (type: 'INGRESO' | 'EGRESO') => {
    setIsLoadingM(true);
    try {
      const result = await chequesService.getAll({ type, limit: 200, search: manualSearch.trim() || undefined });
      setManualCheques(result.data);
      setManualTotal(result.total);
    } catch {
      toast.error('Error al cargar cheques manuales');
    } finally {
      setIsLoadingM(false);
    }
  }, [manualSearch]);

  const loadChequeras = useCallback(async () => {
    setIsLoadingCheq(true);
    try {
      setChequeras(await chequerasService.getAll());
    } catch {
      toast.error('Error al cargar chequeras');
    } finally {
      setIsLoadingCheq(false);
    }
  }, []);

  useEffect(() => { loadRecibos(); }, [loadRecibos]);

  useEffect(() => {
    if (activeTab === 'ingreso') loadManual('INGRESO');
    else if (activeTab === 'egreso') loadManual('EGRESO');
    else if (activeTab === 'chequeras') loadChequeras();
  }, [activeTab, loadManual, loadChequeras]);

  // Chequeras también se cargan al inicio para alimentar el selector de egresos
  useEffect(() => { loadChequeras(); }, [loadChequeras]);

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
    if (status === 'BOUNCED') {
      const recibo = checks.find((c) => c.id === id);
      if (recibo?.customerId) {
        setBounceTarget({
          kind: 'recibo', id, party: 'CUSTOMER',
          partyName: recibo.customer?.name ?? 'Cliente',
          reference: recibo.reference || recibo.number,
          amount:    Number(recibo.amount),
          currency:  recibo.currency ?? 'ARS',
        });
        return;
      }
    }
    await applyReciboStatus(id, status).catch(() => { /* ya avisado */ });
  };

  const applyReciboStatus = async (id: string, status: CheckStatus, bounceMode?: ChequeBounceMode) => {
    setUpdatingId(id);
    try {
      const { data: updated, bounce } = await recibosService.updateCheckStatus(id, status, bounceMode);
      setChecks((prev) => prev.map((c) => (c.id === id ? updated : c)));
      bounceToast(bounce);
    } catch (error) {
      toast.error(apiErrorMessage(error) || 'Error al actualizar');
      throw error;
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Manual cheques actions ─────────────────────────────────────
  const handleManualStatusChange = async (id: string, status: ChequeStatus) => {
    if (status === 'BOUNCED') {
      const ch = manualCheques.find((c) => c.id === id);
      if (ch && (ch.customerId || ch.supplierId)) {
        const supplier = ch.supplierId ? suppliers.find((s) => s.id === ch.supplierId) : undefined;
        setBounceTarget({
          kind: 'cheque', id,
          party:     ch.customerId ? 'CUSTOMER' : 'SUPPLIER',
          partyName: ch.customer?.name ?? ch.supplier?.name ?? supplier?.name ?? '—',
          reference: ch.checkNumber || ch.number,
          amount:    Number(ch.amount),
          currency:  ch.currency ?? 'ARS',
          defaultLetter: supplierDefaultLetter(supplier?.taxCondition),
        });
        return;
      }
    }
    await applyManualStatus(id, status).catch(() => { /* ya avisado */ });
  };

  const applyManualStatus = async (id: string, status: ChequeStatus, bounce?: ChequeBounceOptions) => {
    setUpdatingManId(id);
    try {
      const { data: updated, bounce: result } = await chequesService.updateStatus(id, status, bounce);
      setManualCheques((prev) => prev.map((c) => (c.id === id ? updated : c)));
      bounceToast(result);
    } catch (error) {
      toast.error(apiErrorMessage(error) || 'Error al actualizar');
      throw error;
    } finally {
      setUpdatingManId(null);
    }
  };

  const handleBounceConfirm = async (opts: ChequeBounceOptions) => {
    if (!bounceTarget) return;
    try {
      if (bounceTarget.kind === 'recibo') await applyReciboStatus(bounceTarget.id, 'BOUNCED', opts.bounceMode);
      else await applyManualStatus(bounceTarget.id, 'BOUNCED', opts);
      setBounceTarget(null);
    } catch { /* el error ya se mostró; el modal queda abierto para corregir */ }
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
            <Button variant="outline" onClick={() => {
              if (activeTab === 'cobranzas') loadRecibos();
              else if (activeTab === 'egresosCartera') setEgresosReloadKey((k) => k + 1);
              else if (activeTab === 'chequeras') loadChequeras();
              else loadManual(activeTab === 'ingreso' ? 'INGRESO' : 'EGRESO');
            }}>
              <RefreshCw className="w-4 h-4 mr-2" />Actualizar
            </Button>
            {canEgresar && (
              <Button
                variant="outline"
                onClick={() => setShowEgresoModal(true)}
                className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
              >
                <LogOut className="w-4 h-4 mr-2" />Egresar de cartera
              </Button>
            )}
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
          { key: 'egresosCartera', label: 'Egresos de cartera', icon: LogOut },
          { key: 'chequeras', label: 'Chequeras',           icon: BookText },
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
            <SearchInput
              value={checkSearch}
              onChange={(v) => { setCheckSearch(v); setPage(1); }}
              placeholder="Buscar por N° de cheque…"
              className="w-56 ml-auto"
            />
            <div className="relative w-64">
              <CustomerSearchSelect
                customers={customers}
                value={selectedCustomerId}
                onChange={(id) => { setSelectedCustomerId(id); setPage(1); }}
                clearLabel="Todos los clientes"
                serverSearch
              />
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
            <div className="flex items-center gap-3">
              <SearchInput
                value={manualSearch}
                onChange={setManualSearch}
                placeholder="Buscar por N° de cheque…"
                className="w-56"
              />
              <Button onClick={() => setShowFormType('INGRESO')}>
                <Plus className="w-4 h-4 mr-2" />Nuevo ingreso
              </Button>
            </div>
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
            <div className="flex items-center gap-3">
              <SearchInput
                value={manualSearch}
                onChange={setManualSearch}
                placeholder="Buscar por N° de cheque…"
                className="w-56"
              />
              <Button onClick={() => setShowFormType('EGRESO')}>
                <Plus className="w-4 h-4 mr-2" />Nuevo egreso
              </Button>
            </div>
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

      {/* ── Tab: Egresos de cartera ── */}
      {activeTab === 'egresosCartera' && (
        <EgresosCarteraTab
          reloadKey={egresosReloadKey}
          canCancel={roleAllowed(role, ['ADMIN'])}
          onChanged={() => { loadRecibos(); }}
        />
      )}

      <EgresoCarteraModal
        isOpen={showEgresoModal}
        onClose={() => setShowEgresoModal(false)}
        onDone={() => {
          setShowEgresoModal(false);
          setActiveTab('egresosCartera');
          setEgresosReloadKey((k) => k + 1);
          loadRecibos();
        }}
      />

      {/* ── Tab: Chequeras ── */}
      {activeTab === 'chequeras' && (
        <ChequerasTab
          chequeras={chequeras}
          isLoading={isLoadingCheq}
          onNew={() => { setEditingChequera(null); setShowChequeraForm(true); }}
          onEdit={(c) => { setEditingChequera(c); setShowChequeraForm(true); }}
          onDelete={(c) => setDeleteChequera(c)}
        />
      )}

      {/* ── Modals ── */}
      {bounceTarget && (
        <BounceModal
          target={bounceTarget}
          onClose={() => setBounceTarget(null)}
          onConfirm={handleBounceConfirm}
        />
      )}

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
          chequeras={chequeras}
          onClose={() => setShowFormType(null)}
          onCreated={(created) => {
            setManualCheques((prev) => [created, ...prev]);
            setManualTotal((t) => t + 1);
            // El N° de la chequera pudo avanzar: refrescamos el catálogo.
            if (created.chequeraId) loadChequeras();
          }}
        />
      )}

      {showChequeraForm && (
        <ChequeraFormModal
          existing={editingChequera}
          onClose={() => { setShowChequeraForm(false); setEditingChequera(null); }}
          onSaved={loadChequeras}
        />
      )}

      {deleteChequera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Eliminar chequera</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              ¿Eliminar la chequera {deleteChequera.name ? `"${deleteChequera.name}"` : `de ${deleteChequera.bank}`}? No afecta los cheques ya emitidos.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteChequera(null)}>Cancelar</Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  try {
                    await chequerasService.delete(deleteChequera.id);
                    toast.success('Chequera eliminada');
                    setDeleteChequera(null);
                    loadChequeras();
                  } catch {
                    toast.error('Error al eliminar');
                  }
                }}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
