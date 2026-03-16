import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Package } from 'lucide-react';
import type { Product } from '../../types';

export interface ProductSearchSelectProps {
  products: Product[];
  value: string;                       // productId or ''
  onChange: (productId: string) => void;
  placeholder?: string;
  error?: string;
  optional?: boolean;                  // shows "Sin producto" clear option
  disabled?: boolean;
}

export default function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder = 'Buscar producto…',
  error,
  optional = false,
  disabled = false,
}: ProductSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => products.find((p) => p.id === value) ?? null,
    [products, value]
  );

  // Calculate and set dropdown position based on trigger rect
  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 320; // max expected height

    const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

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

  // Recalculate position when opening
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on outside click (both trigger and portal dropdown)
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

  // Close on scroll or resize to avoid stale positioning
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
    if (!q) return products.slice(0, 50);
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.brand?.name ?? '').toLowerCase().includes(q) ||
        (p.category?.name ?? '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [products, query]);

  const handleSelect = (product: Product) => {
    onChange(product.id);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    setQuery('');
  };

  const handleOpen = () => {
    if (!disabled) setIsOpen(true);
  };

  // ── Portal dropdown ──────────────────────────────────────────────
  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
        >
          {optional && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700 border-b border-gray-100 dark:border-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Sin producto (opcional)
            </button>
          )}

          <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Package className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {query ? `Sin resultados para "${query}"` : 'Sin productos disponibles'}
                </p>
              </div>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(p)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                      {p.sku}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'}`}>
                        {p.name}
                      </p>
                      {(p.brand || p.category) && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 truncate leading-none mt-0.5">
                          {[p.brand?.name, p.category?.name].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {filtered.length === 50 && (
            <div className="px-3 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
              <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">
                Mostrando 50 resultados · refiná la búsqueda para ver más
              </p>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger / search input */}
      {!isOpen ? (
        <button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
            error
              ? 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10 focus:border-red-400'
              : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:border-indigo-400 hover:border-gray-300 dark:hover:border-slate-500'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {selected ? (
            <>
              <span className="font-mono text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded flex-shrink-0">
                {selected.sku}
              </span>
              <span className="flex-1 truncate text-gray-900 dark:text-slate-200 font-medium">
                {selected.name}
              </span>
              {optional && (
                <span
                  onClick={handleClear}
                  className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
            </>
          ) : (
            <>
              <Package className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
              <span className="flex-1 text-gray-400 dark:text-slate-500">{placeholder}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
            </>
          )}
        </button>
      ) : (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400 ${
          error ? 'border-red-300 dark:border-red-700' : 'border-indigo-400'
        }`}>
          <Search className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por SKU, nombre, marca…"
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

      {/* Portal dropdown rendered in document.body */}
      {dropdown}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
