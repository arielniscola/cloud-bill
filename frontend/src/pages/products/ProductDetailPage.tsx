import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Edit, Package, Warehouse, ShoppingCart, TrendingUp, Users, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, MonthlyBarChart } from '../../components/shared';
import { productsService } from '../../services';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/formatters';
import { usePermissions } from '../../hooks/usePermissions';
import ProductPriceHistorySection from './ProductPriceHistorySection';
import type { Product, ProductOverview } from '../../types';

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: 'Compra', SALE: 'Venta', ADJUSTMENT_IN: 'Ajuste +', ADJUSTMENT_OUT: 'Ajuste −',
  TRANSFER_IN: 'Transferencia (entra)', TRANSFER_OUT: 'Transferencia (sale)', RETURN: 'Devolución',
  REMITO_OUT: 'Remito', RESERVATION: 'Reserva', RESERVATION_RELEASE: 'Liberación de reserva',
};
const OUTBOUND = new Set(['SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'REMITO_OUT', 'RESERVATION']);

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-4">
      <Icon className="w-4 h-4 text-gray-400" />
      {children}
    </h2>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums truncate">{value}</p>
      {hint && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{hint}</p>}
    </div>
  );
}

/**
 * Ficha del producto: stock por depósito, ventas de 12 meses, últimas compras
 * (proveedor y costo), movimientos e historial de precios — lo que antes había
 * que buscar en cuatro pantallas distintas.
 */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWrite: canEdit } = usePermissions();
  const [product, setProduct] = useState<Product | null>(null);
  const [overview, setOverview] = useState<ProductOverview | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([productsService.getById(id), productsService.getOverview(id)])
      .then(([p, o]) => { if (!cancelled) { setProduct(p); setOverview(o); } })
      .catch(() => { toast.error('No se pudo cargar el producto'); navigate('/products'); });
    return () => { cancelled = true; };
  }, [id, navigate]);

  const stockTotals = useMemo(() => {
    const rows = overview?.stock ?? [];
    const quantity = rows.reduce((a, r) => a + r.quantity, 0);
    const reserved = rows.reduce((a, r) => a + r.reserved, 0);
    return { quantity, reserved, available: quantity - reserved };
  }, [overview]);

  if (!product || !overview) {
    return (
      <div>
        <PageHeader title="Producto" backTo="/products" />
        <Card><p className="py-10 text-center text-sm text-gray-400">Cargando…</p></Card>
      </div>
    );
  }

  const cost = Number(product.cost) || 0;
  const price = Number(product.price) || 0;
  const margin = cost > 0 ? ((price - cost) / cost) * 100 : null;
  const lastPurchase = overview.purchases[0];
  const { sales } = overview;
  // Días de stock al ritmo de venta de los últimos 12 meses.
  const dailyUnits = sales.units / 365;
  const coverageDays = product.trackStock && dailyUnits > 0 ? Math.floor(stockTotals.available / dailyUnits) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={[product.sku, product.rubro?.name, product.brand?.name, product.isActive ? null : 'Inactivo'].filter(Boolean).join(' · ')}
        backTo="/products"
        actions={canEdit && (
          <Button onClick={() => navigate(`/products/${product.id}/edit`)}>
            <Edit className="w-4 h-4 mr-1.5" /> Editar
          </Button>
        )}
      />

      {/* Resumen */}
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Kpi label="Costo" value={formatCurrency(cost, 'ARS')}
               hint={product.costUSD != null ? `USD ${formatNumber(Number(product.costUSD), 2)}` : 'Sin IVA'} />
          <Kpi label="Precio de venta" value={formatCurrency(price, 'ARS')}
               hint={margin != null ? `Margen ${formatNumber(margin, 1)}%` : 'Sin IVA'} />
          <Kpi label="Stock disponible"
               value={product.trackStock ? formatNumber(stockTotals.available, stockTotals.available % 1 ? 2 : 0) : '—'}
               hint={!product.trackStock ? 'No lleva stock'
                 : coverageDays != null ? `Alcanza ~${formatNumber(coverageDays, 0)} días`
                 : stockTotals.reserved > 0 ? `${formatNumber(stockTotals.reserved, 0)} reservadas` : undefined} />
          <Kpi label="Vendido 12 meses" value={`${formatNumber(sales.units, sales.units % 1 ? 2 : 0)} u.`}
               hint={formatCurrency(sales.net, 'ARS')} />
          <Kpi label="Última venta" value={sales.lastSaleDate ? formatDate(sales.lastSaleDate) : '—'}
               hint={sales.avgUnitPrice != null ? `Prom. ${formatCurrency(sales.avgUnitPrice, 'ARS')}/u.` : undefined} />
          <Kpi label="Última compra" value={lastPurchase ? formatDate(lastPurchase.date) : '—'}
               hint={lastPurchase?.supplierName ?? undefined} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <SectionTitle icon={TrendingUp}>Ventas de los últimos 12 meses</SectionTitle>
          <MonthlyBarChart
            months={sales.months.map((m) => m.month)}
            emptyText="Sin ventas en los últimos 12 meses"
            measures={[
              { key: 'qty', label: 'Unidades', caption: 'Unidades vendidas por mes', values: sales.months.map((m) => m.quantity),
                format: (v) => `${formatNumber(v, v % 1 ? 2 : 0)} u.` },
              { key: 'net', label: 'Importe', caption: 'Importe neto por mes (pesos)', values: sales.months.map((m) => m.net),
                format: (v) => formatCurrency(v, 'ARS') },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle icon={Warehouse}>Stock por depósito</SectionTitle>
          {!product.trackStock ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Este producto no lleva stock (servicio).</p>
          ) : overview.stock.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Sin stock cargado en ningún depósito.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                  <th className="py-2 font-medium">Depósito</th>
                  <th className="py-2 font-medium text-right">Disponible</th>
                  <th className="py-2 font-medium text-right">Reservado</th>
                </tr>
              </thead>
              <tbody>
                {overview.stock.map((s) => {
                  const available = s.quantity - s.reserved;
                  const low = s.minQuantity != null && available <= s.minQuantity;
                  return (
                    <tr key={s.warehouseId} className="border-b border-gray-50 dark:border-slate-700/50">
                      <td className="py-2">
                        <Link to={`/warehouses/${s.warehouseId}`} className="text-gray-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400">
                          {s.warehouseName}
                        </Link>
                      </td>
                      <td className={`py-2 text-right tabular-nums ${low ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                        {formatNumber(available, available % 1 ? 2 : 0)}
                        {low && <span className="block text-[11px] font-normal">bajo el mínimo ({formatNumber(s.minQuantity!, 0)})</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-500 dark:text-slate-400">
                        {s.reserved ? formatNumber(s.reserved, s.reserved % 1 ? 2 : 0) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <SectionTitle icon={ShoppingCart}>Últimas compras</SectionTitle>
          {overview.purchases.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Sin compras registradas con este producto. Aparecen las facturas de proveedor cargadas eligiendo el producto en la línea y los remitos de compra.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                    <th className="py-2 pr-2 font-medium">Fecha</th>
                    <th className="py-2 px-2 font-medium">Proveedor</th>
                    <th className="py-2 px-2 font-medium">Comprobante</th>
                    <th className="py-2 px-2 font-medium text-right">Cantidad</th>
                    <th className="py-2 pl-2 font-medium text-right">Costo unit.</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.purchases.map((p) => (
                    <tr key={`${p.kind}-${p.id}`} className="border-b border-gray-50 dark:border-slate-700/50">
                      <td className="py-2 pr-2 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(p.date)}</td>
                      <td className="py-2 px-2">
                        {p.supplierId
                          ? <Link to={`/suppliers/${p.supplierId}`} className="text-gray-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400">{p.supplierName}</Link>
                          : '—'}
                      </td>
                      <td className="py-2 px-2">
                        <Link
                          to={p.kind === 'INVOICE' ? `/purchase-invoices/${p.id}` : `/purchase-remitos/${p.id}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                        >
                          {p.kind === 'INVOICE' ? 'Factura' : 'Remito'} {p.number}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700 dark:text-slate-300">{formatNumber(p.quantity, p.quantity % 1 ? 2 : 0)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">
                        {p.unitCost == null ? <span className="text-gray-400">—</span> : (
                          <>
                            <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(p.unitCost, p.currency)}</span>
                            {p.currency !== 'ARS' && p.exchangeRate > 1 && (
                              <span className="block text-[11px] text-gray-400 dark:text-slate-500">≈ {formatCurrency(p.unitCost * p.exchangeRate, 'ARS')}</span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle icon={Users}>Clientes que más lo compran</SectionTitle>
          <p className="-mt-3 mb-3 text-xs text-gray-400 dark:text-slate-500">Últimos 12 meses, neto de IVA</p>
          {sales.topCustomers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Sin ventas a clientes identificados.</p>
          ) : (
            <ul className="space-y-2">
              {sales.topCustomers.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <Link to={`/customers/${c.id}`} className="min-w-0 truncate text-gray-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400">
                    {c.name}
                  </Link>
                  <span className="text-right whitespace-nowrap">
                    <span className="font-medium text-gray-900 dark:text-white tabular-nums">{formatCurrency(c.net, 'ARS')}</span>
                    <span className="block text-[11px] text-gray-400 dark:text-slate-500">{formatNumber(c.quantity, c.quantity % 1 ? 2 : 0)} u.</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {product.trackStock && (
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle icon={ArrowLeftRight}>Últimos movimientos de stock</SectionTitle>
            <Link to={`/stock/movements?productId=${product.id}`} className="-mt-4 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Ver todos
            </Link>
          </div>
          {overview.movements.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Sin movimientos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                    <th className="py-2 pr-2 font-medium">Fecha</th>
                    <th className="py-2 px-2 font-medium">Tipo</th>
                    <th className="py-2 px-2 font-medium">Depósito</th>
                    <th className="py-2 px-2 font-medium">Motivo</th>
                    <th className="py-2 px-2 font-medium text-right">Cantidad</th>
                    <th className="py-2 px-2 font-medium text-right">Queda</th>
                    <th className="py-2 pl-2 font-medium">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.movements.map((m) => {
                    const out = OUTBOUND.has(m.type);
                    return (
                      <tr key={m.id} className="border-b border-gray-50 dark:border-slate-700/50">
                        <td className="py-2 pr-2 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                        <td className="py-2 px-2 text-gray-700 dark:text-slate-300 whitespace-nowrap">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-slate-400">{m.warehouseName}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-slate-400 max-w-[260px] truncate" title={m.reason ?? ''}>{m.reason ?? '—'}</td>
                        <td className={`py-2 px-2 text-right tabular-nums font-medium ${out ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {out ? '−' : '+'}{formatNumber(Math.abs(m.quantity), m.quantity % 1 ? 2 : 0)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-700 dark:text-slate-300">{formatNumber(m.newQuantity, m.newQuantity % 1 ? 2 : 0)}</td>
                        <td className="py-2 pl-2 text-gray-500 dark:text-slate-400">{m.userName ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <ProductPriceHistorySection productId={product.id} className="" />

      {product.description && (
        <Card>
          <SectionTitle icon={Package}>Descripción</SectionTitle>
          <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-line">{product.description}</p>
        </Card>
      )}
    </div>
  );
}
