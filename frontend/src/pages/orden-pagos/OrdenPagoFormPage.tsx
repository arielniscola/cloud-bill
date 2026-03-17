import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { ordenPagosService, suppliersService, purchasesService, cashRegistersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHOD_OPTIONS } from '../../utils/constants';
import type { Supplier, Purchase, CashRegister } from '../../types';
import type { CreateOrdenPagoItemDTO } from '../../types/ordenPago.types';

interface ItemRow {
  purchaseId: string;
  amount: string;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagado',
};

export default function OrdenPagoFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [supplierId, setSupplierId]       = useState(searchParams.get('supplierId') ?? '');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [currency, setCurrency]           = useState('ARS');
  const [date, setDate]                   = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference]         = useState('');
  const [bank, setBank]                   = useState('');
  const [checkDueDate, setCheckDueDate]   = useState('');
  const [notes, setNotes]                 = useState('');
  const [items, setItems]                 = useState<ItemRow[]>([]);

  // Data
  const [suppliers, setSuppliers]         = useState<Supplier[]>([]);
  const [purchases, setPurchases]         = useState<Purchase[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

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

  const fetchPurchases = useCallback(async (sid: string) => {
    if (!sid) { setPurchases([]); setItems([]); return; }
    setLoadingPurchases(true);
    try {
      const result = await purchasesService.getAll({ supplierId: sid, limit: 100 });
      const pending = result.data.filter(
        (p) => p.status === 'REGISTERED' && (p.paymentStatus ?? 'PENDING') !== 'PAID'
      );
      setPurchases(pending);
      setItems([]);
    } catch {
      toast.error('Error al cargar compras del proveedor');
    } finally {
      setLoadingPurchases(false);
    }
  }, []);

  useEffect(() => { fetchPurchases(supplierId); }, [supplierId, fetchPurchases]);

  const togglePurchase = (purchaseId: string, balance: number) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.purchaseId === purchaseId);
      if (exists) return prev.filter((i) => i.purchaseId !== purchaseId);
      return [...prev, { purchaseId, amount: balance.toFixed(2) }];
    });
  };

  const updateAmount = (purchaseId: string, amount: string) => {
    setItems((prev) => prev.map((i) => i.purchaseId === purchaseId ? { ...i, amount } : i));
  };

  const totalAmount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId)   { toast.error('Seleccioná un proveedor'); return; }
    if (items.length === 0) { toast.error('Seleccioná al menos una compra'); return; }
    const parsedItems: CreateOrdenPagoItemDTO[] = items.map((i) => ({
      purchaseId: i.purchaseId,
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
        {/* Proveedor + datos generales */}
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

        {/* Compras pendientes */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Compras a pagar</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Seleccioná las compras a cancelar y ajustá el monto si es un pago parcial.
          </p>

          {!supplierId ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">Seleccioná un proveedor para ver sus compras pendientes</p>
          ) : loadingPurchases ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">No hay compras pendientes de pago para este proveedor</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase w-8"></th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Compra</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Fecha</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Saldo</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Estado</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Monto a pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {purchases.map((p) => {
                    const balance = Number(p.total) - Number(p.paidAmount ?? 0);
                    const selected = items.find((i) => i.purchaseId === p.id);
                    return (
                      <tr key={p.id} className={selected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => togglePurchase(p.id, balance)}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">{p.number}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400 tabular-nums">{formatDate(p.date)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(Number(p.total), p.currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(balance, p.currency)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            (p.paymentStatus ?? 'PENDING') === 'PARTIALLY_PAID'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400'
                          }`}>
                            {PAYMENT_STATUS_LABELS[p.paymentStatus ?? 'PENDING']}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {selected && (
                            <input
                              type="number"
                              min="0.01"
                              max={balance}
                              step="0.01"
                              value={selected.amount}
                              onChange={(e) => updateAmount(p.id, e.target.value)}
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
              <div>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  {items.length} compra{items.length !== 1 ? 's' : ''} seleccionada{items.length !== 1 ? 's' : ''}
                </p>
              </div>
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
