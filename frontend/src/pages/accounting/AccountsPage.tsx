import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, BookOpen, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, FeatureGuard } from '../../components/shared';
import { accountingService } from '../../services/accounting.service';
import type { Account, AccountType } from '../../types/accounting.types';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET:     'Activo',
  LIABILITY: 'Pasivo',
  EQUITY:    'Patrimonio Neto',
  INCOME:    'Ingresos',
  EXPENSE:   'Egresos',
};

const TYPE_COLORS: Record<AccountType, string> = {
  ASSET:     'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY:    'text-purple-600 dark:text-purple-400',
  INCOME:    'text-green-600 dark:text-green-400',
  EXPENSE:   'text-orange-600 dark:text-orange-400',
};

const TYPE_BG: Record<AccountType, string> = {
  ASSET:     'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40',
  LIABILITY: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/40',
  EQUITY:    'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800/40',
  INCOME:    'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/40',
  EXPENSE:   'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800/40',
};

function buildTree(accounts: Account[]): Account[] {
  const map = new Map<string, Account>();
  for (const acc of accounts) {
    map.set(acc.code, { ...acc, children: [] });
  }
  const roots: Account[] = [];
  for (const acc of map.values()) {
    if (acc.parentCode) {
      const parent = map.get(acc.parentCode);
      if (parent) {
        parent.children!.push(acc);
      } else {
        roots.push(acc);
      }
    } else {
      roots.push(acc);
    }
  }
  return roots.sort((a, b) => a.code.localeCompare(b.code));
}

interface AccountNodeProps {
  account: Account;
  depth?: number;
}

function AccountNode({ account, depth = 0 }: AccountNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = account.children && account.children.length > 0;
  const indent = depth * 20;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none
          hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors
          ${account.isAuxiliary ? 'text-gray-700 dark:text-slate-300' : 'font-semibold text-gray-800 dark:text-slate-200'}`}
        style={{ paddingLeft: `${12 + indent}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5 h-3.5 flex-shrink-0" />
        )}

        <span className="font-mono text-xs text-gray-400 dark:text-slate-500 w-20 flex-shrink-0">
          {account.code}
        </span>

        <span className="flex-1 text-sm">{account.name}</span>

        {account.isAuxiliary && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
            imputación
          </span>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {account.children!.map((child) => (
            <AccountNode key={child.id} account={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountsPageContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await accountingService.getAccounts();
      setAccounts(data);
    } catch {
      toast.error('Error al cargar el plan de cuentas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const data = await accountingService.seedAccounts();
      setAccounts(data);
      toast.success('Plan de cuentas inicializado');
    } catch {
      toast.error('Error al inicializar el plan de cuentas');
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tree = buildTree(accounts);
  const groups = tree.sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan de Cuentas"
        subtitle="Clasificación contable estándar para PyMEs argentinas"
        actions={
          accounts.length === 0 && !isLoading ? (
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSeeding ? 'animate-spin' : ''}`} />
              Inicializar plan de cuentas
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
          <BookOpen className="w-12 h-12 mx-auto text-gray-300 dark:text-slate-600 mb-3" />
          <p className="text-gray-500 dark:text-slate-400 mb-2">No hay plan de cuentas configurado</p>
          <p className="text-sm text-gray-400 dark:text-slate-500">
            Inicializalo con el plan de cuentas estándar para PyMEs argentinas
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className={`rounded-xl border p-4 ${TYPE_BG[group.type]}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-mono font-bold ${TYPE_COLORS[group.type]}`}>
                  {group.code}
                </span>
                <h3 className={`text-sm font-bold uppercase tracking-wide ${TYPE_COLORS[group.type]}`}>
                  {TYPE_LABELS[group.type]} — {group.name}
                </h3>
              </div>
              <div className="space-y-0.5">
                {group.children?.map((child) => (
                  <AccountNode key={child.id} account={child} depth={0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <FeatureGuard feature="accounting">
      <AccountsPageContent />
    </FeatureGuard>
  );
}
