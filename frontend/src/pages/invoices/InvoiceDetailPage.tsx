import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Badge, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { invoicesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_STATUSES,
  INVOICE_STATUS_COLORS,
} from '../../utils/constants';
import type { Invoice } from '../../types';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showPaidDialog, setShowPaidDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

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

  const handleMarkAsPaid = async () => {
    if (!id) return;
    setIsUpdating(true);
    try {
      const updated = await invoicesService.updateStatus(id, { status: 'PAID' });
      setInvoice(updated);
      toast.success('Factura marcada como pagada');
      setShowPaidDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al actualizar factura');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading || !invoice) {
    return <div className="p-6">Cargando...</div>;
  }

  const canCancel = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const canMarkAsPaid = invoice.status === 'ISSUED';

  return (
    <div>
      <PageHeader
        title={`Factura ${invoice.number}`}
        subtitle={INVOICE_TYPES[invoice.type]}
        backTo="/invoices"
        actions={
          <div className="flex gap-2">
            {canMarkAsPaid && (
              <Button
                variant="outline"
                onClick={() => setShowPaidDialog(true)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Marcar como pagada
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
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {item.taxRate}%
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(item.total)}
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
              <hr />
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA:</span>
                <span>{formatCurrency(invoice.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-primary-600">
                  {formatCurrency(invoice.total)}
                </span>
              </div>
            </div>
          </Card>

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
        isOpen={showPaidDialog}
        onClose={() => setShowPaidDialog(false)}
        onConfirm={handleMarkAsPaid}
        title="Marcar como pagada"
        message="¿Confirmas que esta factura ha sido pagada en su totalidad?"
        confirmText="Confirmar pago"
        variant="info"
        isLoading={isUpdating}
      />
    </div>
  );
}
