import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Layers } from 'lucide-react';
import type { Account } from '../../types/accounting.types';

export interface AccountSearchSelectProps {
  accounts: Account[];
  value: string;                       // accountId or ''
  onChange: (accountId: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  ASSET: 'Activo', LIABILITY: 'Pasivo', EQUITY: 'PN', INCOME: 'Ingreso', EXPENSE: 'Egreso',
};

/**
 * Selector de cuenta contable con buscador (código + nombre). Mismo patrón que
 * ProductSearchSelect: trigger + dropdown en portal con posicionamiento fixed.
 */
export default function AccountSearchSelect({
  accounts,
  value,
  onChange,
  placeholder = 'Seleccionar cuenta…',
  error,
  disabled = false,
}: AccountSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => accounts.find((a) => a.id === value) ?? null,
    [accounts, value]
  );

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 320;
    const showAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => { setIsOpen(false); setQuery(''); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 50);
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [accounts, query]);

  const handleSelect = (account: Account) => {
    onChange(account.id);
    setIsOpen(false);
    setQuery('');
  };

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Layers className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {query ? `Sin resultados para "${query}"` : 'Sin cuentas disponibles'}
                </p>
              </div>
            ) : (
              filtered.map((a) => {
                const isSelected = a.id === value;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(a)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                      {a.code}
                    </span>
                    <span className={`flex-1 text-sm truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400 font-medium' : 'text-gray-800 dark:text-slate-200'}`}>
                      {a.name}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                      {TYPE_LABEL[a.type] ?? a.type}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {filtered.length === 50 && (
            <div className="px-3 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
              <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">
                Mostrando 50 resultados · refiná la búsqueda
              </p>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} className="relative w-full">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => { if (!disabled) setIsOpen(true); }}
          disabled={disabled}
          className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-lg border text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
            error
              ? 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10'
              : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:border-indigo-400 hover:border-gray-400 dark:hover:border-slate-500'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {selected ? (
            <>
              <span className="font-mono text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded flex-shrink-0">
                {selected.code}
              </span>
              <span className="flex-1 truncate text-gray-900 dark:text-slate-200">{selected.name}</span>
            </>
          ) : (
            <>
              <Layers className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
              <span className="flex-1 text-gray-400 dark:text-slate-500">{placeholder}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
            </>
          )}
        </button>
      ) : (
        <div className={`flex items-center gap-2 px-2 py-2 rounded-lg border bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400 ${
          error ? 'border-red-300 dark:border-red-700' : 'border-indigo-400'
        }`}>
          <Search className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código o nombre…"
            className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 min-w-0"
          />
          <button
            type="button"
            onClick={() => { setIsOpen(false); setQuery(''); }}
            className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {dropdown}
    </div>
  );
}
