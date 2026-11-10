import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Truck, Loader2 } from 'lucide-react';
import { suppliersService } from '../../services';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import type { Supplier, SupplierFilters } from '../../types';

/** Lo mínimo que necesita el select (las páginas suelen cargar solo id/nombre). */
export type SupplierOption = Pick<Supplier, 'id' | 'name'> & { cuit?: string | null };

export interface SupplierSearchSelectProps {
  suppliers: SupplierOption[];
  value: string;                    // supplierId or ''
  // El 2do argumento trae el proveedor elegido (útil con serverSearch, cuando
  // puede no estar en el array `suppliers` precargado). '' al limpiar.
  onChange: (id: string, supplier?: SupplierOption) => void;
  placeholder?: string;
  clearLabel?: string;              // e.g. "Todos los proveedores" or "Sin proveedor" — if set, shows a clear option
  label?: string;                   // renders a label above the trigger
  error?: string;
  disabled?: boolean;
  // Cuando hay más proveedores que los precargados, busca contra el backend a
  // medida que se tipea (en vez de filtrar solo el array `suppliers`).
  serverSearch?: boolean;
  // Filtros extra para la búsqueda remota (p.ej. { isActive: true }).
  searchParams?: SupplierFilters;
  /** Abre el desplegable al montarse (p.ej. dentro de un popover de filtro). */
  defaultOpen?: boolean;
}

