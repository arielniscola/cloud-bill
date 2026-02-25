import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, Badge } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { purchasesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES } from '../../utils/constants';
import type { Purchase } from '../../types';

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  REGISTERED: 'Registrada',
  CANCELLED: 'Cancelada',
};

const PURCHASE_STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const fetchPurchases = async () => {
    setIsLoading(true);
    try {
      const result = await purchasesService.getAll({ limit: 50 });
      setPurchases(result.data);
    } catch {
      toast.error('Error al cargar compras');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, []);

  const handleCancel = async () => {
    if (!cancelId) return;
    setIsCanceling(true);
    try {
      await purchasesService.cancel(cancelId);
      toast.success('Compra cancelada');
      setCancelId(null);
      fetchPurchases();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar compra');
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Compras"
        subtitle="Comprobantes de proveedores"
        actions={
          <Button onClick={() => navigate('/purchases/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva compra
          </Button>
        }
      />

      <Card>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : purchases.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No hay compras registradas.{' '}
            <button onClick={() => navigate('/purchases/new')} className="text-indigo-600 underline">
              Registrar una
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Número</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase text-xs">Neto</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase text-xs">IVA</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase text-xs">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Estado</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase text-xs">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.date)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.number}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-purple-50 text-purple-700 text-xs">
                        {INVOICE_TYPES[p.type as keyof typeof INVOICE_TYPES] || p.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{(p as any).supplier?.name || '-'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(p.subtotal))}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(p.taxAmount))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(p.total))}</td>
                    <td className="px-4 py-3">
                      <Badge className={PURCHASE_STATUS_COLORS[p.status]}>
                        {PURCHASE_STATUS_LABELS[p.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => navigate(`/purchases/${p.id}`)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {p.status === 'REGISTERED' && (
                          <button
                            onClick={() => setCancelId(p.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                            title="Cancelar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={handleCancel}
        title="Cancelar compra"
        message="¿Estás seguro de que deseas cancelar esta compra?"
        confirmText="Cancelar compra"
        isLoading={isCanceling}
      />
    </div>
  );
}
