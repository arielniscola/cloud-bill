import { useState, useEffect } from 'react';
import { X, Link2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input } from '../../components/ui';
import { invoicesService, mercadoPagoService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { Invoice } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
  initialPaymentId?: string;
}

export default function LinkMpPaymentModal({ open, onClose, onLinked, initialPaymentId = '' }: Props) {
  const [mpPaymentId,  setMpPaymentId]  = useState(initialPaymentId);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isSearching,  setIsSearching]  = useState(false);
  const [isLinking,    setIsLinking]    = useState(false);

  useEffect(() => { if (open) setMpPaymentId(initialPaymentId); }, [open, initialPaymentId]);

  const handleSearchInvoices = async () => {
    if (!invoiceSearch.trim()) return;
    setIsSearching(true);
    try {
      const result = await invoicesService.getAll({ search: invoiceSearch, limit: 10 });
      setInvoices((result as any).data ?? result);
    } catch {
      toast.error('Error al buscar facturas');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLink = async () => {
    if (!mpPaymentId.trim()) { toast.error('Ingresá el ID del pago de MercadoPago'); return; }
    if (!selectedInvoice)    { toast.error('Seleccioná una factura'); return; }
    setIsLinking(true);
    try {
      await mercadoPagoService.linkPayment({
        mpPaymentId: mpPaymentId.trim(),
        invoiceId:   selectedInvoice.id,
      });
      toast.success('Pago vinculado correctamente');
      onLinked();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al vincular el pago');
    } finally {
      setIsLinking(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Vincular pago de MercadoPago</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
              ID del pago en MercadoPago
            </label>
            <Input
              value={mpPaymentId}
              onChange={(e) => setMpPaymentId(e.target.value)}
              placeholder="Ej: 87654321"
            />
            <p className="text-xs text-gray-400 mt-1">Lo encontrás en el panel de MP o en el historial de la cuenta.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
              Buscar factura a vincular
            </label>
            <div className="flex gap-2">
              <Input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchInvoices()}
                placeholder="N° de factura o nombre de cliente"
              />
              <Button size="sm" variant="outline" onClick={handleSearchInvoices} isLoading={isSearching}>
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {invoices.length > 0 && (
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg divide-y divide-gray-100 dark:divide-slate-700 max-h-48 overflow-y-auto">
              {invoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                    selectedInvoice?.id === inv.id ? 'bg-sky-50 dark:bg-sky-900/20' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.number}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{(inv as any).customer?.name ?? ''} · {inv.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                    {formatCurrency(Number(inv.total), inv.currency)}
                  </p>
                </button>
              ))}
            </div>
          )}

          {selectedInvoice && (
            <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/40 rounded-lg p-3 text-xs">
              <p className="font-medium text-sky-800 dark:text-sky-300">Factura seleccionada</p>
              <p className="text-sky-700 dark:text-sky-400">{selectedInvoice.number} — {(selectedInvoice as any).customer?.name} — {formatCurrency(Number(selectedInvoice.total), selectedInvoice.currency)}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleLink} isLoading={isLinking} disabled={!mpPaymentId || !selectedInvoice}>
            <Link2 className="w-3.5 h-3.5 mr-1.5" />
            Vincular pago
          </Button>
        </div>
      </div>
    </div>
  );
}