export default function SupplierSearchSelect({
  suppliers,
  value,
  onChange,
  placeholder = 'Buscar proveedor…',
  clearLabel,
  label,
  error,
  disabled = false,
  serverSearch = false,
  searchParams,
  defaultOpen = false,
}: SupplierSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  // Resultados de la búsqueda remota (null = aún no se buscó / query vacío).
  const [remoteResults, setRemoteResults] = useState<SupplierOption[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // Cache de proveedores traídos del backend, para resolver el rótulo del
  // seleccionado aunque no esté en el array `suppliers` precargado.
  const [fetchedById, setFetchedById] = useState<Record<string, SupplierOption>>({});
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => suppliers.find((c) => c.id === value) ?? fetchedById[value] ?? null,
    [suppliers, value, fetchedById]
  );

  // Con serverSearch el proveedor elegido puede no estar precargado (p.ej. al
  // volver a un formulario ya guardado): se resuelve por id una sola vez.
  useEffect(() => {
    if (!serverSearch || !value || selected) return;
    let cancelled = false;
    suppliersService.getById(value)
      .then((supplier) => {
        if (!cancelled) setFetchedById((prev) => ({ ...prev, [supplier.id]: supplier }));
      })
      .catch(() => { /* sin rótulo el trigger muestra el placeholder */ });
    return () => { cancelled = true; };
  }, [serverSearch, value, selected]);

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 300;
    const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 220),
      zIndex: 9999,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      // preventScroll: el desplegable todavía no tiene su posición fija; sin
      // esto el navegador scrollea la página hasta él y eso lo cierra.
      inputRef.current?.focus({ preventScroll: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
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
    // El scroll DENTRO del propio desplegable (rueda o flechas) no lo cierra.
    const onScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  // Búsqueda remota (debounce) cuando serverSearch está activo.
  useEffect(() => {
    if (!serverSearch) return;
    const q = query.trim();
    // Sin texto y sin lista precargada: al abrir trae los primeros proveedores,
    // así el desplegable no queda vacío (p.ej. un filtro sin `suppliers`).
    const browse = !q && suppliers.length === 0 && isOpen;
    if (!q && !browse) { setRemoteResults(null); setIsSearching(false); return; }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await suppliersService.getAll({ ...searchParams, ...(q ? { search: q } : {}), limit: 50 });
        if (cancelled) return;
        setRemoteResults(res.data);
        setFetchedById((prev) => {
          const next = { ...prev };
          for (const c of res.data) next[c.id] = c;
          return next;
        });
      } catch {
        if (!cancelled) setRemoteResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, q ? 250 : 0);

    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, serverSearch, isOpen, suppliers.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (serverSearch) {
      // Sin texto: mostramos lo precargado. Con texto: resultados del backend.
      if (!q) return (suppliers.length > 0 ? suppliers : remoteResults ?? []).slice(0, 50);
      return (remoteResults ?? []).slice(0, 50);
    }
    if (!q) return suppliers.slice(0, 50);
    return suppliers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.cuit ?? '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [suppliers, query, serverSearch, remoteResults]);

  const handleSelect = (supplier: SupplierOption) => {
    onChange(supplier.id, supplier);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange('');
    setIsOpen(false);
    setQuery('');
  };

  // La opción "limpiar" (si hay) ocupa el índice 0 de la navegación.
  const clearOffset = clearLabel ? 1 : 0;
  const { activeIndex, listRef, onKeyDown, optionProps } = useListKeyboardNav({
    count: filtered.length + clearOffset,
    isOpen,
    resetKey: `${query}|${remoteResults?.length ?? ''}`,
    onSelect: (idx) => {
      // Con la búsqueda remota en vuelo la lista todavía es la anterior.
      if (isSearching) return;
      if (clearOffset && idx === 0) return handleClear();
      const supplier = filtered[idx - clearOffset];
      if (supplier) handleSelect(supplier);
    },
    onEscape: () => { setIsOpen(false); setQuery(''); },
  });

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={(el) => { dropdownRef.current = el; listRef.current = el; }}
          data-select-dropdown=""
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
        >
          {/* Search input inside dropdown */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar por nombre o CUIT…"
                className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 min-w-0"
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQuery('')}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Clear / "all" option */}
          {clearLabel && (
            <button
              type="button"
              {...optionProps(0)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm border-b border-gray-100 dark:border-slate-700 transition-colors ${
                !value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium' : 'text-gray-400 dark:text-slate-500'
              } ${activeIndex === 0 ? 'ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700' : ''}`}
            >
              <X className="w-3.5 h-3.5 flex-shrink-0" />
              {clearLabel}
            </button>
          )}

          <div className="max-h-56 overflow-y-auto [scrollbar-width:thin]">
            {isSearching && filtered.length === 0 ? (
              <div className="px-4 py-6 flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Buscando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Truck className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {query ? `Sin resultados para "${query}"` : 'Sin proveedores'}
                </p>
              </div>
            ) : (
              filtered.map((c, i) => {
                const isSelected = c.id === value;
                const idx = i + clearOffset;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    {...optionProps(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                      isSelected
                        ? isActive ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-indigo-50 dark:bg-indigo-900/30'
                        : isActive ? 'bg-gray-100 dark:bg-slate-700' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'}`}>
                        {c.name}
                      </p>
                      {c.cuit && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 truncate leading-none mt-0.5">
                          CUIT: {c.cuit}
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
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">{label}</label>
      )}
      <div ref={containerRef} className="relative w-full">
        {/* Trigger */}
        <button
          type="button"
          onClick={() => { if (!disabled) setIsOpen((v) => !v); }}
          disabled={disabled}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
            error
              ? 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10 focus:border-red-400'
              : isOpen
              ? 'border-indigo-400 ring-2 ring-indigo-500/20'
              : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:border-indigo-400 hover:border-gray-300 dark:hover:border-slate-500'
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-800' : 'cursor-pointer'}`}
        >
          {selected ? (
            <>
              <Truck className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block truncate text-gray-900 dark:text-slate-200 font-medium text-sm leading-tight">
                  {selected.name}
                </span>
                {selected.cuit && (
                  <span className="block text-xs text-gray-400 dark:text-slate-500 truncate leading-none">
                    {selected.cuit}
                  </span>
                )}
              </div>
              {clearLabel && (
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
              <Truck className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
              <span className="flex-1 text-gray-400 dark:text-slate-500">{clearLabel ?? placeholder}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>

        {dropdown}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
