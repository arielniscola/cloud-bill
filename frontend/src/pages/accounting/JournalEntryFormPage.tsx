import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader, FeatureGuard } from '../../components/shared';
import { accountingService } from '../../services/accounting.service';
import { formatCurrency } from '../../utils/formatters';
import type { Account, CreateJournalEntryLineDTO } from '../../types/accounting.types';

interface LineRow extends CreateJournalEntryLineDTO {
  key: number;
}

let lineKeyCounter = 0;

function emptyLine(): LineRow {
  return { key: ++lineKeyCounter, accountCode: '', description: '', debit: 0, credit: 0 };
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

function JournalEntryFormContent() {
  const navigate = useNavigate();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine(), emptyLine()]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    accountingService.getAccounts().then(setAccounts).catch(() => {});
  }, []);

  const auxiliaryAccounts = useMemo(
    () => accounts.filter((a) => a.isAuxiliary && a.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const difference = Math.abs(totalDebit - totalCredit);

  const updateLine = (key: number, field: keyof CreateJournalEntryLineDTO, value: string | number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
    );
  };

  const removeLine = (key: number) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()]);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('La descripcion es requerida');
      return;
    }
    const validLines = lines.filter((l) => l.accountCode && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) {
      toast.error('Se requieren al menos 2 lineas con importe');
      return;
    }
    if (!isBalanced) {
      toast.error('El asiento no balancea');
      return;
    }

    setIsSaving(true);
    try {
      const entry = await accountingService.createJournalEntry({
        date,
        description: description.trim(),
        lines: validLines.map(({ accountCode, description: desc, debit, credit }) => ({
          accountCode,
          description: desc || undefined,
          debit: debit || 0,
          credit: credit || 0,
        })),
      });
      toast.success(`Asiento ${entry.number} creado`);
      navigate(`/accounting/journal-entries/${entry.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al crear el asiento');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo Asiento Contable"
        subtitle="Asiento manual de partida doble"
        backTo="/accounting/journal-entries"
        actions={
          <Button onClick={handleSubmit} disabled={isSaving || !isBalanced}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar asiento'}
          </Button>
        }
      />

      {/* Header fields */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Fecha
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Descripcion *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Pago de alquiler oficina"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Lineas del asiento</h3>
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Agregar linea
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase w-[35%]">Cuenta</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase w-[25%]">Detalle</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase w-[15%]">Debe</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase w-[15%]">Haber</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {lines.map((line) => (
              <tr key={line.key}>
                <td className="px-4 py-2">
                  <select
                    value={line.accountCode}
                    onChange={(e) => updateLine(line.key, 'accountCode', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {auxiliaryAccounts.map((a) => (
                      <option key={a.id} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={line.description ?? ''}
                    onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                    placeholder="Opcional"
                    className={inputCls}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.debit || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateLine(line.key, 'debit', val);
                      if (val > 0) updateLine(line.key, 'credit', 0);
                    }}
                    placeholder="0.00"
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.credit || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateLine(line.key, 'credit', val);
                      if (val > 0) updateLine(line.key, 'debit', 0);
                    }}
                    placeholder="0.00"
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  {lines.length > 2 && (
                    <button
                      onClick={() => removeLine(line.key)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                      title="Eliminar linea"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-200 dark:border-slate-600">
            <tr className="bg-gray-50 dark:bg-slate-700/50">
              <td className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300" colSpan={2}>
                Totales
              </td>
              <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                {formatCurrency(totalDebit)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                {formatCurrency(totalCredit)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={5} className="px-4 py-2.5">
                {totalDebit === 0 && totalCredit === 0 ? (
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    Ingrese los importes en las lineas
                  </span>
                ) : isBalanced ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Asiento balanceado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Diferencia: {formatCurrency(difference)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function JournalEntryFormPage() {
  return (
    <FeatureGuard feature="accounting">
      <JournalEntryFormContent />
    </FeatureGuard>
  );
}
