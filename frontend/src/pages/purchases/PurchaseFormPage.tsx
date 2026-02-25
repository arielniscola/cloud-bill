import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, Input, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { purchasesService, suppliersService } from '../../services';
import { INVOICE_TYPE_OPTIONS, CURRENCY_OPTIONS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import type { CreatePurchaseDTO, CreatePurchaseItemDTO, Supplier } from '../../types';

const defaultItem: CreatePurchaseItemDTO = {
  description: '',
  quantity: 1,
  unitPrice: 0,
  taxRate: 21,
};

export default function PurchaseFormPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<Omit<CreatePurchaseDTO, 'items'>>({
    type: 'FACTURA_A',
    number: '',
    supplierId: '',
    date: new Date().toISOString().split('T')[0],
    currency: 'ARS',
    notes: '',
  });

  const [items, setItems] = useState<CreatePurchaseItemDTO[]>([{ ...defaultItem }]);

  useEffect(() => {
    suppliersService.getAll({ limit: 200, isActive: true })
      .then((r) => setSuppliers(r.data))
      .catch(() => toast.error('Error al cargar proveedores'));
  }, []);

  const addItem = () => setItems((prev) => [...prev, { ...defaultItem }]);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof CreatePurchaseItemDTO, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const calcItemTotal = (item: CreatePurchaseItemDTO) => {
    const subtotal = item.quantity * item.unitPrice;
    const taxAmount = subtotal * (item.taxRate || 0) / 100;
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  };

  const totals = items.reduce(
    (acc, item) => {
      const { subtotal, taxAmount, total } = calcItemTotal(item);
      return {
        subtotal: acc.subtotal + subtotal,
        taxAmount: acc.taxAmount + taxAmount,
        total: acc.total + total,
      };
    },
    { subtotal: 0, taxAmount: 0, total: 0 }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId) {
      toast.error('Seleccione un proveedor');
      return;
    }
    if (!form.number) {
      toast.error('Ingrese el número de comprobante');
      return;
    }
    if (items.some((i) => !i.description || i.quantity <= 0)) {
      toast.error('Complete todos los ítems correctamente');
      return;
    }

    setIsSaving(true);
    try {
      await purchasesService.create({ ...form, items });
      toast.success('Compra registrada');
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

  // Filter to only show purchase-relevant invoice types
  const typeOptions = INVOICE_TYPE_OPTIONS;

  return (
    <div>
      <PageHeader title="Nueva Compra" backTo="/purchases" />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        {/* Header */}
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Datos del comprobante</h3>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Proveedor *"
              options={[{ value: '', label: 'Seleccionar proveedor...' }, ...supplierOptions]}
              value={form.supplierId}
              onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
            />
            <Select
              label="Tipo de comprobante *"
              options={typeOptions}
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v as CreatePurchaseDTO['type'] }))}
            />
            <Input
              label="Número de comprobante *"
              placeholder="0001-00001234"
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              required
            />
            <Input
              label="Fecha"
              type="date"
              value={form.date || ''}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <Select
              label="Moneda"
              options={CURRENCY_OPTIONS}
              value={form.currency || 'ARS'}
              onChange={(v) => setForm((f) => ({ ...f, currency: v as 'ARS' | 'USD' }))}
            />
          </div>
        </Card>

        {/* Items */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Ítems</h3>
            <Button type="button" variant="outline" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar ítem
            </Button>
          </div>

          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1">
              <div className="col-span-4">Descripción</div>
              <div className="col-span-2 text-right">Cantidad</div>
              <div className="col-span-2 text-right">Precio Unit.</div>
              <div className="col-span-1 text-right">IVA%</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {items.map((item, index) => {
              const { total } = calcItemTotal(item);
              return (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Descripción del ítem"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={item.taxRate}
                      onChange={(e) => updateItem(index, 'taxRate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium text-gray-900 pr-2">
                    {formatCurrency(total, form.currency || 'ARS')}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="mt-6 border-t border-gray-100 pt-4 flex justify-end">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal:</span>
                <span>{formatCurrency(totals.subtotal, form.currency || 'ARS')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA:</span>
                <span>{formatCurrency(totals.taxAmount, form.currency || 'ARS')}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                <span>Total:</span>
                <span>{formatCurrency(totals.total, form.currency || 'ARS')}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
            value={form.notes || ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Card>

        <div className="flex gap-3">
          <Button type="submit" isLoading={isSaving}>
            Registrar compra
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/purchases')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
