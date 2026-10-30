import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Edit, Trash2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { PurchaseInvoiceDetailBody } from '../../components/shared/PurchaseInvoiceDetailModal';
import { purchaseInvoicesService } from '../../services';
import { usePermissions } from '../../hooks/usePermissions';
import type { PurchaseInvoice } from '../../types';

/**
 * Página propia de la factura de compra: se puede compartir el link, abrir en
 * otra pestaña y volver con "atrás" (antes solo existía como modal del listado).
 * La edición es la página /purchase-invoices/:id/edit.
 */
export default function PurchaseInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWritePurchases } = usePermissions();
  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    purchaseInvoicesService.getById(id)
      .then((inv) => { if (!cancelled) setInvoice(inv); })
      .catch(() => { toast.error('No se encontró la factura'); navigate('/purchase-invoices', { replace: true }); });
    return () => { cancelled = true; };
  }, [id, navigate]);

  if (!invoice) {
    return (
      <div>
        <PageHeader title="Factura de compra" backTo="/purchase-invoices" />
        <Card><p className="py-10 text-center text-sm text-gray-400">Cargando…</p></Card>
      </div>
    );
  }

  const hasPayments = invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID';
  const isCreditNote = invoice.type.startsWith('NOTA_CREDITO');
  const canPay = canWritePurchases && invoice.status !== 'PAID' && !isCreditNote && !!invoice.supplierId;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await purchaseInvoicesService.remove(invoice.id);
      toast.success('Factura eliminada');
      navigate('/purchase-invoices', { replace: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'No se pudo eliminar la factura');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Factura de compra ${invoice.number}`}
        subtitle={invoice.supplier?.name}
        backTo="/purchase-invoices"
        actions={canWritePurchases && (
          <div className="flex items-center gap-2">
            {canPay && (
              <Button onClick={() => navigate(`/orden-pagos/new?supplierId=${invoice.supplierId}&invoices=${invoice.id}`)}>
                <Wallet className="w-4 h-4 mr-1.5" /> Pagar
              </Button>
            )}
            {!hasPayments && (
              <>
                <Button variant="outline" onClick={() => navigate(`/purchase-invoices/${invoice.id}/edit`)}>
                  <Edit className="w-4 h-4 mr-1.5" /> Editar
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(true)} aria-label="Eliminar factura">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        )}
      />

      {invoice.supplierId && (
        <p className="-mt-3 text-sm">
          <Link to={`/suppliers/${invoice.supplierId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">Ver ficha del proveedor</Link>
        </p>
      )}

      <Card padding="none" className="max-w-3xl">
        <PurchaseInvoiceDetailBody
          invoice={invoice}
          className="px-6 py-6 space-y-6"
          onGenerateRemito={canWritePurchases ? (inv) => navigate('/purchase-remitos/new', { state: { fromInvoice: inv } }) : undefined}
        />
      </Card>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Eliminar factura de compra"
        message={`Se elimina la factura ${invoice.number} y su movimiento en la cuenta del proveedor. Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
      />
    </div>
  );
}
