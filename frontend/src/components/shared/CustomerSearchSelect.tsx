import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, User, Loader2 } from 'lucide-react';
import { customersService } from '../../services';
import { isNetworkError } from '../../services/api';
import { isOffline } from '../../stores/offline.store';
import { searchCustomersOffline, toCustomer } from '../../lib/offline/adapters';
import { getCustomerLocal } from '../../lib/offline/catalogCache';
import type { Customer, CustomerFilters } from '../../types';

export interface CustomerSearchSelectProps {
  customers: Customer[];
  value: string;                    // customerId or ''
  // El 2do argumento trae el cliente elegido (útil con serverSearch, cuando
  // puede no estar en el array `customers` precargado). '' al limpiar.
  onChange: (id: string, customer?: Customer) => void;
  placeholder?: string;
  clearLabel?: string;              // e.g. "Todos los clientes" or "Sin cliente" — if set, shows a clear option
  label?: string;                   // renders a label above the trigger
  error?: string;
  disabled?: boolean;
  // Cuando hay más clientes que los precargados, busca contra el backend a
  // medida que se tipea (en vez de filtrar solo el array `customers`).
  serverSearch?: boolean;
  // Filtros extra para la búsqueda remota (p.ej. { isActive: true }).
  searchParams?: CustomerFilters;
}

export default function CustomerSearchSelect({
  customers,
  value,
  onChange,
  placeholder = 'Buscar cliente…',
  clearLabel,
  label,
  error,
  disabled = false,
  serverSearch = false,
  searchParams,
}: CustomerSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Resultados de la búsqueda remota (null = aún no se buscó / query vacío).
  const [remoteResults, setRemoteResults] = useState<Customer[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // Cache de clientes traídos del backend, para resolver el rótulo del
  // seleccionado aunque no esté en el array `customers` precargado.
  const [fetchedById, setFetchedById] = useState<Record<string, Customer>>({});
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => customers.find((c) => c.id === value) ?? fetchedById[value] ?? null,
    [customers, value, fetchedById]
  );

  // Con serverSearch el cliente elegido puede no estar precargado (p.ej. al
  // volver a un formulario ya guardado): se resuelve por id una sola vez.
  useEffect(() => {
    if (!serverSearch || !value || selected) return;
    let cancelled = false;
    const resolveLocal = async () => {
      const cached = await getCustomerLocal(value);
      if (cached && !cancelled) {
        const c = toCustomer(cached);
        setFetchedById((prev) => ({ ...prev, [c.id]: c }));
      }
    };

    if (isOffline()) {
      void resolveLocal();
      return () => { cancelled = true; };
    }

    customersService.getById(value)
      .then((customer) => {
        if (!cancelled) setFetchedById((prev) => ({ ...prev, [customer.id]: customer }));
      })
      .catch((err) => {
        // Sin rótulo el trigger muestra el placeholder; si fue la red, la
        // cache local todavia puede tener el nombre.
        if (isNetworkError(err)) void resolveLocal();
      });
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
      inputRef.current?.focus();
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
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  // Búsqueda remota (debounce) cuando serverSearch está activo.
  useEffect(() => {
    if (!serverSearch) return;
    const q = query.trim();
    if (!q) { setRemoteResults(null); setIsSearching(false); return; }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const searchLocally = async () => {
        const local = await searchCustomersOffline(q, 50);
        if (cancelled) return;
        setRemoteResults(local);
        setFetchedById((prev) => {
          const next = { ...prev };
          for (const c of local) next[c.id] = c;
          return next;
        });
      };

      if (isOffline()) {
        try { await searchLocally(); } catch { if (!cancelled) setRemoteResults([]); }
        if (!cancelled) setIsSearching(false);
        return;
      }

      try {
        const res = await customersService.getAll({ ...searchParams, search: q, limit: 50 });
        if (cancelled) return;
        setRemoteResults(res.data);
        setFetchedById((prev) => {
          const next = { ...prev };
          for (const c of res.data) next[c.id] = c;
          return next;
        });
      } catch (err) {
        if (cancelled) return;
        if (isNetworkError(err)) {
          try { await searchLocally(); } catch { setRemoteResults([]); }
        } else {
          setRemoteResults([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, serverSearch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (serverSearch) {
      // Sin texto: mostramos lo precargado. Con texto: resultados del backend.
      if (!q) return customers.slice(0, 50);
      return (remoteResults ?? []).slice(0, 50);
    }
    if (!q) return customers.slice(0, 50);
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.taxId ?? '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [customers, query, serverSearch, remoteResults]);

  const handleSelect = (customer: Customer) => {
    onChange(customer.id, customer);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
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
          {/* Search input inside dropdown */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm border-b border-gray-100 dark:border-slate-700 transition-colors ${
                !value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium' : 'text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
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
                <User className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {query ? `Sin resultados para "${query}"` : 'Sin clientes'}
                </p>
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'}`}>
                        {c.name}
                      </p>
                      {c.taxId && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 truncate leading-none mt-0.5">
                          CUIT: {c.taxId}
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
              <User className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block truncate text-gray-900 dark:text-slate-200 font-medium text-sm leading-tight">
                  {selected.name}
                </span>
                {selected.taxId && (
                  <span className="block text-xs text-gray-400 dark:text-slate-500 truncate leading-none">
                    {selected.taxId}
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
              <User className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
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
