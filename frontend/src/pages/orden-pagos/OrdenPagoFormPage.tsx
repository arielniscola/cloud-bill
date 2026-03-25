import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ChevronLeft, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { ordenPagosService, suppliersService, purchasesService, cashRegistersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHOD_OPTIONS } from '../../utils/constants';
import type { Supplier, CashRegister } from '../../types';
import type { PendingPurchaseInvoice, CreateOrdenPagoItemDTO } from '../../types/ordenPago.types';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C', FACTURA_M: 'Factura M',
  NOTA_DEBITO_A: 'ND A', NOTA_DEBITO_B: 'ND B', NOTA_CREDITO_A: 'NC A', NOTA_CREDITO_B: 'NC B',
  RECIBO: 'Recibo', OTRO: 'Otro',
};

interface ItemRow {
  purchaseInvoiceId: string;
  amount: string;
}

export default function OrdenPagoFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [supplierId, setSupplierId]         = useState(searchParams.get('supplierId') ?? '');
  const [paymentMethod, setPaymentMethod]   = useState('CASH');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [currency, setCurrency]             = useState('ARS');
  const [date, setDate]                     = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference]           = useState('');
  const [bank, setBank]                     = useState('');
  const [checkDueDate, setCheckDueDate]     = useState('');
  const [notes, setNotes]                   = useState('');
  const [items, setItems]                   = useState<ItemRow[]>([]);

  const [suppliers, setSuppliers]           = useState<Supplier[]>([]);
  const [invoices, setInvoices]             = useState<PendingPurchaseInvoice[]>([]);
  const [cashRegisters, setCashRegisters]   = useState<CashRegister[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    Promise.all([
      suppliersService.getAll({ limit: 1000, isActive: true }),
      cashRegistersService.getAll(),
    ]).then(([s, cr]) => {
      setSuppliers(s.data);
      setCashRegisters(cr);
      if (cr.length > 0) setCashRegisterId(cr[0].id);
    }).catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async (sid: string) => {
    if (!sid) { setInvoices([]); setItems([]); return; }
    setLoadingInvoices(true);
    try {
      const data = await purchasesService.getPendingInvoices(sid);
      setInvoices(data);
      setItems([]);
    } catch {
      toast.error('Error al cargar facturas pendientes del proveedor');
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(supplierId); }, [supplierId, fetchInvoices]);

  const toggleInvoice = (invoiceId: string, amount: number) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.purchaseInvoiceId === invoiceId);
      if (exists) return prev.filter((i) => i.purchaseInvoiceId !== invoiceId);
      return [...prev, { purchaseInvoiceId: invoiceId, amount: amount.toFixed(2) }];
    });
  };

  const updateAmount = (invoiceId: string, amount: string) => {
    setItems((prev) => prev.map((i) => i.purchaseInvoiceId === invoiceId ? { ...i, amount } : i));
  };

  const totalAmount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId)       { toast.error('Seleccioná un proveedor'); return; }
    if (items.length === 0) { toast.error('Seleccioná al menos una factura'); return; }
    const parsedItems: CreateOrdenPagoItemDTO[] = items.map((i) => ({
      purchaseInvoiceId: i.purchaseInvoiceId,
      amount: Number(i.amount),
    }));
    if (parsedItems.some((i) => i.amount <= 0)) {
      toast.error('Todos los montos deben ser mayores a 0');
      return;
    }

    setIsSubmitting(true);
    try {
      const op = await ordenPagosService.create({
        supplierId,
        cashRegisterId: cashRegisterId || undefined,
        date,
        currency: currency as any,
        paymentMethod: paymentMethod as any,
        reference: reference || undefined,
        bank: bank || undefined,
        checkDueDate: checkDueDate || undefined,
        notes: notes || undefined,
        items: parsedItems,
      });
      toast.success(`Orden de Pago ${op.number} creada`);
      navigate(`/orden-pagos/${op.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al crear orden de pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Nueva Orden de Pago"
        subtitle="Registrar pago a proveedor"
        actions={
          <Button variant="outline" onClick={() => navigate('/orden-pagos')}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Volver
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del pago */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Datos del pago</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Proveedor *</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">Seleccionar proveedor…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Método de pago *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            {cashRegisters.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Caja</label>
                <select
                  value={cashRegisterId}
                  onChange={(e) => setCashRegisterId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sin caja</option>
                  {cashRegisters.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ARS">ARS — Peso</option>
                <option value="USD">USD — Dólar</option>
              </select>
            </div>

            <Input
              label="Referencia / N° operación"
              placeholder="Nro transferencia, cheque…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />

            {paymentMethod === 'CHECK' && (
              <>
                <Input label="Banco" value={bank} onChange={(e) => setBank(e.target.value)} />
                <Input label="Vencimiento cheque" type="date" value={checkDueDate} onChange={(e) => setCheckDueDate(e.target.value)} />
              </>
            )}

            {paymentMethod === 'BANK_TRANSFER' && (
              <Input label="Banco" value={bank} onChange={(e) => setBank(e.target.value)} />
            )}
          </div>

          <div className="mt-4">
            <Input
              label="Notas"
              placeholder="Observaciones opcionales…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </Card>

        {/* Facturas pendientes */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Facturas a pagar</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Seleccioná las facturas del proveedor a cancelar y ajustá el monto si es un pago parcial.
          </p>

          {!supplierId ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">Seleccioná un proveedor para ver sus facturas pendientes</p>
          ) : loadingInvoices ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">No hay facturas pendientes de pago para este proveedor</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-2 w-8"></th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Factura</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Compra</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Vencimiento</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Monto a pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {invoices.map((inv) => {
                    const selected = items.find((i) => i.purchaseInvoiceId === inv.id);
                    return (
                      <tr key={inv.id} className={selected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => toggleInvoice(inv.id, Number(inv.amount))}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">{inv.number}</span>
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 px-1 py-0.5 rounded-full">
                              {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{inv.purchaseNumber}</span>
                          <span className="text-xs text-gray-400 ml-1.5">{formatDate(inv.purchaseDate)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                          {inv.dueDate ? formatDate(inv.dueDate) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800 dark:text-slate-200">
                          {formatCurrency(Number(inv.amount), inv.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {selected && (
                            <input
                              type="number"
                              min="0.01"
                              max={Number(inv.amount)}
                              step="0.01"
                              value={selected.amount}
                              onChange={(e) => updateAmount(inv.id, e.target.value)}
                              className="w-28 text-right border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Summary + submit */}
        {items.length > 0 && (
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {items.length} factura{items.length !== 1 ? 's' : ''} seleccionada{items.length !== 1 ? 's' : ''}
              </p>
              <div className="text-right">
                <p className="text-xs text-gray-400 dark:text-slate-500">Total a pagar</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {formatCurrency(totalAmount, currency as any)}
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => navigate('/orden-pagos')}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={items.length === 0}>
            <Plus className="w-4 h-4 mr-2" />
            Emitir Orden de Pago
          </Button>
        </div>
      </form>
    </div>
  );
}
