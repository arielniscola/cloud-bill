import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input, Select } from '../../components/ui';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { bankService } from '../../services';
import type { BankAccount, BankMovement, CreateBankMovementDTO } from '../../types';

const TYPE_OPTIONS = [
  { value: 'CREDIT', label: 'Ingreso (crédito)' },
  { value: 'DEBIT',  label: 'Egreso (débito)' },
];

function MovementFormModal({
  currency,
  onSave,
  onClose,
}: {
  currency: string;
  onSave: (data: CreateBankMovementDTO) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateBankMovementDTO>({
    type: 'CREDIT', amount: 0, description: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || form.amount <= 0) {
      toast.error('Completá descripción y monto');
      return;
    }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Registrar movimiento</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Tipo"
            value={form.type}
            onChange={v => setForm(p => ({ ...p, type: v as 'CREDIT' | 'DEBIT' }))}
            options={TYPE_OPTIONS}
          />
          <Input
            label={`Monto (${currency})`}
            type="number"
            min="0"
            step="0.01"
            value={form.amount || ''}
            onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))}
            required
          />
          <Input
            label="Descripción"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            required
          />
          <Input
            label="Fecha"
            type="date"
            value={form.date ?? ''}
            onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" isLoading={saving}>Registrar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BankAccountDetailPage() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const [account,   setAccount]   = useState<BankAccount | null>(null);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm,  setShowForm]  = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [acc, res] = await Promise.all([
        bankService.getById(id),
        bankService.getMovements(id, page),
      ]);
      setAccount(acc);
      setMovements(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Error al cargar cuenta');
    } finally {
      setIsLoading(false);
    }
  }, [id, page]);

  useEffect(() => { load(); }, [load]);

  const handleAddMovement = async (data: CreateBankMovementDTO) => {
    try {
      await bankService.addMovement(id!, data);
      toast.success('Movimiento registrado');
      setShowForm(false);
      setPage(1);
      await load();
    } catch {
      toast.error('Error al registrar movimiento');
    }
  };

  if (isLoading && !account) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>;
  }

  if (!account) {
    return <div className="text-center text-gray-400 py-16">Cuenta no encontrada</div>;
  }

  const currency = account.currency as 'ARS' | 'USD';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/banks')}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{account.name}</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500">{account.bank}{account.accountNumber ? ` · ${account.accountNumber}` : ''}</p>
        </div>
      </div>

      {/* Balance card */}
      <Card className="px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Saldo actual</p>
            <p className={`text-3xl font-bold ${Number(account.balance) >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
              {formatCurrency(Number(account.balance), currency)}
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />Movimiento
          </Button>
        </div>
      </Card>

      {/* Movements */}
      <Card>
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Movimientos <span className="text-gray-400 font-normal">({total})</span>
          </h3>
        </div>
        {isLoading ? (
          <div className="flex justify-center items-center h-24 text-gray-400">Cargando…</div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400 text-sm">Sin movimientos</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {movements.map(m => (
              <div key={m.id} className="flex items-center px-5 py-3.5 gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.type === 'CREDIT'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30'
                    : 'bg-red-50 dark:bg-red-900/30'
                }`}>
                  {m.type === 'CREDIT'
                    ? <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    : <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{m.description}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{formatDate(m.date)}</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                  m.type === 'CREDIT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                }`}>
                  {m.type === 'CREDIT' ? '+' : '-'}{formatCurrency(Number(m.amount), currency)}
                </p>
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-gray-400">{total} movimientos</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40">‹</button>
              <span className="text-xs text-gray-600 dark:text-slate-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40">›</button>
            </div>
          </div>
        )}
      </Card>

      {showForm && (
        <MovementFormModal
          currency={account.currency}
          onSave={handleAddMovement}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
