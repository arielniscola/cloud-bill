import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Landmark } from 'lucide-react';
import { bancosService } from '../../services';
import type { Banco } from '../../types';

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  /** Se dispara además de onChange con el banco elegido del catálogo (null al limpiar). */
  onSelectBanco?: (banco: Banco | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: string;
}

/* ── Catálogo cacheado a nivel módulo (un solo fetch por sesión) ──────── */
let cache: Banco[] | null = null;
let inflight: Promise<Banco[]> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

function loadBancos() {
  if (cache || inflight) return;
  inflight = bancosService.getAll()
    .then((data) => { cache = data; emit(); return data; })
    .catch(() => { cache = []; emit(); return []; })
    .finally(() => { inflight = null; });
}

/** Catálogo de bancos activos (compartido y cacheado). */
export function useBancos(): Banco[] {
  const bancos = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => cache,
    () => cache,
  );
  useEffect(() => { loadBancos(); }, []);
  return useMemo(() => (bancos ?? []).filter((b) => b.isActive), [bancos]);
}

/** Busca un banco del catálogo por nombre (case-insensitive). */
export function findBancoByName(bancos: Banco[], name: string | null | undefined): Banco | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return bancos.find((b) => b.name.trim().toLowerCase() === n) ?? null;
}

/** Invalida el catálogo cacheado (usar tras crear/editar bancos). */
export function refreshBancos() { cache = null; loadBancos(); }

/**
 * Selector de banco con buscador sobre el catálogo de bancos ya creados
 * (parametrización). El valor guardado sigue siendo el NOMBRE (string),
 * compatible con los campos existentes (`bank`).
 */
export function BancoSelect({
  value, onChange, onSelectBanco, label,
  placeholder = 'Seleccionar banco…', className, disabled, error,
}: Props) {
  const bancos = useBancos();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => findBancoByName(bancos, value), [bancos, value]);

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
      ...(showAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (isOpen) { updatePosition(); inputRef.current?.focus(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false); setQuery('');
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
    if (!q) return bancos;
    return bancos.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      (b.code ?? '').toLowerCase().includes(q) ||
      (b.sucursal ?? '').toLowerCase().includes(q)
    );
  }, [bancos, query]);

  const handleSelect = (banco: Banco) => {
    onChange(banco.name);
    onSelectBanco?.(banco);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    onSelectBanco?.(null);
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
                <Landmark className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {query ? `Sin resultados para "${query}"` : 'Sin bancos cargados'}
                </p>
                <a href="/bancos" className="text-xs text-indigo-500 underline">Configurar bancos</a>
              </div>
            ) : (
              filtered.map((b) => {
                const isSelected = selected?.id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(b)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {b.code && (
                      <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                        {b.code}
                      </span>
                    )}
                    <span className={`flex-1 text-sm truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400 font-medium' : 'text-gray-800 dark:text-slate-200'}`}>
                      {b.name}
                    </span>
                    {b.sucursal && (
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                        Suc. {b.sucursal}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  const baseCls = className ??
    'w-full text-sm px-2 py-2 rounded-lg border bg-white dark:bg-slate-700 text-gray-900 dark:text-white';

  return (
    <div>
      {label && <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</label>}
      <div ref={containerRef} className="relative w-full">
        {!isOpen ? (
          <button
            type="button"
            onClick={() => { if (!disabled) setIsOpen(true); }}
            disabled={disabled}
            className={`${baseCls} flex items-center gap-2 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
              error
                ? 'border-red-300 dark:border-red-700'
                : 'border-gray-300 dark:border-slate-600 focus:border-indigo-400 hover:border-gray-400 dark:hover:border-slate-500'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {value ? (
              <>
                {selected?.code && (
                  <span className="font-mono text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded flex-shrink-0">
                    {selected.code}
                  </span>
                )}
                <span className="flex-1 truncate text-gray-900 dark:text-slate-200">{value}</span>
                {selected?.sucursal && (
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">Suc. {selected.sucursal}</span>
                )}
                {!disabled && (
                  <span
                    role="button"
                    onClick={handleClear}
                    className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                    title="Limpiar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
              </>
            ) : (
              <>
                <Landmark className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
                <span className="flex-1 text-gray-400 dark:text-slate-500 truncate">{placeholder}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
              </>
            )}
          </button>
        ) : (
          <div className={`${baseCls} flex items-center gap-2 focus-within:ring-2 focus-within:ring-indigo-500/30 ${
            error ? 'border-red-300 dark:border-red-700' : 'border-indigo-400'
          }`}>
            <Search className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar banco…"
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
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default BancoSelect;
