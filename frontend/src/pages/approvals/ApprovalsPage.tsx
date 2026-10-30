import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Check, X, ShieldCheck, Inbox } from 'lucide-react';
import { PageHeader } from '../../components/shared';
import PushToggle from '../../components/approvals/PushToggle';
import { Badge, Button, Modal, Textarea, Spinner } from '../../components/ui';
import { approvalsService, type ApprovalRequest, type ApprovalStatus } from '../../services/approvals.service';
import { useApprovalStore } from '../../stores/approval.store';
import { usePermissions } from '../../hooks/usePermissions';
import { apiErrorMessage } from '../../utils/apiError';
import { formatDateTime } from '../../utils/formatters';

type View = 'PENDING' | 'ALL';

const STATUS_BADGE: Record<ApprovalStatus, { label: string; variant: 'warning' | 'success' | 'error' | 'default' | 'info' }> = {
  PENDING:   { label: 'Pendiente',  variant: 'warning' },
  EXECUTING: { label: 'Ejecutando', variant: 'info' },
  APPROVED:  { label: 'Aprobada',   variant: 'success' },
  REJECTED:  { label: 'Rechazada',  variant: 'error' },
  FAILED:    { label: 'Falló',      variant: 'error' },
};

function documentPath(r: ApprovalRequest): string | null {
  switch (r.entityType) {
    case 'INVOICE':         return r.action === 'INVOICE_DELETE' && r.status === 'APPROVED' ? null : `/invoices/${r.entityId}`;
    case 'REMITO':          return `/remitos/${r.entityId}`;
    case 'PURCHASE_REMITO': return `/purchase-remitos/${r.entityId}`;
    case 'RECIBO':          return `/recibos/${r.entityId}`;
    case 'CASH_MOVEMENT':   return r.cashRegisterId ? `/cash-registers/${r.cashRegisterId}` : null;
    default:                return null;
  }
}

export default function ApprovalsPage() {
  const { isOwner } = usePermissions();
  const bump = useApprovalStore((s) => s.bump);
  const version = useApprovalStore((s) => s.version);
  const [view, setView] = useState<View>('PENDING');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolving, setResolving] = useState<{ request: ApprovalRequest; decision: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setRequests(await approvalsService.getAll(view));
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al cargar las solicitudes');
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  useEffect(() => { load(); }, [load, version]);

  const openResolve = (request: ApprovalRequest, decision: 'approve' | 'reject') => {
    setComment('');
    setResolving({ request, decision });
  };

  const handleResolve = async () => {
    if (!resolving) return;
    setIsSubmitting(true);
    try {
      const { request, decision } = resolving;
      if (decision === 'approve') {
        const result = await approvalsService.approve(request.id, comment.trim() || undefined);
        if (result.status === 'FAILED') {
          toast.error(`No se pudo ejecutar: ${result.errorMessage ?? 'error desconocido'}`, { duration: 7000 });
        } else {
          toast.success(`Aprobada: ${request.actionLabel}`);
        }
      } else {
        await approvalsService.reject(request.id, comment.trim() || undefined);
        toast.success('Solicitud rechazada');
      }
      setResolving(null);
      bump();
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Error al resolver la solicitud');
      load();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Aprobaciones"
        subtitle={
          isOwner
            ? 'Acciones protegidas que pidieron los usuarios de la empresa'
            : 'Tus solicitudes de acciones que requieren aprobación del Dueño'
        }
        actions={<PushToggle />}
      />

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
        {(['PENDING', 'ALL'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              view === v
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-white'
            )}
          >
            {v === 'PENDING' ? 'Pendientes' : 'Historial'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-16 text-center">
          <Inbox className="w-8 h-8 text-gray-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {view === 'PENDING' ? 'No hay solicitudes pendientes' : 'Todavía no hay solicitudes'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const path = documentPath(r);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{r.actionLabel}</span>
                      <Badge variant={badge.variant} size="sm">{r.autoApproved ? 'Ejecutada por el Dueño' : badge.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                      {path ? (
                        <Link to={path} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                          {r.entityLabel ?? 'Ver comprobante'}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.entityLabel}</span>
                      )}
                      {' · '}
                      {r.requestedByName ?? 'Usuario eliminado'} · {formatDateTime(r.createdAt)}
                    </p>
                    {r.reason && (
                      <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                        <span className="text-gray-400 dark:text-slate-500">Motivo:</span> {r.reason}
                      </p>
                    )}
                    {r.resolvedAt && !r.autoApproved && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        {r.status === 'REJECTED' ? 'Rechazada' : 'Resuelta'} por {r.resolvedByName ?? '—'} el {formatDateTime(r.resolvedAt)}
                        {r.resolutionComment ? ` — "${r.resolutionComment}"` : ''}
                      </p>
                    )}
                    {r.status === 'FAILED' && r.errorMessage && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">Error al ejecutar: {r.errorMessage}</p>
                    )}
                  </div>

                  {isOwner && r.status === 'PENDING' && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openResolve(r, 'reject')}>
                        <X className="w-3.5 h-3.5 mr-1" /> Rechazar
                      </Button>
                      <Button size="sm" onClick={() => openResolve(r, 'approve')}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!resolving}
        onClose={() => !isSubmitting && setResolving(null)}
        title={resolving?.decision === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
      >
        {resolving && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-slate-700/50 p-3 text-sm">
              <ShieldCheck className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {resolving.request.actionLabel} — {resolving.request.entityLabel}
                </p>
                <p className="mt-0.5 text-gray-500 dark:text-slate-400">
                  {resolving.decision === 'approve'
                    ? 'La acción se ejecuta ahora, en tu nombre.'
                    : 'La acción no se ejecuta y el comprobante se desbloquea.'}
                </p>
              </div>
            </div>
            <Textarea
              label="Comentario (opcional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              maxLength={500}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResolving(null)} disabled={isSubmitting}>Cancelar</Button>
              <Button
                variant={resolving.decision === 'approve' ? 'primary' : 'danger'}
                onClick={handleResolve}
                isLoading={isSubmitting}
              >
                {resolving.decision === 'approve' ? 'Aprobar y ejecutar' : 'Rechazar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
