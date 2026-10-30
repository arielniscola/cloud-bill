import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, ConfirmDialog, Pagination } from '../../components/shared';
import { productsService } from '../../services';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { apiErrorMessage } from '../../utils/apiError';
import { PRICE_SOURCE_LABEL, pctChange, formatPct } from '../../utils/priceHistory';
import type { PriceOperation, PriceOperationItem } from '../../types';

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-300 dark:text-slate-600">—</span>;
  return (
    <span className={value > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
      {formatPct(value)}
    </span>
  );
}

function Change({ oldV, newV }: { oldV: number | null; newV: number | null }) {
  if (oldV == null) return <span className="text-gray-700 dark:text-slate-300">{newV != null ? formatCurrency(newV, 'ARS') : '—'}</span>;
  if (newV == null || Math.abs(newV - oldV) < 0.005) return <span className="text-gray-400 dark:text-slate-500">{formatCurrency(oldV, 'ARS')}</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-gray-400 dark:text-slate-500">{formatCurrency(oldV, 'ARS')}</span>
      {' → '}
      <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(newV, 'ARS')}</span>
      <span className="ml-1.5 text-xs"><Pct value={pctChange(oldV, newV)} /></span>
    </span>
  );
}

/** Productos de una operación: antes → después y si todavía sigue vigente. */
function OperationDetail({ refId }: { refId: string }) {
  const [items, setItems] = useState<PriceOperationItem[] | null>(null);
  useEffect(() => {
    productsService.getPriceOperation(refId).then(setItems).catch(() => setItems([]));
  }, [refId]);

  if (items === null) return <p className="px-4 py-3 text-xs text-gray-400">Cargando…</p>;
  return (
    <div className="px-4 pb-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
            <th className="py-2 pr-2 font-medium">Producto</th>
            <th className="py-2 px-2 font-medium text-right">Costo</th>
            <th className="py-2 px-2 font-medium text-right">Precio venta</th>
            <th className="py-2 pl-2 font-medium">Hoy</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-50 dark:border-slate-700/50">
              <td className="py-1.5 pr-2">
                <Link to={`/products/${it.productId}`} className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400">
                  {it.name}
                </Link>
                <span className="ml-1.5 text-gray-400 dark:text-slate-500">{it.sku}</span>
              </td>
              <td className="py-1.5 px-2 text-right"><Change oldV={it.oldCost} newV={it.newCost} /></td>
              <td className="py-1.5 px-2 text-right"><Change oldV={it.oldPrice} newV={it.newPrice} /></td>
              <td className="py-1.5 pl-2 text-gray-500 dark:text-slate-400">
                {it.oldPrice == null && it.oldCost == null
                  ? 'Alta (no se deshace)'
                  : it.isCurrent ? 'Sin cambios desde entonces' : 'Cambió después (no se deshace)'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Operaciones que cambiaron precios o costos de varios productos a la vez
 * (actualización masiva, importación, recálculo USD, factura de compra). Cada
 * una se puede revisar producto por producto y deshacer.
 */
export default function PriceHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openRef = searchParams.get('ref');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<PriceOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [toRevert, setToRevert] = useState<PriceOperation | null>(null);
  const [reverting, setReverting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await productsService.getPriceOperations(page, limit);
      setRows(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      toast.error(apiErrorMessage(e) ?? 'No se pudo cargar el historial');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit]);
  useEffect(() => { load(); }, [load]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const toggle = (ref: string) => setParam('ref', openRef === ref ? null : ref);

  const handleRevert = async () => {
    if (!toRevert) return;
    setReverting(true);
    try {
      const r = await productsService.revertPriceOperation(toRevert.ref);
      toast.success(
        `${r.reverted} producto${r.reverted === 1 ? '' : 's'} volvieron al valor anterior`
        + (r.changedSince ? ` · ${r.changedSince} sin tocar porque cambiaron después` : ''),
      );
      setToRevert(null);
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e) ?? 'No se pudo deshacer');
    } finally {
      setReverting(false);
    }
  };

  const describe = (op: PriceOperation) =>
    `${PRICE_SOURCE_LABEL[op.source] ?? op.source}${op.invoiceNumber ? ` ${op.invoiceNumber}` : ''}`;

  return (
    <div>
      <PageHeader
        title="Historial de precios"
        subtitle="Cambios de precio y costo hechos sobre varios productos a la vez"
        backTo="/products"
      />

      <Card padding="none">
        {isLoading && rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-slate-400">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-slate-400">
            Todavía no hay operaciones. Aparecen acá las actualizaciones masivas, importaciones, recálculos de costos USD y
            actualizaciones de costo desde facturas de compra. Las ediciones de un solo producto se ven en su ficha.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                  <th className="px-4 py-3 w-8" />
                  <th className="px-2 py-3 font-medium">Fecha</th>
                  <th className="px-2 py-3 font-medium">Operación</th>
                  <th className="px-2 py-3 font-medium">Usuario</th>
                  <th className="px-2 py-3 font-medium text-right">Productos</th>
                  <th className="px-2 py-3 font-medium text-right">Costo (prom.)</th>
                  <th className="px-2 py-3 font-medium text-right">Precio (prom.)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((op) => {
                  const open = openRef === op.ref;
                  const canRevert = !op.reverted && op.products > op.created;
                  return [
                    <tr
                      key={op.ref}
                      className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer"
                      onClick={() => toggle(op.ref)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-2 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDateTime(op.createdAt)}</td>
                      <td className="px-2 py-3 text-gray-900 dark:text-white">
                        {describe(op)}
                        {op.reverted && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">Deshecha</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-gray-500 dark:text-slate-400">{op.userName ?? '—'}</td>
                      <td className="px-2 py-3 text-right text-gray-700 dark:text-slate-300 whitespace-nowrap">
                        {op.products}
                        {op.created > 0 && <span className="text-xs text-gray-400 dark:text-slate-500"> ({op.created} alta{op.created === 1 ? '' : 's'})</span>}
                      </td>
                      <td className="px-2 py-3 text-right"><Pct value={op.avgCostPct} /></td>
                      <td className="px-2 py-3 text-right"><Pct value={op.avgPricePct} /></td>
                      <td className="px-4 py-3 text-right">
                        {canRevert && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); setToRevert(op); }}
                          >
                            <Undo2 className="w-3.5 h-3.5 mr-1" /> Deshacer
                          </Button>
                        )}
                      </td>
                    </tr>,
                    open && (
                      <tr key={`${op.ref}-detail`} className="bg-gray-50/60 dark:bg-slate-800/40">
                        <td colSpan={8}><OperationDetail refId={op.ref} /></td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={(p) => setParam('page', p > 1 ? String(p) : null)}
            onLimitChange={(l) => { setLimit(l); setParam('page', null); }}
          />
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!toRevert}
        onClose={() => setToRevert(null)}
        onConfirm={handleRevert}
        isLoading={reverting}
        variant="warning"
        title="Deshacer cambio de precios"
        message={toRevert
          ? `Los productos de "${describe(toRevert)}" vuelven al costo y precio que tenían antes. `
            + 'Los que se modificaron después no se tocan, y los productos dados de alta por la operación quedan como están.'
          : ''}
        confirmText="Deshacer"
      />
    </div>
  );
}
