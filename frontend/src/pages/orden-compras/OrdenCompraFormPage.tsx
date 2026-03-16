import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '../../components/ui';
import { PageHeader, ProductSearchSelect } from '../../components/shared';
import { ordenComprasService, suppliersService, warehousesService, productsService } from '../../services';
import { CURRENCY_OPTIONS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import type { CreateOrdenCompraDTO, CreateOrdenCompraItemDTO, Supplier, Warehouse, Product } from '../../types';

const defaultItem: CreateOrdenCompraItemDTO = {
  productId: null,
  description: '',
  quantity: 1,
  unitPrice: 0,
  taxRate: 21,
  subtotal: 0,
  taxAmount: 0,
  total: 0,
};

function calcItem(item: CreateOrdenCompraItemDTO) {
  const subtotal = item.quantity * item.unitPrice;
  const taxAmount = subtotal * (item.taxRate || 0) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

export default function OrdenCompraFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);

  const [form, setForm] = useState<Omit<CreateOrdenCompraDTO, 'items'>>({
    supplierId: '',
    date: new Date().toISOString().split('T')[0],
    expectedDate: null,
    currency: 'ARS',
    exchangeRate: 1,
    warehouseId: null,
    notes: null,
  });

  const [items, setItems] = useState<CreateOrdenCompraItemDTO[]>([{ ...defaultItem }]);

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

  useEffect(() => {
    if (!isEditing) return;
    setIsLoading(true);
    ordenComprasService.getById(id!)
      .then((oc) => {
        setForm({
          supplierId: oc.supplierId,
          date: oc.date.split('T')[0],
          expectedDate: oc.expectedDate ? oc.expectedDate.split('T')[0] : null,
          currency: oc.currency,
          exchangeRate: Number(oc.exchangeRate),
          warehouseId: oc.warehouseId,
          notes: oc.notes,
        });
        setItems(
          (oc.items ?? []).map((i) => ({
            productId: i.productId ?? null,
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            taxRate: Number(i.taxRate),
            subtotal: Number(i.subtotal),
            taxAmount: Number(i.taxAmount),
            total: Number(i.total),
          }))
        );
      })
      .catch(() => {
        toast.error('Error al cargar la OC');
        navigate('/orden-compras');
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditing, navigate]);

  const addItem = () => setItems((p) => [...p, { ...defaultItem }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const updateItem = (index: number, field: keyof CreateOrdenCompraItemDTO, value: string | number | null) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, productId, description: product.name, unitPrice: product.cost, taxRate: product.taxRate }
            : item
        )
      );
    } else {
      updateItem(index, 'productId', null);
    }
  };

  const totals = items.reduce(
    (acc, item) => {
      const { subtotal, taxAmount } = calcItem(item);
      return { subtotal: acc.subtotal + subtotal, taxAmount: acc.taxAmount + taxAmount };
    },
    { subtotal: 0, taxAmount: 0 }
  );
  const grandTotal = totals.subtotal + totals.taxAmount;
  const currency = form.currency || 'ARS';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId) { toast.error('Seleccione un proveedor'); return; }
    if (items.some((i) => !i.description || i.quantity <= 0)) {
      toast.error('Complete todos los ítems correctamente');
      return;
    }

    const itemsWithTotals = items.map((item) => {
      const { subtotal, taxAmount, total } = calcItem(item);
      return { ...item, subtotal, taxAmount, total };
    });

    setIsSaving(true);
    try {
      if (isEditing) {
        await ordenComprasService.update(id!, { ...form, items: itemsWithTotals });
        toast.success('Orden de compra actualizada');
      } else {
        await ordenComprasService.create({ ...form, items: itemsWithTotals });
        toast.success('Orden de compra creada');
      }
      navigate('/orden-compras');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title={isEditing ? 'Editar OC' : 'Nueva OC'} backTo="/orden-compras" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 animate-pulse">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-64" />
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-64" />
        </div>
      </div>
    );
  }

  const supplierOptions = [
    { value: '', label: 'Seleccionar proveedor...' },
    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
  ];
  const warehouseOptions = [
    { value: '', label: 'Sin almacén' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader title={isEditing ? 'Editar OC' : 'Nueva OC'} backTo="/orden-compras" />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

          {/* Left: items + notes */}
          <div className="space-y-4 min-w-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ítems</h2>
              </div>

              <div className="px-5 py-3">
                {/* Column headers */}
                <div className="hidden md:grid grid-cols-[2fr_3fr_72px_104px_60px_88px_32px] gap-3 pb-2 mb-1 border-b border-gray-100 dark:border-slate-700">
                  {['Producto', 'Descripción', 'Cant.', 'Precio unit.', 'IVA %', 'Total', ''].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {items.map((item, index) => {
                    const { total } = calcItem(item);
                    return (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_3fr_72px_104px_60px_88px_32px] gap-3 items-center py-3">
                        <div>
                          <label className="block md:hidden text-xs text-gray-400 mb-1">Producto</label>
                          <ProductSearchSelect
                            products={products}
                            value={item.productId ?? ''}
                            onChange={(pid) => handleProductSelect(index, pid)}
                            optional
                          />
                        </div>
                        <div>
                          <label className="block md:hidden text-xs text-gray-400 mb-1">Descripción *</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Descripción del ítem"
                            value={item.description}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block md:hidden text-xs text-gray-400 mb-1">Cantidad</label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block md:hidden text-xs text-gray-400 mb-1">Precio unit.</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block md:hidden text-xs text-gray-400 mb-1">IVA %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.taxRate}
                            onChange={(e) => updateItem(index, 'taxRate', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="text-right">
                          <label className="block md:hidden text-xs text-gray-400 mb-1">Total</label>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                            {formatCurrency(total, currency)}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-slate-700 mt-2">
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors py-1"
                  >
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
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={3}
                placeholder="Condiciones, aclaraciones..."
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
              />
            </div>
          </div>

          {/* Right: sticky metadata + totals + actions */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
              <Select
                label="Proveedor *"
                options={supplierOptions}
                value={form.supplierId}
                onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
              />
              <Input
                label="Fecha"
                type="date"
                value={form.date || ''}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
              <Input
                label="Fecha estimada de entrega"
                type="date"
                value={form.expectedDate || ''}
                onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value || null }))}
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
                onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              />
              {currency !== 'ARS' && (
                <Input
                  label="Tipo de cambio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.exchangeRate}
                  onChange={(e) => setForm((f) => ({ ...f, exchangeRate: parseFloat(e.target.value) || 1 }))}
                />
              )}
            </div>

            {/* Totals */}
            <div className="bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Resumen</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Subtotal</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-200 tabular-nums">
                    {formatCurrency(totals.subtotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-slate-400">IVA</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-200 tabular-nums">
                    {formatCurrency(totals.taxAmount, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-gray-200 dark:border-slate-600">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-indigo-600 tabular-nums">
                    {formatCurrency(grandTotal, currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button type="submit" isLoading={isSaving} className="w-full justify-center">
                {isEditing ? 'Guardar cambios' : 'Crear OC'}
              </Button>
              <Button type="button" variant="outline" className="w-full justify-center" onClick={() => navigate('/orden-compras')}>
                Cancelar
              </Button>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
