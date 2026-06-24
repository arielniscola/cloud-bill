import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '../../components/ui';
import { PageHeader, ProductSearchSelect } from '../../components/shared';
import { purchaseRemitosService, suppliersService, warehousesService, productsService, purchaseInvoicesService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { CreatePurchaseRemitoItemDTO, Supplier, Warehouse, Product, PurchaseInvoice } from '../../types';

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

  useEffect(() => {
    Promise.all([
      suppliersService.getAll({ limit: 200, isActive: true }),
      warehousesService.getAll(),
      productsService.getAll({ limit: 1000, isActive: true }),
    ])
      .then(([suppRes, wareRes, prodRes]) => {
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
          const prefill = (fromInvoice.items ?? []).map((it) => {
            // Auto-vincula el producto si el nombre coincide exactamente (para que mueva stock)
            const match = prodRes.data.find(
              (p) => p.name.trim().toLowerCase() === it.description.trim().toLowerCase()
            );
            return {
              productId: match?.id ?? null,
              description: it.description,
              quantity: Number(it.quantity),
              unitPrice: Number(it.unitPrice),
            };
          });
          if (prefill.length > 0) setItems(prefill);
        }
      })
      .catch(() => toast.error('Error al cargar datos'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem    = () => setItems((prev) => [...prev, { ...defaultItem }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (index: number, field: keyof CreatePurchaseRemitoItemDTO, value: string | number | null) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId)  { toast.error('Seleccione un proveedor'); return; }
    if (!form.warehouseId) { toast.error('Seleccione el almacén de destino'); return; }
    if (items.length === 0 || items.some((i) => !i.description || i.quantity <= 0)) {
      toast.error('Complete todos los ítems correctamente');
      return;
    }

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
                        onChange={(pid) => handleProductSelect(index, pid)}
                        optional
                      />
                      <input
                        type="text"
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Descripción"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        required
                      />
                      <input
                        type="number" min="0.01" step="0.01"
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      />
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
