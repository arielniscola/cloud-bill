import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Package, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '../../components/ui';
import { PageHeader, BarcodeProductInput, ProductSearchSelect } from '../../components/shared';
import type { BarcodeProductInputHandle } from '../../components/shared';
import { purchasesService, suppliersService, warehousesService, productsService } from '../../services';
import { CURRENCY_OPTIONS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import type { CreatePurchaseDTO, CreatePurchaseItemDTO, Supplier, Warehouse, Product } from '../../types';

const defaultItem: CreatePurchaseItemDTO = {
  productId: null,
  description: '',
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,     // no IVA discrimination in purchases
};

export default function PurchaseFormPage() {
  const navigate = useNavigate();
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [isSaving,   setIsSaving]   = useState(false);

  const barcodeRef = useRef<BarcodeProductInputHandle>(null);

  const [form, setForm] = useState<Omit<CreatePurchaseDTO, 'items' | 'type' | 'number'>>({
    supplierId:  '',
    warehouseId: null,
    date:        new Date().toISOString().split('T')[0],
    currency:    'ARS',
    notes:       '',
  });

  const [items, setItems] = useState<CreatePurchaseItemDTO[]>([{ ...defaultItem }]);

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
      })
      .catch(() => toast.error('Error al cargar datos'));
  }, []);

  const addItem    = () => setItems((prev) => [...prev, { ...defaultItem }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (index: number, field: keyof CreatePurchaseItemDTO, value: string | number | null) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, productId, description: product.name, unitPrice: product.cost, taxRate: 0 }
            : item
        )
      );
    } else {
      updateItem(index, 'productId', null);
    }
  };

  const handleBarcodeAdd = (product: Product) => {
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      updateItem(existingIndex, 'quantity', Number(items[existingIndex].quantity) + 1);
    } else {
      setItems((prev) => [
        ...prev,
        { productId: product.id, description: product.name, quantity: 1, unitPrice: product.cost, taxRate: 0 },
      ]);
    }
  };

  const itemTotal = (item: CreatePurchaseItemDTO) => item.quantity * item.unitPrice;
  const grandTotal = items.reduce((acc, item) => acc + itemTotal(item), 0);
  const currency   = form.currency || 'ARS';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId) { toast.error('Seleccione un proveedor'); return; }
    if (items.some((i) => !i.description || i.quantity <= 0)) {
      toast.error('Complete todos los ítems correctamente');
      return;
    }

    setIsSaving(true);
    try {
      await purchasesService.create({ ...form, type: 'FACTURA_A', number: '', items });
      const hasStockItems = form.warehouseId && items.some((i) => i.productId);
      toast.success(hasStockItems ? 'Compra registrada y stock actualizado' : 'Compra registrada');
      navigate('/purchases');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar compra');
    } finally {
      setIsSaving(false);
    }
  };

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: `${s.name}${s.cuit ? ` (${s.cuit})` : ''}`,
  }));
  const warehouseOptions = [
    { value: '', label: 'Sin actualizar stock' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader title="Nueva Compra" backTo="/purchases" />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

          {/* ── Left: items ── */}
          <div className="space-y-4 min-w-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ítems recibidos</h2>
                <BarcodeProductInput ref={barcodeRef} products={products} onAdd={handleBarcodeAdd} />
              </div>

              <div className="px-5 py-3">
                <div className="hidden md:grid grid-cols-[2fr_3fr_72px_120px_100px_32px] gap-3 pb-2 mb-1 border-b border-gray-100 dark:border-slate-700">
                  {['Producto', 'Descripción', 'Cant.', 'Precio unit.', 'Total', ''].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_3fr_72px_120px_100px_32px] gap-3 items-center py-3">
                      {/* Product */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Producto</label>
                        <ProductSearchSelect
                          products={products}
                          value={item.productId ?? ''}
                          onChange={(pid) => handleProductSelect(index, pid)}
                          optional
                        />
                      </div>
                      {/* Description */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Descripción *</label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Descripción"
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          required
                        />
                      </div>
                      {/* Quantity */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Cant.</label>
                        <input
                          type="number" min="0.01" step="0.01"
                          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      {/* Unit price */}
                      <div>
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Precio unit.</label>
                        <input
                          type="number" min="0" step="0.01"
                          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      {/* Total */}
                      <div className="text-right">
                        <label className="block md:hidden text-xs text-gray-400 mb-1">Total</label>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(itemTotal(item), currency)}
                        </span>
                      </div>
                      {/* Remove */}
                      <div className="flex justify-end">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(index)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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

            {/* Notes */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Notas</label>
              <textarea
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={3}
                placeholder="Condiciones, aclaraciones..."
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          {/* ── Right: sticky metadata + totals ── */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
              <Select
                label="Proveedor *"
                options={[{ value: '', label: 'Seleccionar proveedor...' }, ...supplierOptions]}
                value={form.supplierId}
                onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
              />
              <Input
                label="Fecha"
                type="date"
                value={form.date || ''}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
              <Select
                label="Almacén destino"
                options={warehouseOptions}
                value={form.warehouseId ?? ''}
                onChange={(v) => setForm((f) => ({ ...f, warehouseId: v || null }))}
              />
              <Select
                label="Moneda"
                options={CURRENCY_OPTIONS}
                value={currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v as 'ARS' | 'USD' }))}
              />
              {form.warehouseId && (
                <p className="text-xs text-indigo-600 flex items-center gap-1.5 -mt-1">
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  Los ítems vinculados a un producto actualizarán el stock al guardar.
                </p>
              )}
            </div>

            {/* Total */}
            <div className="bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Total operación</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-slate-400">Total</span>
                <span className="text-xl font-bold text-indigo-600 tabular-nums">
                  {formatCurrency(grandTotal, currency)}
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                Las facturas del proveedor con IVA discriminado se cargan desde el detalle de la compra.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button type="submit" isLoading={isSaving} className="w-full justify-center">
                Registrar compra
              </Button>
              <Button type="button" variant="outline" className="w-full justify-center" onClick={() => navigate('/purchases')}>
                Cancelar
              </Button>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
