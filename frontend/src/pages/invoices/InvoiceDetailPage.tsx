import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XCircle, CheckCircle, Edit, Send, Banknote, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Badge, Button, Modal, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { invoicesService, cashRegistersService, afipService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_STATUSES,
  INVOICE_STATUS_COLORS,
} from '../../utils/constants';
import type { Invoice, CashRegister } from '../../types';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('');
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEmitting, setIsEmitting] = useState(false);
  const [showEmitDialog, setShowEmitDialog] = useState(false);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!id) return;
      try {
        const data = await invoicesService.getById(id);
        setInvoice(data);
      } catch (error) {
        toast.error('Error al cargar factura');
        navigate('/invoices');
      } finally {
        setIsLoading(false);
      }
    };
    fetchInvoice();
  }, [id, navigate]);

  const handleCancel = async () => {
    if (!id) return;
    setIsCanceling(true);
    try {
      const updated = await invoicesService.cancel(id);
      setInvoice(updated);
      toast.success('Factura cancelada');
      setShowCancelDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar factura');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleOpenPayModal = async () => {
    try {
      const data = await cashRegistersService.getAll(true);
      setCashRegisters(data);
      if (data.length > 0) setSelectedCashRegisterId(data[0].id);
    } catch {
      toast.error('Error al cargar cajas');
      return;
    }
    setShowPayModal(true);
  };

  const handleMarkAsPaid = async () => {
    if (!id || !selectedCashRegisterId) return;
    setIsUpdating(true);
    try {
      const updated = await invoicesService.pay(id, { cashRegisterId: selectedCashRegisterId });
      setInvoice(updated);
      toast.success('Factura marcada como pagada');
      setShowPayModal(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleIssue = async () => {
    if (!id) return;
    setIsUpdating(true);
    try {
      const updated = await invoicesService.updateStatus(id, { status: 'ISSUED' });
      setInvoice(updated);
      toast.success('Factura emitida');
      setShowIssueDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al emitir factura');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEmitArca = async () => {
    if (!id) return;
    setIsEmitting(true);
    try {
      const updated = await afipService.emitInvoice(id);
      setInvoice(updated);
      toast.success(`Factura emitida ante ARCA. CAE: ${updated.cae}`);
      setShowEmitDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al emitir ante ARCA');
    } finally {
      setIsEmitting(false);
    }
  };

  if (isLoading || !invoice) {
    return <div className="p-6">Cargando...</div>;
  }

  const isDraft = invoice.status === 'DRAFT';
  const canCancel = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const canMarkAsPaid = invoice.status === 'ISSUED';
  const canEmitArca = isDraft && !invoice.cae;

  return (
    <div>
      <PageHeader
        title={`Factura ${invoice.number}`}
        subtitle={INVOICE_TYPES[invoice.type]}
        backTo="/invoices"
        actions={
          <div className="flex gap-2">
            {isDraft && (
              <Button
                variant="outline"
                onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
            {isDraft && (
              <Button
                onClick={() => setShowIssueDialog(true)}
              >
                <Send className="w-4 h-4 mr-2" />
                Emitir
              </Button>
            )}
            {canEmitArca && (
              <Button
                variant="outline"
                onClick={() => setShowEmitDialog(true)}
              >
                <Zap className="w-4 h-4 mr-2" />
                Emitir a ARCA
              </Button>
            )}
            {canMarkAsPaid && (
              <Button
                variant="outline"
                onClick={handleOpenPayModal}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Registrar pago
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar factura
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Cantidad
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Precio Unit.
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      IVA
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.product?.name || 'Producto eliminado'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {formatCurrency(item.unitPrice, invoice.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {item.taxRate}%
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(item.total, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Notes */}
          {invoice.notes && (
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Notas</h3>
              <p className="text-sm text-gray-600">{invoice.notes}</p>
            </Card>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Estado:</span>
                <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
                  {INVOICE_STATUSES[invoice.status]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fecha:</span>
                <span>{formatDate(invoice.date)}</span>
              </div>
              {invoice.dueDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Vencimiento:</span>
                  <span>{formatDate(invoice.dueDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Moneda:</span>
                <span>{invoice.currency}</span>
              </div>
              {invoice.currency === 'USD' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo de cambio:</span>
                  <span>{invoice.exchangeRate}</span>
                </div>
              )}
              <hr />
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA:</span>
                <span>{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-primary-600">
                  {formatCurrency(invoice.total, invoice.currency)}
                </span>
              </div>
            </div>
          </Card>

          {invoice.cae && (
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ARCA / AFIP</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">CAE:</span>
                  <Badge className="bg-green-100 text-green-800 font-mono">{invoice.cae}</Badge>
                </div>
                {invoice.caeExpiry && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vto. CAE:</span>
                    <span>{formatDate(invoice.caeExpiry)}</span>
                  </div>
                )}
                {invoice.afipPtVenta && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Punto de Venta:</span>
                    <span>{invoice.afipPtVenta}</span>
                  </div>
                )}
                {invoice.afipCbtNum && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">N° AFIP:</span>
                    <span>{invoice.afipCbtNum}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{invoice.customer?.name}</p>
              {invoice.customer?.taxId && (
                <p className="text-gray-500">CUIT: {invoice.customer.taxId}</p>
              )}
              {invoice.customer?.email && (
                <p className="text-gray-500">{invoice.customer.email}</p>
              )}
              {invoice.customer?.address && (
                <p className="text-gray-500">{invoice.customer.address}</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancelar factura"
        message="¿Estás seguro de que deseas cancelar esta factura? Esta acción revertirá los movimientos de stock y cuenta corriente asociados."
        confirmText="Cancelar factura"
        isLoading={isCanceling}
      />

      <ConfirmDialog
        isOpen={showIssueDialog}
        onClose={() => setShowIssueDialog(false)}
        onConfirm={handleIssue}
        title="Emitir factura"
        message="¿Confirmas que deseas emitir esta factura? Una vez emitida no podrás editar los items."
        confirmText="Emitir"
        variant="info"
        isLoading={isUpdating}
      />

      <ConfirmDialog
        isOpen={showEmitDialog}
        onClose={() => setShowEmitDialog(false)}
        onConfirm={handleEmitArca}
        title="Emitir ante ARCA"
        message="¿Confirmas que deseas emitir esta factura ante ARCA (AFIP)? Se obtendrá el CAE y la factura pasará a estado EMITIDA."
        confirmText="Emitir ante ARCA"
        variant="info"
        isLoading={isEmitting}
      />

      <Modal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        title="Registrar pago"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Total a cobrar:{' '}
            <span className="font-semibold text-gray-900">
              {invoice && formatCurrency(invoice.total, invoice.currency)}
            </span>
          </p>

          {cashRegisters.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
              No hay cajas activas. Creá al menos una caja en{' '}
              <a href="/cash-registers" className="underline font-medium">Cajas</a> para registrar pagos.
            </p>
          ) : (
            <Select
              label="Caja destino"
              options={cashRegisters.map((cr) => ({ value: cr.id, label: cr.name }))}
              value={selectedCashRegisterId}
              onChange={setSelectedCashRegisterId}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowPayModal(false)}
              disabled={isUpdating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMarkAsPaid}
              isLoading={isUpdating}
              disabled={cashRegisters.length === 0}
            >
              <Banknote className="w-4 h-4 mr-2" />
              Confirmar pago
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
