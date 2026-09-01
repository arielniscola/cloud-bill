import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Package, Plus, Check, X } from 'lucide-react';
import { Modal } from '../ui';
import { warehousesService, stockService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { Product, Currency } from '../../types';

export interface ProductCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAdd: (product: Product, quantity?: number) => void;
  /** Moneda para mostrar el precio (ARS usa price, USD usa salePriceUSD). */
  currency?: Currency;
}

/**
 * Buscador de productos en modal. Muestra código (SKU), nombre, precio y stock
 * disponible (sumado entre almacenes). Permite agregar el producto al
 * comprobante sin cerrar el modal, para cargar varios de una pasada.
 *
 * El stock se carga una sola vez al abrir, agregando el stock disponible
 * (quantity - reservedQuantity) de cada almacén → un request por almacén.
 */
export default function ProductCatalogModal({
  isOpen,
  onClose,
  products,
  onAdd,
  currency = 'ARS',
}: ProductCatalogModalProps) {
  const [query, setQuery] = useState('');
  const [stockByProduct, setStockByProduct] = useState<Record<string, number> | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [justAdded, setJustAdded] = useState<Record<string, number>>({});
  /** Fila resaltada, movible con las flechas. */
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const addedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cargar stock disponible por producto al abrir (una sola vez por apertura)
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setJustAdded({});
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 50);
    if (stockByProduct !== null) return;
    let cancelled = false;
    setStockLoading(true);
    (async () => {
      try {
        const warehouses = await warehousesService.getAll();
        const active = warehouses.filter((w) => w.isActive);
        const lists = await Promise.all(
          active.map((w) => stockService.getWarehouseStock(w.id).catch(() => []))
        );
        const map: Record<string, number> = {};
        lists.flat().forEach((s) => {
          const available = Number(s.quantity) - Number(s.reservedQuantity);
          map[s.productId] = (map[s.productId] ?? 0) + available;
        });
        if (!cancelled) setStockByProduct(map);
      } catch {
        if (!cancelled) setStockByProduct({});
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Limpiar timers al desmontar
  useEffect(() => () => {
    Object.values(addedTimers.current).forEach(clearTimeout);
  }, []);

  const priceOf = (p: Product) =>
    currency === 'USD' ? p.salePriceUSD ?? 0 : p.price;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? products.filter(
          (p) =>
            p.sku.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.barcode ?? '').toLowerCase().includes(q) ||
            (p.brand?.name ?? '').toLowerCase().includes(q) ||
            (p.rubro?.name ?? '').toLowerCase().includes(q)
        )
      : products;
    return base.slice(0, 80);
  }, [products, query]);

  const handleAdd = (product: Product) => {
    onAdd(product, 1);
    setJustAdded((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 0) + 1 }));
    clearTimeout(addedTimers.current[product.id]);
    addedTimers.current[product.id] = setTimeout(() => {
      setJustAdded((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }, 1600);
  };

  // Al cambiar lo tecleado el resaltado vuelve arriba: si no, quedaría
  // apuntando a una fila que ahora es otro producto.
  useEffect(() => { setActiveIndex(0); }, [query]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;

    const move = (next: number) => {
      e.preventDefault();
      setActiveIndex(next);
      listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    };

    if (e.key === 'ArrowDown') return move((activeIndex + 1) % filtered.length);
    if (e.key === 'ArrowUp') return move((activeIndex - 1 + filtered.length) % filtered.length);
    if (e.key === 'Home') return move(0);
    if (e.key === 'End') return move(filtered.length - 1);

    if (e.key === 'Enter') {
      e.preventDefault();
      const product = filtered[activeIndex];
      // Agrega y deja el modal abierto: es el punto de esta pantalla, cargar
      // varios sin salir. El foco se queda en la búsqueda para seguir tipeando.
      if (product) handleAdd(product);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Buscar producto" size="full" showCloseButton>
      {/* Search box */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400">
        <Search className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Buscar por código, nombre, marca, rubro o código de barras…"
          role="combobox"
          aria-expanded={filtered.length > 0}
          aria-controls="catalog-results"
          aria-activedescendant={
            filtered[activeIndex] ? `catalog-opt-${activeIndex}` : undefined
          }
          className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 min-w-0"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[120px_1fr_120px_100px_88px] gap-3 px-3 pt-4 pb-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b border-gray-100 dark:border-slate-700">
        <span>Código</span>
        <span>Producto</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Stock</span>
        <span />
      </div>

      {/* Rows */}
      <div
        ref={listRef}
        id="catalog-results"
        role="listbox"
        className="max-h-[55vh] overflow-y-auto [scrollbar-width:thin] divide-y divide-gray-50 dark:divide-slate-700/60"
      >
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Package className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-slate-500">
              {query ? `Sin resultados para "${query}"` : 'Sin productos disponibles'}
            </p>
          </div>
        ) : (
          filtered.map((p, idx) => {
            const added = justAdded[p.id];
            const stock = stockByProduct?.[p.id];
            const isActive = idx === activeIndex;
            return (
              <div
                key={p.id}
                id={`catalog-opt-${idx}`}
                data-idx={idx}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`grid grid-cols-[120px_1fr_120px_100px_88px] gap-3 items-center px-3 py-2.5 transition-colors ${
                  isActive ? 'bg-gray-50 dark:bg-slate-700/40' : ''
                }`}
              >
                {/* SKU */}
                <span className="font-mono text-[11px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded truncate" title={p.sku}>
                  {p.sku}
                </span>

                {/* Name + brand/rubro */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate leading-tight">{p.name}</p>
                  {(p.brand || p.rubro) && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate leading-none mt-0.5">
                      {[p.brand?.name, p.rubro?.name].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Price */}
                <span className="text-right text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatCurrency(priceOf(p), currency)}
                </span>

                {/* Stock */}
                <span className="text-right text-sm tabular-nums">
                  {stockLoading ? (
                    <span className="text-gray-300 dark:text-slate-600">…</span>
                  ) : stock === undefined ? (
                    <span className="text-gray-300 dark:text-slate-600">—</span>
                  ) : (
                    <span className={stock <= 0 ? 'text-red-500 font-semibold' : 'text-gray-600 dark:text-slate-300'}>
                      {Number.isInteger(stock) ? stock : stock.toFixed(2)}
                    </span>
                  )}
                </span>

                {/* Add */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAdd(p)}
                    className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                      added
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                    }`}
                  >
                    {added ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        {added > 1 ? `×${added}` : 'Agregado'}
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Agregar
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100 dark:border-slate-700">
        <p className="text-xs text-gray-400 dark:text-slate-500">
          {filtered.length === 80 ? 'Mostrando 80 resultados · refiná la búsqueda' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          Listo
        </button>
      </div>
    </Modal>
  );
}
