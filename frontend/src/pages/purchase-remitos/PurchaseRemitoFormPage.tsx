import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '../../components/ui';
import { PageHeader, ProductSearchSelect } from '../../components/shared';
import { purchaseRemitosService, suppliersService, warehousesService, productsService, purchaseInvoicesService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { CreatePurchaseRemitoItemDTO, Supplier, Warehouse, Product, PurchaseInvoice, PurchaseRemito } from '../../types';

// Límite por línea de la factura: cuánto trae la FC y cuánto ya se recibió en remitos previos.
interface InvoiceLimit { description: string; invoiceQty: number; received: number; }

const normDesc = (d: string) => d.trim().toLowerCase();

const defaultItem: CreatePurchaseRemitoItemDTO = {
  productId: null,
  description: '',
  quantity: 1,
  unitPrice: 0,
};

export default function PurchaseRemitoFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromInvoice = (location.state as { fromInvoice?: PurchaseInvoice } | null)?.fromInvoice ?? null;
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [isSaving,   setIsSaving]   = useState(false);

  const [form, setForm] = useState({
    supplierId:  '',
    warehouseId: '',
    date:        new Date().toISOString().split('T')[0],
    notes:       '',
  });
  const [items, setItems] = useState<CreatePurchaseRemitoItemDTO[]>([{ ...defaultItem }]);
  // Remitos ya generados para la FC + límites por línea (para no recibir de más).
  const [priorRemitos, setPriorRemitos] = useState<PurchaseRemito[]>([]);
  const [invoiceLimits, setInvoiceLimits] = useState<Record<string, InvoiceLimit>>({});

  useEffect(() => {
    Promise.all([
      suppliersService.getAll({ limit: 200, isActive: true }),
      warehousesService.getAll(),
      productsService.getAll({ limit: 1000, isActive: true }),
    ])
      .then(async ([suppRes, wareRes, prodRes]) => {
        setSuppliers(suppRes.data);
        setWarehouses(wareRes);
        setProducts(prodRes.data);
        if (wareRes.length === 1) setForm((f) => ({ ...f, warehouseId: wareRes[0].id }));

        // Prefill desde una factura de compra (registrar mercadería)
        if (fromInvoice) {
          setForm((f) => ({
            ...f,
            supplierId: fromInvoice.supplierId ?? '',
            notes: `Mercadería de factura ${fromInvoice.number}`,
          }));

          // Cantidades ya recibidas en remitos previos (no cancelados) de esta factura,
          // para que una FC con N remitos parciales no vuelva a ingresar todo el stock.
          const priorLinks = (fromInvoice.remitos ?? []).filter((r) => r.status !== 'CANCELLED');
          const received = new Map<string, number>(); // key: descripción normalizada
          try {
            const details = await Promise.all(priorLinks.map((r) => purchaseRemitosService.getById(r.id)));
            setPriorRemitos(details);
            for (const d of details) {
              for (const it of d.items ?? []) {
                const key = normDesc(it.description);
                received.set(key, (received.get(key) ?? 0) + Number(it.quantity));
              }
            }
          } catch { /* si no se pueden leer los remitos previos, asumimos 0 recibido */ }

          // Límites por línea de la factura (para validar que no se reciba de más).
          const limits: Record<string, InvoiceLimit> = {};
          for (const it of fromInvoice.items ?? []) {
            const key = normDesc(it.description);
            const prev = limits[key];
            limits[key] = {
              description: it.description,
              invoiceQty: (prev?.invoiceQty ?? 0) + Number(it.quantity),
              received: received.get(key) ?? 0,
            };
          }
          setInvoiceLimits(limits);

          const prefill = Object.values(limits)
            .map((lim) => {
              const key = normDesc(lim.description);
              const pending = lim.invoiceQty - lim.received;
              // Auto-vincula el producto si el nombre coincide exactamente (para que mueva stock)
              const match = prodRes.data.find((p) => p.name.trim().toLowerCase() === key);
              const invItem = (fromInvoice.items ?? []).find((it) => normDesc(it.description) === key);
              return {
                productId: match?.id ?? null,
                description: lim.description,
                quantity: pending,
                unitPrice: Number(invItem?.unitPrice ?? 0),
              };
            })
            .filter((it) => it.quantity > 0);

          if (prefill.length > 0) {
            setItems(prefill);
          } else {
            toast('Esta factura ya tiene toda la mercadería recibida en remitos previos', { icon: 'ℹ️' });
          }
        }
      })
      .catch(() => toast.error('Error al cargar datos'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem    = () => setItems((prev) => [...prev, { ...defaultItem }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (index: number, field: keyof CreatePurchaseRemitoItemDTO, value: string | number | null) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const handleProductSelect = (index: number, productId: string, picked?: Product) => {
    const product = picked ?? products.find((p) => p.id === productId);
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? product
            ? { ...item, productId, description: product.name, unitPrice: product.cost }
            : { ...item, productId: null }
          : item
      )
    );
  };

  const itemTotal = (item: CreatePurchaseRemitoItemDTO) => item.quantity * (item.unitPrice ?? 0);
  const grandTotal = items.reduce((acc, item) => acc + itemTotal(item), 0);

  // Pendiente de recibir para una línea de la factura (cantidad de la FC − ya recibido).
  const pendingForDesc = (description: string): number | null => {
    const lim = invoiceLimits[normDesc(description)];
    return lim ? lim.invoiceQty - lim.received : null;
  };

  // Valida que, viniendo de una factura, no se reciba más de lo que la FC tiene pendiente.
  // Devuelve un mensaje de error o null si está todo bien.
  const validateAgainstInvoice = (): string | null => {
    if (!fromInvoice) return null;
    const byDesc = new Map<string, number>();
    for (const it of items) {
      const key = normDesc(it.description);
      byDesc.set(key, (byDesc.get(key) ?? 0) + Number(it.quantity));
    }
    for (const [key, qty] of byDesc) {
      const lim = invoiceLimits[key];
      if (!lim) {
        return `"${items.find((i) => normDesc(i.description) === key)?.description}" no pertenece a la factura ${fromInvoice.number}`;
      }
      const pending = lim.invoiceQty - lim.received;
      if (qty > pending + 0.0001) {
        return `No podés recibir ${qty} de "${lim.description}": la factura solo tiene ${pending} pendiente`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId)  { toast.error('Seleccione un proveedor'); return; }
    if (!form.warehouseId) { toast.error('Seleccione el almacén de destino'); return; }
    if (items.length === 0 || items.some((i) => !i.description || i.quantity <= 0)) {
      toast.error('Complete todos los ítems correctamente');
      return;
    }
    const invoiceError = validateAgainstInvoice();
    if (invoiceError) { toast.error(invoiceError); return; }

    setIsSaving(true);
    try {
      const remito = await purchaseRemitosService.create({ ...form, items });
      // Si viene de una factura, vincular el remito a esa factura (trazabilidad)
      if (fromInvoice) {
        const remitoIds = [...(fromInvoice.remitos?.map((r) => r.id) ?? []), remito.id];
        await purchaseInvoicesService.update(fromInvoice.id, { remitoIds }).catch(() => {
          toast('Remito creado, pero no se pudo vincular a la factura', { icon: '⚠️' });
        });
      }
      toast.success('Remito recibido — stock actualizado');
      navigate(`/purchase-remitos/${remito.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar el remito');
    } finally {
      setIsSaving(false);
    }
  };

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: `${s.name}${s.cuit ? ` (${s.cuit})` : ''}` }));
  const warehouseOptions = [{ value: '', label: 'Seleccionar almacén...' }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))];

  return (
    <div>
      <PageHeader
        title={fromInvoice ? `Registrar mercadería (factura ${fromInvoice.number})` : 'Nuevo Remito de Compra'}
        subtitle={fromInvoice ? 'Recepción de mercadería de la factura — entra al stock al guardar' : 'Recepción de mercadería (sin factura)'}
        backTo="/purchase-remitos"
      />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* Items */}
          <div className="space-y-4 min-w-0">
            {/* Remitos ya generados para esta factura */}
            {fromInvoice && priorRemitos.length > 0 && (
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                    Remitos ya generados ({priorRemitos.length})
                  </h2>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {priorRemitos.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(`/purchase-remitos/${r.id}`)}
                      className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-indigo-50/40 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm text-gray-800 dark:text-slate-200">{r.number}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {new Date(r.date).toLocaleDateString('es-AR')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">
                        {(r.items ?? []).reduce((s, it) => s + Number(it.quantity), 0)} u. · {(r.items?.length ?? 0)} ít.
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Mercadería recibida</h2>
              </div>
              <div className="px-5 py-3">
                <div className="hidden md:grid grid-cols-[2fr_3fr_72px_120px_100px_32px] gap-3 pb-2 mb-1 border-b border-gray-100 dark:border-slate-700">
                  {['Producto', 'Descripción', 'Cant.', 'Costo unit.', 'Total', ''].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_3fr_72px_120px_100px_32px] gap-3 items-center py-3">
                      <ProductSearchSelect
                        products={products}
                        value={item.productId ?? ''}
                        onChange={(pid, picked) => handleProductSelect(index, pid, picked)}
                        optional
                        serverSearch
                        searchParams={{ isActive: true }}
                      />
                      <input
                        type="text"
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Descripción"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        required
                      />
                      {(() => {
                        const pending = fromInvoice ? pendingForDesc(item.description) : null;
                        const over = pending !== null && item.quantity > pending + 0.0001;
                        return (
                          <div>
                            <input
                              type="number" min="0.01" step="0.01"
                              max={pending ?? undefined}
                              className={`w-full border rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 ${
                                over
                                  ? 'border-red-400 focus:ring-red-500'
                                  : 'border-gray-300 dark:border-slate-600 focus:ring-indigo-500'
                              }`}
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            />
                            {pending !== null && (
                              <span className={`block text-right text-[10px] mt-0.5 ${over ? 'text-red-500 font-medium' : 'text-gray-400 dark:text-slate-500'}`}>
                                {over ? `máx. ${pending}` : `pend. ${pending}`}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <input
                        type="number" min="0" step="0.01"
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={item.unitPrice ?? 0}
                        onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums text-right">
                        {formatCurrency(itemTotal(item), 'ARS')}
                      </span>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => removeItem(index)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-gray-100 dark:border-slate-700 mt-2">
                  <button type="button" onClick={addItem}
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors py-1">
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Notas</label>
              <textarea
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={3}
                placeholder="N° de remito del proveedor, transportista, observaciones..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
              <Select
                label="Proveedor *"
                options={[{ value: '', label: 'Seleccionar proveedor...' }, ...supplierOptions]}
                value={form.supplierId}
                onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
              />
              <Select
                label="Almacén destino *"
                options={warehouseOptions}
                value={form.warehouseId}
                onChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
              />
              <Input
                label="Fecha"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
              <p className="text-xs text-indigo-600 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 shrink-0" />
                La mercadería vinculada a un producto entra al stock al guardar.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-slate-400">Valorización estimada</span>
                <span className="text-xl font-bold text-indigo-600 tabular-nums">{formatCurrency(grandTotal, 'ARS')}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button type="submit" isLoading={isSaving} className="w-full justify-center">Registrar recepción</Button>
              <Button type="button" variant="outline" className="w-full justify-center" onClick={() => navigate('/purchase-remitos')}>Cancelar</Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
