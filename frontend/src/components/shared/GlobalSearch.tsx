import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, Package, ClipboardList, X, Loader2 } from 'lucide-react';
import { searchService, type SearchResult } from '../../services/search.service';
import { formatCurrency } from '../../utils/formatters';
import { INVOICE_STATUS_COLORS, INVOICE_STATUSES } from '../../utils/constants';

type ResultItem = {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  href: string;
  icon: React.ReactNode;
  category: string;
};

const BUDGET_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', SENT: 'Enviado', ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado', CONVERTED: 'Convertido', EXPIRED: 'Vencido',
  PARTIALLY_PAID: 'Pago parcial', PAID: 'Pagado',
};
const BUDGET_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700', SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700', REJECTED: 'bg-red-100 text-red-700',
  CONVERTED: 'bg-violet-100 text-violet-700', EXPIRED: 'bg-amber-100 text-amber-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700', PAID: 'bg-emerald-100 text-emerald-700',
};

function buildItems(data: SearchResult): ResultItem[] {
  const items: ResultItem[] = [];

  data.invoices.forEach((inv) => {
    items.push({
      id: `inv-${inv.id}`,
      label: inv.number,
      sublabel: inv.customer?.name ?? '—',
      badge: INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES] ?? inv.status,
      badgeColor: INVOICE_STATUS_COLORS[inv.status as keyof typeof INVOICE_STATUS_COLORS] ?? '',
      href: `/invoices/${inv.id}`,
      icon: <FileText className="w-4 h-4 text-indigo-500" />,
      category: 'Facturas',
    });
  });

  data.customers.forEach((c) => {
    items.push({
      id: `cus-${c.id}`,
      label: c.name,
      sublabel: c.taxId ?? c.email ?? undefined,
      href: `/customers`,
      icon: <Users className="w-4 h-4 text-emerald-500" />,
      category: 'Clientes',
    });
  });

  data.products.forEach((p) => {
    items.push({
      id: `prd-${p.id}`,
      label: p.name,
      sublabel: p.sku ? `SKU: ${p.sku}` : undefined,
      badge: formatCurrency(p.price, 'ARS'),
      badgeColor: 'bg-gray-100 text-gray-700',
      href: `/products`,
      icon: <Package className="w-4 h-4 text-amber-500" />,
      category: 'Productos',
    });
  });

  data.budgets.forEach((b) => {
    items.push({
      id: `bud-${b.id}`,
      label: b.number,
      sublabel: b.customer?.name ?? '—',
      badge: BUDGET_STATUS_LABELS[b.status] ?? b.status,
      badgeColor: BUDGET_STATUS_COLORS[b.status] ?? '',
      href: `/budgets/${b.id}`,
      icon: <ClipboardList className="w-4 h-4 text-violet-500" />,
      category: 'Presupuestos',
    });
  });

  return items;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await searchService.search(q);
      setResults(buildItems(data));
      setActiveIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 280);
  };

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) {
      navigate(results[activeIdx].href);
      setOpen(false);
    }
  };

  const goTo = (href: string) => {
    navigate(href);
    setOpen(false);
  };

  if (!open) return null;

  // Group by category for rendering
  const grouped: Record<string, ResultItem[]> = {};
  results.forEach((item) => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });
  const categories = Object.keys(grouped);
  // Build flat ordered list for keyboard nav index tracking
  const flat = categories.flatMap((c) => grouped[c]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 top-[12vh] z-50 mx-auto w-full max-w-xl px-4">
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-gray-200 dark:ring-slate-700 overflow-hidden">

          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            {loading
              ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin flex-shrink-0" />
              : <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
            }
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar facturas, clientes, productos, presupuestos..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}>
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-600">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.length >= 2 && !loading && results.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
                Sin resultados para <strong className="text-gray-600 dark:text-slate-300">"{query}"</strong>
              </div>
            ) : query.length < 2 ? (
              <div className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">
                Escribí al menos 2 caracteres para buscar
              </div>
            ) : (
              <div className="py-2">
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                        {cat}
                      </span>
                    </div>
                    {grouped[cat].map((item) => {
                      const idx = flat.indexOf(item);
                      const isActive = idx === activeIdx;
                      return (
                        <button
                          key={item.id}
                          onClick={() => goTo(item.href)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isActive
                              ? 'bg-indigo-50 dark:bg-indigo-900/30'
                              : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700">
                            {item.icon}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-sm font-medium truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                              {item.label}
                            </span>
                            {item.sublabel && (
                              <span className="block text-xs text-gray-400 dark:text-slate-500 truncate">
                                {item.sublabel}
                              </span>
                            )}
                          </span>
                          {item.badge && (
                            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.badgeColor}`}>
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-400 dark:text-slate-500">
            <span className="flex items-center gap-1"><kbd className="kbd">↑↓</kbd> navegar</span>
            <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> abrir</span>
            <span className="flex items-center gap-1"><kbd className="kbd">Esc</kbd> cerrar</span>
          </div>
        </div>
      </div>
    </>
  );
}
