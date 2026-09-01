import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Package, Loader2 } from 'lucide-react';
import { productsService } from '../../services';
import { isNetworkError } from '../../services/api';
import { isOffline } from '../../stores/offline.store';
import { searchProductsOffline } from '../../lib/offline/adapters';
import { getProductLocal } from '../../lib/offline/catalogCache';
import { toProduct } from '../../lib/offline/adapters';
import type { Product, ProductFilters } from '../../types';

export interface ProductSearchSelectProps {
  products: Product[];
  value: string;                       // productId or ''
  // El 2do argumento trae el producto elegido (útil con serverSearch, cuando
  // puede no estar en el array `products` precargado). '' al limpiar.
  onChange: (productId: string, product?: Product) => void;
  placeholder?: string;
  error?: string;
  optional?: boolean;                  // shows "Sin producto" clear option
  disabled?: boolean;
  // Cuando hay más productos que los precargados, busca contra el backend a
  // medida que se tipea (en vez de filtrar solo el array `products` en memoria).
  serverSearch?: boolean;
  // Filtros extra para la búsqueda remota (p.ej. { isActive: true }).
  searchParams?: ProductFilters;
}

export default function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder = 'Buscar producto…',
  error,
  optional = false,
  disabled = false,
  serverSearch = false,
  searchParams,
}: ProductSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Resultados de la búsqueda remota (null = aún no se buscó / query vacío).
  const [remoteResults, setRemoteResults] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // Cache de productos traídos del backend, para resolver el rótulo del
  // seleccionado aunque no esté en el array `products` precargado.
  const [fetchedById, setFetchedById] = useState<Record<string, Product>>({});
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  /** Opción resaltada, movible con las flechas. Cuenta la fila "Sin producto". */
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => products.find((p) => p.id === value) ?? fetchedById[value] ?? null,
    [products, value, fetchedById]
  );

  // Con serverSearch el producto elegido puede no estar precargado (p.ej. al
  // editar un comprobante viejo, o con un catálogo más grande que la precarga):
  // se resuelve por id una sola vez para no mostrar la fila en blanco.
  useEffect(() => {
    if (!serverSearch || !value || selected) return;
    let cancelled = false;
    const resolveLocal = async () => {
      const cached = await getProductLocal(value);
      if (cached && !cancelled) {
        setFetchedById((prev) => ({ ...prev, [cached.id]: toProduct(cached) }));
      }
    };

    if (isOffline()) {
      void resolveLocal();
      return () => { cancelled = true; };
    }

    productsService.getById(value)
      .then((product) => {
        if (!cancelled) setFetchedById((prev) => ({ ...prev, [product.id]: product }));
      })
      .catch((err) => {
        // Sin rótulo el trigger muestra el placeholder; si fue la red, la
        // cache local todavia puede tener el nombre.
        if (isNetworkError(err)) void resolveLocal();
      });
    return () => { cancelled = true; };
  }, [serverSearch, value, selected]);

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

  // Close on outer scroll or resize to avoid stale positioning.
  // Ignora el scroll DENTRO del propio dropdown (su lista tiene overflow-y-auto),
  // si no, scrollear los resultados cerraba el menú.
  useEffect(() => {
    if (!isOpen) return;
    const close = () => { setIsOpen(false); setQuery(''); };
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && dropdownRef.current?.contains(target)) return; // scroll interno: mantener abierto
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
    if (!q) { setRemoteResults(null); setIsSearching(false); return; }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      // Sin conexion la busqueda va contra IndexedDB. El catalogo completo
      // entra holgado en la cache local, asi que offline incluso responde mas
      // rapido que el backend.
      const searchLocally = async () => {
        const local = await searchProductsOffline(q, 50);
        if (cancelled) return;
        setRemoteResults(local);
        setFetchedById((prev) => {
          const next = { ...prev };
          for (const p of local) next[p.id] = p;
          return next;
        });
      };

      if (isOffline()) {
        try { await searchLocally(); } catch { if (!cancelled) setRemoteResults([]); }
        if (!cancelled) setIsSearching(false);
        return;
      }

      try {
        const res = await productsService.getAll({ ...searchParams, search: q, limit: 50 });
        if (cancelled) return;
        setRemoteResults(res.data);
        setFetchedById((prev) => {
          const next = { ...prev };
          for (const p of res.data) next[p.id] = p;
          return next;
        });
      } catch (err) {
        // Si se corto la red justo en esta busqueda, reintentar local antes
        // de mostrar "sin resultados".
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
      if (!q) return products.slice(0, 50);
      return (remoteResults ?? []).slice(0, 50);
    }
    if (!q) return products.slice(0, 50);
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.brand?.name ?? '').toLowerCase().includes(q) ||
        (p.rubro?.name ?? '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [products, query, serverSearch, remoteResults]);

  const handleSelect = (product: Product) => {
    onChange(product.id, product);
    setIsOpen(false);
    setQuery('');
  };

  // ── Navegación con teclado ───────────────────────────────────────
  // La lista recorrible es la que se está viendo: con `serverSearch` son los
  // resultados del backend, sin él el array filtrado en memoria. Si `optional`
  // está activo, "Sin producto" es la opción 0 y también se alcanza con flechas.
  const clearOffset = optional ? 1 : 0;
  const optionCount = clearOffset + filtered.length;

  /** Deja el resaltado sobre el producto ya elegido, o sobre el primero. */
  const initialIndex = () => {
    const i = filtered.findIndex((p) => p.id === value);
    return i >= 0 ? i + clearOffset : Math.min(clearOffset, Math.max(optionCount - 1, 0));
  };

  // Al abrir, y cada vez que cambia lo tecleado, el resaltado se recalcula: si
  // no, quedaría apuntando a una posición que ahora es otro producto.
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(initialIndex());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, query]);

  // Los resultados remotos llegan después del tecleo: al aterrizar, arriba de todo.
  useEffect(() => {
    if (!isOpen || !serverSearch) return;
    setActiveIndex(clearOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteResults]);

  const scrollActiveIntoView = (index: number) => {
    listRef.current
      ?.querySelector(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // No debe llegar al atajo de "cancelar" del formulario que lo contiene.
      e.stopPropagation();
      setIsOpen(false);
      setQuery('');
      return;
    }

    if (optionCount === 0) return;

    const move = (next: number) => {
      e.preventDefault();
      setActiveIndex(next);
      scrollActiveIntoView(next);
    };

    if (e.key === 'ArrowDown') return move((activeIndex + 1) % optionCount);
    if (e.key === 'ArrowUp') return move((activeIndex - 1 + optionCount) % optionCount);
    if (e.key === 'Home') return move(0);
    if (e.key === 'End') return move(optionCount - 1);

    if (e.key === 'Enter') {
      e.preventDefault();
      // Con la búsqueda remota en vuelo la lista todavía es la anterior:
      // elegir ahí sería elegir un producto que ya no corresponde.
      if (isSearching) return;
      if (optional && activeIndex === 0) { onChange(''); setIsOpen(false); setQuery(''); return; }
      const product = filtered[activeIndex - clearOffset];
      if (product) handleSelect(product);
    }
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
              id="product-search-opt-0"
              role="option"
              aria-selected={activeIndex === 0}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(0)}
              onClick={handleClear}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-700 transition-colors ${
                activeIndex === 0 ? 'bg-gray-100 dark:bg-slate-700' : ''
              }`}
            >
              <X className="w-3.5 h-3.5" />
              Sin producto (opcional)
            </button>
          )}

          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
            {isSearching ? (
              <div className="px-4 py-6 text-center">
                <Loader2 className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-gray-400 dark:text-slate-500">Buscando…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Package className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {query ? `Sin resultados para "${query}"` : 'Sin productos disponibles'}
                </p>
              </div>
            ) : (
              filtered.map((p, i) => {
                const isSelected = p.id === value;
                const idx = i + clearOffset;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={p.id}
                    type="button"
                    id={`product-search-opt-${idx}`}
                    data-idx={idx}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(p)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                      isSelected
                        ? isActive ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-indigo-50 dark:bg-indigo-900/30'
                        : isActive ? 'bg-gray-100 dark:bg-slate-700' : ''
                    }`}
                  >
                    <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                      {p.sku}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'}`}>
                        {p.name}
                      </p>
                      {(p.brand || p.rubro) && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 truncate leading-none mt-0.5">
                          {[p.brand?.name, p.rubro?.name].filter(Boolean).join(' · ')}
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

          {!isSearching && filtered.length === 50 && (
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
            onKeyDown={onInputKeyDown}
            placeholder="Buscar por SKU, nombre, marca…"
            role="combobox"
            aria-expanded={optionCount > 0}
            aria-activedescendant={
              optionCount > 0 ? `product-search-opt-${activeIndex}` : undefined
            }
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
