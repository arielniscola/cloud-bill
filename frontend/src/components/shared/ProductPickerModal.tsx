import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Package, Loader2, Check } from 'lucide-react';
import { productsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { Product } from '../../types';

const PAGE_SIZE = 25;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Devuelve los productos elegidos. En modo simple siempre es un solo elemento. */
  onSelect: (products: Product[]) => void;
  /** Permite marcar varios y agregarlos de una sola vez. */
  multiple?: boolean;
  /** Proveedor del comprobante: habilita el filtro "solo de este proveedor". */
  supplierId?: string | null;
  supplierName?: string;
  /** Moneda en la que mostrar el costo. */
  currency?: string;
  /** Producto ya elegido en la fila (modo simple), para marcarlo en la lista. */
  selectedId?: string | null;
}

export function ProductPickerModal({
  isOpen, onClose, onSelect, multiple = false,
  supplierId = null, supplierName, currency = 'ARS', selectedId = null,
}: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [onlySupplier, setOnlySupplier] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [picked, setPicked] = useState<Product[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Al abrir: estado limpio y foco en la búsqueda (se puede tipear de una).
  useEffect(() => {
    if (!isOpen) return;
    setQuery(''); setDebounced(''); setPage(1); setPicked([]); setOnlySupplier(false);
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchProducts = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const res = await productsService.getAll({
        page,
        limit: PAGE_SIZE,
        isActive: true,
        search: debounced || undefined,
        supplierId: onlySupplier && supplierId ? supplierId : undefined,
      });
      setProducts(res.data);
      setTotal(res.total);
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, page, debounced, onlySupplier, supplierId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Escape cierra el buscador (no el formulario que hay detrás).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isPicked = (p: Product) => picked.some((x) => x.id === p.id);

  const handleRowClick = (p: Product) => {
    if (!multiple) { onSelect([p]); onClose(); return; }
    setPicked((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));
  };

  const confirmMultiple = () => {
    if (picked.length === 0) return;
    onSelect(picked);
    onClose();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] overflow-hidden">

        {/* Header + búsqueda */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Buscar productos</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                {multiple ? 'Marcá los que quieras agregar a la factura' : 'Elegí el producto para esta línea'}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 animate-spin" />}
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, código o código de barras…"
                className="w-full text-sm pl-9 pr-9 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700"
              />
            </div>
            {supplierId && (
              <button
                type="button"
                onClick={() => { setOnlySupplier((v) => !v); setPage(1); }}
                className={`shrink-0 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                  onlySupplier
                    ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800'
                    : 'text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600'
                }`}
                title={supplierName ? `Mostrar solo productos de ${supplierName}` : 'Filtrar por el proveedor de la factura'}
              >
                Solo de este proveedor
              </button>
            )}
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && products.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-400">Buscando…</p>
          ) : products.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Package className="w-8 h-8 mx-auto text-gray-200 dark:text-slate-600" />
              <p className="mt-3 text-sm text-gray-400">
                {debounced ? `Sin resultados para «${debounced}»` : 'No hay productos activos'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800/95 backdrop-blur border-b border-gray-100 dark:border-slate-700">
                <tr className="text-left text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  {multiple && <th className="pl-6 pr-2 py-2.5 w-10" />}
                  <th className={`${multiple ? 'px-3' : 'pl-6 pr-3'} py-2.5 w-36`}>Código</th>
                  <th className="px-3 py-2.5">Producto</th>
                  <th className="px-3 py-2.5 w-32 text-right">Costo</th>
                  <th className="px-3 py-2.5 w-20 text-right">IVA</th>
                  <th className="px-3 py-2.5 w-24 pr-6 text-right">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {products.map((p) => {
                  const chosen = multiple ? isPicked(p) : p.id === selectedId;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleRowClick(p)}
                      className={`cursor-pointer transition-colors ${
                        chosen ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-indigo-50/40 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      {multiple && (
                        <td className="pl-6 pr-2 py-2.5">
                          <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                            chosen ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-slate-500'
                          }`}>
                            {chosen && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </span>
                        </td>
                      )}
                      <td className={`${multiple ? 'px-3' : 'pl-6 pr-3'} py-2.5 font-mono text-[13px] text-gray-600 dark:text-slate-300`}>
                        {p.sku}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-sm text-gray-800 dark:text-slate-200">{p.name}</p>
                        {(p.brand || p.rubro) && (
                          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                            {[p.brand?.name, p.rubro?.name].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                        {formatCurrency(Number(p.cost), currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-gray-500 dark:text-slate-400">
                        {Number(p.taxRate)}%
                      </td>
                      <td className="px-3 py-2.5 pr-6 text-right text-[13px] tabular-nums text-gray-400 dark:text-slate-500">
                        {formatCurrency(Number(p.price), currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pie: paginado + confirmación */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40">
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {total > 0
              ? <>{products.length} de <span className="tabular-nums font-semibold text-gray-700 dark:text-slate-300">{total}</span> productos</>
              : 'Sin resultados'}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-xs text-gray-400 tabular-nums px-1">{page} / {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}

          <div className="flex-1" />

          {multiple ? (
            <>
              <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                {picked.length} {picked.length === 1 ? 'marcado' : 'marcados'}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmMultiple}
                disabled={picked.length === 0}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Agregar {picked.length > 0 && `(${picked.length})`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductPickerModal;
