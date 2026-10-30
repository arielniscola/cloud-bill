import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { approvalsService, type ApprovalRequest } from '../../services/approvals.service';
import { useApprovalStore } from '../../stores/approval.store';
import type { ApprovalEntityType } from '../../utils/approvalActions';
import { formatDateTime } from '../../utils/formatters';

interface PendingApprovalBannerProps {
  entityType: ApprovalEntityType;
  entityId: string | undefined;
  /** Avisa al padre si el documento está bloqueado (para deshabilitar acciones). */
  onChange?: (request: ApprovalRequest | null) => void;
}

/** Aviso de "Pendiente de aprobación" en el detalle de un comprobante bloqueado. */
export default function PendingApprovalBanner({ entityType, entityId, onChange }: PendingApprovalBannerProps) {
  const version = useApprovalStore((s) => s.version);
  const [request, setRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    if (!entityId) return;
    let alive = true;
    approvalsService
      .getOpenForEntity(entityType, entityId)
      .then((r) => { if (alive) { setRequest(r); onChange?.(r); } })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, version]);

  if (!request) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <Clock className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Pendiente de aprobación: {request.actionLabel}</p>
        <p className="mt-0.5">
          Pedido por {request.requestedByName ?? 'un usuario'} el {formatDateTime(request.createdAt)}
          {request.reason ? ` — "${request.reason}"` : ''}. El comprobante no se puede modificar hasta que el Dueño lo resuelva.
        </p>
      </div>
      <Link to="/approvals" className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">
        Ver
      </Link>
    </div>
  );
}
