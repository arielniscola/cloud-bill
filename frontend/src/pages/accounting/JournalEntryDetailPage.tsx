import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '../../components/ui';
import { accountingService } from '../../services/accounting.service';
import { formatDate, formatCurrency } from '../../utils/formatters';
import type { JournalEntry, AccountType } from '../../types/accounting.types';

const REF_TYPE_LABELS: Record<string, string> = {
  INVOICE:  'Factura',
  PAYMENT:  'Cobro',
  PURCHASE: 'Compra',
  MANUAL:   'Manual',
};

const TYPE_COLORS: Record<AccountType, string> = {
  ASSET:     'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY:    'text-purple-600 dark:text-purple-400',
  INCOME:    'text-green-600 dark:text-green-400',
  EXPENSE:   'text-orange-600 dark:text-orange-400',
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

export default function JournalEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    accountingService.getJournalEntryById(id)
      .then(setEntry)
      .catch(() => toast.error('Error al cargar el asiento'))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 dark:bg-slate-700 rounded w-48" />
        <div className="h-40 bg-gray-100 dark:bg-slate-700 rounded-xl" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="text-center py-16 text-gray-400">
        Asiento no encontrado
      </div>
    );
  }

  const totalDebit  = (entry.lines ?? []).reduce((s, l) => s + l.debit,  0);
  const totalCredit = (entry.lines ?? []).reduce((s, l) => s + l.credit, 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.005;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-slate-400" />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
              Asiento {entry.number}
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {formatDate(entry.date)}
            </p>
          </div>
        </div>
        {entry.referenceType && (
          <Badge variant="default" className="ml-2">
            {REF_TYPE_LABELS[entry.referenceType] ?? entry.referenceType}
          </Badge>
        )}
      </div>

      {/* Info card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Número"      value={<span className="font-mono">{entry.number}</span>} />
          <InfoRow label="Fecha"       value={formatDate(entry.date)} />
          <InfoRow label="Descripción" value={entry.description} />
          <InfoRow
            label="Estado"
            value={
              <Badge variant={isBalanced ? 'success' : 'error'}>
                {isBalanced ? 'Balanceado' : 'Desbalanceado'}
              </Badge>
            }
          />
        </div>
      </div>

      {/* Lines — partida doble */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Líneas del asiento — Partida Doble
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-700">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-24">Código</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Cuenta</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Detalle</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Debe</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {(entry.lines ?? []).map((line) => (
              <tr key={line.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">
                  {line.accountCode}
                </td>
                <td className="px-5 py-3">
                  <span className={`font-medium ${line.account ? TYPE_COLORS[line.account.type] : 'text-gray-700 dark:text-slate-300'}`}>
                    {line.account?.name ?? line.accountCode}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 dark:text-slate-400 text-xs">
                  {line.description ?? '—'}
                </td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800 dark:text-slate-200">
                  {line.debit > 0 ? formatCurrency(line.debit, 'ARS') : '—'}
                </td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800 dark:text-slate-200">
                  {line.credit > 0 ? formatCurrency(line.credit, 'ARS') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50">
            <tr>
              <td colSpan={3} className="px-5 py-3 text-sm font-bold text-gray-700 dark:text-slate-300">
                Total
              </td>
              <td className="px-5 py-3 text-right font-mono font-bold text-gray-800 dark:text-slate-200">
                {formatCurrency(totalDebit, 'ARS')}
              </td>
              <td className="px-5 py-3 text-right font-mono font-bold text-gray-800 dark:text-slate-200">
                {formatCurrency(totalCredit, 'ARS')}
              </td>
            </tr>
            {!isBalanced && (
              <tr>
                <td colSpan={5} className="px-5 py-2 text-center text-xs text-red-600 dark:text-red-400 font-medium">
                  ⚠ El asiento no balancea — diferencia: {formatCurrency(Math.abs(totalDebit - totalCredit), 'ARS')}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
