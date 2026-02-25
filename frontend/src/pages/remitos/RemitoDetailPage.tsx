import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XCircle, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Badge, Button, Modal, Input } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { remitosService } from '../../services';
import { formatDate } from '../../utils/formatters';
import {
  REMITO_STATUSES,
  REMITO_STATUS_COLORS,
} from '../../utils/constants';
import type { Remito, RemitoItem } from '../../types';

export default function RemitoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [remito, setRemito] = useState<Remito | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverQuantities, setDeliverQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchRemito = async () => {
      if (!id) return;
      try {
        const data = await remitosService.getById(id);
        setRemito(data);
      } catch (error) {
        toast.error('Error al cargar remito');
        navigate('/remitos');
      } finally {
        setIsLoading(false);
      }
    };
    fetchRemito();
  }, [id, navigate]);

  const openDeliverModal = () => {
    if (!remito) return;
    const initial: Record<string, number> = {};
    remito.items.forEach((item) => {
      const pending = Number(item.quantity) - Number(item.deliveredQuantity);
      initial[item.id] = pending;
    });
    setDeliverQuantities(initial);
    setShowDeliverModal(true);
  };

  const handleDeliver = async () => {
    if (!id || !remito) return;
    setIsDelivering(true);
    try {
      const items = Object.entries(deliverQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([remitoItemId, quantity]) => ({ remitoItemId, quantity }));

      if (items.length === 0) {
        toast.error('Ingresa al menos una cantidad a entregar');
        setIsDelivering(false);
        return;
      }

      const updated = await remitosService.deliver(id, { items });
      setRemito(updated);
      toast.success('Entrega registrada');
      setShowDeliverModal(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar entrega');
    } finally {
      setIsDelivering(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setIsCanceling(true);
    try {
      const updated = await remitosService.cancel(id);
      setRemito(updated);
      toast.success('Remito cancelado');
      setShowCancelDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar remito');
    } finally {
      setIsCanceling(false);
    }
  };

  if (isLoading || !remito) {
    return <div className="p-6">Cargando...</div>;
  }

  const canDeliver = remito.status === 'PENDING' || remito.status === 'PARTIALLY_DELIVERED';
  const canCancel = remito.status !== 'CANCELLED' && remito.status !== 'DELIVERED';

  return (
    <div>
      <PageHeader
        title={`Remito ${remito.number}`}
        backTo="/remitos"
        actions={
          <div className="flex gap-2">
            {canDeliver && (
              <Button onClick={openDeliverModal}>
                <Truck className="w-4 h-4 mr-2" />
                Entregar
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar remito
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
                      Entregado
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Pendiente
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {remito.items.map((item) => {
                    const pending = Number(item.quantity) - Number(item.deliveredQuantity);
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.product?.name || 'Producto eliminado'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {Number(item.quantity)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {Number(item.deliveredQuantity)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span
                            className={
                              pending > 0
                                ? 'text-yellow-600 font-medium'
                                : 'text-green-600 font-medium'
                            }
                          >
                            {pending}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {remito.notes && (
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Notas</h3>
              <p className="text-sm text-gray-600">{remito.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Estado:</span>
                <Badge className={REMITO_STATUS_COLORS[remito.status]}>
                  {REMITO_STATUSES[remito.status]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fecha:</span>
                <span>{formatDate(remito.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Comportamiento:</span>
                <span>
                  {remito.stockBehavior === 'DISCOUNT'
                    ? 'Descuento directo'
                    : 'Reserva'}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{remito.customer?.name}</p>
              {remito.customer?.taxId && (
                <p className="text-gray-500">CUIT: {remito.customer.taxId}</p>
              )}
              {remito.customer?.email && (
                <p className="text-gray-500">{remito.customer.email}</p>
              )}
              {remito.customer?.address && (
                <p className="text-gray-500">{remito.customer.address}</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Deliver Modal */}
      <Modal
        isOpen={showDeliverModal}
        onClose={() => setShowDeliverModal(false)}
        title="Registrar entrega"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ingresa la cantidad a entregar para cada item. Deja en 0 los items que no se entregan.
          </p>
          <div className="space-y-3">
            {remito.items.map((item) => {
              const pending = Number(item.quantity) - Number(item.deliveredQuantity);
              if (pending <= 0) return null;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {item.product?.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Pendiente: {pending}
                    </p>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min={0}
                      max={pending}
                      value={deliverQuantities[item.id] ?? 0}
                      onChange={(e) =>
                        setDeliverQuantities((prev) => ({
                          ...prev,
                          [item.id]: Math.min(Number(e.target.value), pending),
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setShowDeliverModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleDeliver} isLoading={isDelivering}>
              Confirmar entrega
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancelar remito"
        message="¿Estás seguro de que deseas cancelar este remito? Esta acción revertirá los movimientos de stock y reservas asociados."
        confirmText="Cancelar remito"
        isLoading={isCanceling}
      />
    </div>
  );
}
