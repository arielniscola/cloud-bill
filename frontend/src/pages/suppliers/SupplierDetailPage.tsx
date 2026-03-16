import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit, Package, ShoppingCart, Calendar, DollarSign, Truck, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { suppliersService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { TAX_CONDITION_OPTIONS } from '../../utils/constants';
import type { Supplier, SupplierProductStat } from '../../types';

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-400 dark:text-slate-500">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<SupplierProductStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [s, p] = await Promise.all([
          suppliersService.getById(id),
          suppliersService.getProducts(id),
        ]);
        setSupplier(s);
        setProducts(p);
      } catch {
        toast.error('Error al cargar proveedor');
        navigate('/suppliers');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !supplier) {
    return (
      <div>
        <PageHeader title="Proveedor" backTo="/suppliers" />
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-slate-700 rounded-xl" />)}
          </div>
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    );
  }

  const taxLabel = TAX_CONDITION_OPTIONS.find(t => t.value === supplier.taxCondition)?.label ?? supplier.taxCondition;
  const lastPurchase = products.length > 0
    ? products.reduce((latest, p) => p.lastPurchaseDate > latest ? p.lastPurchaseDate : latest, products[0].lastPurchaseDate)
    : null;
  const totalPurchases = products.reduce((sum, p) => sum + p.purchaseCount, 0);

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.isActive ? 'Proveedor activo' : 'Proveedor inactivo'}
        backTo="/suppliers"
        actions={
          <Button variant="outline" onClick={() => navigate(`/suppliers/${id}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Package}
          label="Productos proveídos"
          value={products.length}
          color="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          icon={ShoppingCart}
          label="Compras registradas"
          value={totalPurchases}
          color="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={Calendar}
          label="Última compra"
          value={lastPurchase ? formatDate(lastPurchase) : '—'}
          color="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={DollarSign}
          label="Condición IVA"
          value={taxLabel}
          color="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ── Products table ── */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Productos proveídos</h2>
            {products.length > 0 && (
              <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">{products.length} productos</span>
            )}
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
                <Package className="w-6 h-6 text-gray-300 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sin productos registrados</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 max-w-xs">
                Los productos aparecen aquí cuando se registran compras a este proveedor con productos vinculados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700">
                    {['Producto', 'Último precio', 'Precio actual', 'Cant. comprada', 'Compras', 'Última compra', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/products/${p.id}/edit`)}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors duration-100 group"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white leading-tight">{p.name}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5">{p.sku}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium text-gray-800 dark:text-slate-200">
                        {formatCurrency(p.lastUnitPrice, 'ARS')}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-slate-300">
                        {formatCurrency(p.price, 'ARS')}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-slate-300">
                        {Number.isInteger(p.totalQuantity) ? p.totalQuantity : p.totalQuantity.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                          {p.purchaseCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(p.lastPurchaseDate)}
                      </td>
                      <td className="px-4 py-3">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors duration-150" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Supplier info ── */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{supplier.name}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{taxLabel}</p>
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              {supplier.cuit && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 dark:text-slate-500">CUIT</dt>
                  <dd className="font-mono text-gray-700 dark:text-slate-300">{supplier.cuit}</dd>
                </div>
              )}
              {supplier.phone && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 dark:text-slate-500">Teléfono</dt>
                  <dd className="text-gray-700 dark:text-slate-300">{supplier.phone}</dd>
                </div>
              )}
              {supplier.email && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 dark:text-slate-500">Email</dt>
                  <dd className="text-gray-700 dark:text-slate-300 truncate max-w-[160px]" title={supplier.email}>{supplier.email}</dd>
                </div>
              )}
              {supplier.address && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 dark:text-slate-500">Dirección</dt>
                  <dd className="text-gray-700 dark:text-slate-300 text-right max-w-[160px]">{supplier.address}</dd>
                </div>
              )}
              {supplier.city && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 dark:text-slate-500">Ciudad</dt>
                  <dd className="text-gray-700 dark:text-slate-300">{supplier.city}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-400 dark:text-slate-500">Estado</dt>
                <dd>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${supplier.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${supplier.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    {supplier.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </dd>
              </div>
            </dl>

            {supplier.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Notas</p>
                <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{supplier.notes}</p>
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
}
