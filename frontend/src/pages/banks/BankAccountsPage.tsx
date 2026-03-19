import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Landmark, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { bankService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { BankAccount, CreateBankAccountDTO } from '../../types';

const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'Pesos (ARS)' },
  { value: 'USD', label: 'Dólares (USD)' },
];

function AccountFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: BankAccount;
  onSave: (data: CreateBankAccountDTO) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateBankAccountDTO>({
    name:          initial?.name          ?? '',
    bank:          initial?.bank          ?? '',
    accountNumber: initial?.accountNumber ?? '',
    currency:      initial?.currency      ?? 'ARS',
  });
  const [saving, setSaving] = useState(false);
  const set = (f: keyof CreateBankAccountDTO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          {initial ? 'Editar cuenta' : 'Nueva cuenta bancaria'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nombre de la cuenta *" value={form.name} onChange={set('name')} required />
          <Input label="Banco *" value={form.bank} onChange={set('bank')} required placeholder="Ej: Banco Nación" />
          <Input label="N° de cuenta / CBU" value={form.accountNumber ?? ''} onChange={set('accountNumber')} />
          <Select
            label="Moneda"
            value={form.currency ?? 'ARS'}
            onChange={v => setForm(p => ({ ...p, currency: v }))}
            options={CURRENCY_OPTIONS}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" isLoading={saving}>{initial ? 'Guardar' : 'Crear'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BankAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts]     = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [showForm,  setShowForm]    = useState(false);
  const [editing,   setEditing]     = useState<BankAccount | undefined>();
  const [deleteId,  setDeleteId]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try { setAccounts(await bankService.getAll()); }
    catch { toast.error('Error al cargar cuentas'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: CreateBankAccountDTO) => {
    try {
      if (editing) {
        const updated = await bankService.update(editing.id, data);
        setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));
        toast.success('Cuenta actualizada');
      } else {
        const created = await bankService.create(data);
        setAccounts(prev => [...prev, created]);
        toast.success('Cuenta creada');
      }
      setShowForm(false);
      setEditing(undefined);
    } catch {
      toast.error('Error al guardar');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await bankService.delete(deleteId);
      setAccounts(prev => prev.filter(a => a.id !== deleteId));
      toast.success('Cuenta eliminada');
    } catch {
      toast.error('Error al eliminar');
    } finally { setDeleteId(null); }
  };

  const totalARS = accounts.filter(a => a.isActive && a.currency === 'ARS').reduce((s, a) => s + Number(a.balance), 0);
  const totalUSD = accounts.filter(a => a.isActive && a.currency === 'USD').reduce((s, a) => s + Number(a.balance), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas bancarias"
        subtitle={`${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => { setEditing(undefined); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />Nueva cuenta
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Total ARS</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalARS, 'ARS')}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Total USD</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalUSD, 'USD')}</p>
        </Card>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-gray-400">Cargando…</div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <Landmark className="w-8 h-8 text-gray-300 dark:text-slate-600" />
            <p className="text-sm text-gray-500 dark:text-slate-400">No hay cuentas bancarias</p>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1.5" />Nueva cuenta
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {accounts.map(a => (
              <div
                key={a.id}
                className="flex items-center px-5 py-4 gap-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group"
                onClick={() => navigate(`/banks/${a.id}`)}
              >
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                  <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{a.name}</p>
                    {!a.isActive && (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">Inactiva</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{a.bank}{a.accountNumber ? ` · ${a.accountNumber}` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {formatCurrency(Number(a.balance), a.currency as 'ARS' | 'USD')}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">{a.currency}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setEditing(a); setShowForm(true); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteId(a.id); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showForm && (
        <AccountFormModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Eliminar cuenta"
        message="¿Eliminar esta cuenta bancaria? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
