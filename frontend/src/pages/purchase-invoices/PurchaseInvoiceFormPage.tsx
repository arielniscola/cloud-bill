import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card } from '../../components/ui';
import { AddPurchaseInvoiceModal } from '../../components/shared/AddPurchaseInvoiceModal';
import type { RemitoPrefill } from '../../components/shared/AddPurchaseInvoiceModal';
import { purchaseInvoicesService, suppliersService } from '../../services';
import type { CreatePurchaseInvoiceDTO, PurchaseInvoice } from '../../types';

/**
 * Carga / edición de factura de compra como página (/purchase-invoices/new y
 * /purchase-invoices/:id/edit), igual que la factura de venta. Reusa el
 * formulario del modal en variante 'page'. `state.fromRemito` precarga desde
 * un remito de compra.
 */
export default function PurchaseInvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = !!id;
  // Se captura una sola vez: el state de navegación no debe re-precargar al guardar.
  const [fromRemito] = useState<RemitoPrefill | null>(
    () => (location.state as { fromRemito?: RemitoPrefill } | null)?.fromRemito ?? null,
  );
  const [existing, setExisting] = useState<PurchaseInvoice | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    suppliersService.getAll({ limit: 500, isActive: true })
      .then((res) => setSuppliers(res.data.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => { /* non-blocking */ });
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    purchaseInvoicesService.getById(id)
      .then((inv) => {
        if (cancelled) return;
        // Con pagos imputados no se edita: se muestra el detalle.
        if (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
          toast.error('La factura tiene pagos imputados y no se puede editar');
          navigate(`/purchase-invoices/${id}`, { replace: true });
          return;
        }
        setExisting(inv);
      })
      .catch(() => { toast.error('No se encontró la factura'); navigate('/purchase-invoices', { replace: true }); });
    return () => { cancelled = true; };
  }, [id, navigate]);

  const handleSave = async (data: CreatePurchaseInvoiceDTO) => {
    setSaving(true);
    try {
      const saved = isEditing
        ? await purchaseInvoicesService.update(id!, data)
        : await purchaseInvoicesService.create(data);
      const updated = saved.costUpdate?.updated ?? 0;
      toast.success(
        (isEditing ? 'Factura actualizada' : 'Factura creada')
        + (updated ? ` · ${updated} costo${updated === 1 ? '' : 's'} de producto actualizado${updated === 1 ? '' : 's'}` : ''),
      );
      for (const s of saved.costUpdate?.skipped ?? []) {
        toast.error(`No se actualizó el costo de ${s.name}: ${s.reason}`);
      }
      navigate(`/purchase-invoices/${saved.id ?? id}`, { replace: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar la factura');
      throw e; // el formulario usa el rechazo para NO limpiar el borrador si falló
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => navigate(isEditing ? `/purchase-invoices/${id}` : '/purchase-invoices');

  if (isEditing && !existing) {
    return <Card><p className="py-10 text-center text-sm text-gray-400">Cargando…</p></Card>;
  }

  return (
    <AddPurchaseInvoiceModal
      isOpen
      variant="page"
      standalone
      suppliers={suppliers}
      fromRemito={fromRemito}
      existing={existing}
      currency={existing?.currency ?? fromRemito?.currency ?? 'ARS'}
      onClose={handleClose}
      onSave={handleSave}
      isLoading={saving}
    />
  );
}
