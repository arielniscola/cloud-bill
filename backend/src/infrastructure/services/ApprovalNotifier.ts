import prisma from '../database/prisma';
import { APPROVAL_ACTION_LABELS, ApprovalAction } from '../../shared/constants/approvalActions';
import { findOwnerIds, sendPushToUsers } from './PushService';

// Avisos push del circuito de aprobaciones. Se disparan sin await desde el
// request: un push lento o caído nunca demora ni rompe la acción.

const label = (action: string) => APPROVAL_ACTION_LABELS[action as ApprovalAction] ?? action;
const describe = (action: string, entityLabel: string | null) => (entityLabel ? `${label(action)} — ${entityLabel}` : label(action));

/** Solicitud nueva → a los Dueños de la empresa. */
export function notifyApprovalRequested(input: {
  requestId: string;
  companyId: string;
  requestedById: string;
  action: string;
  entityLabel: string | null;
  reason: string;
}): void {
  void (async () => {
    const owners = await findOwnerIds(input.companyId, input.requestedById);
    if (!owners.length) return;
    const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM "users" WHERE id = ${input.requestedById} LIMIT 1`;
    const who = rows[0]?.name ?? 'Un usuario';
    await sendPushToUsers(owners, {
      title: 'Aprobación pendiente',
      body: `${who} pide: ${describe(input.action, input.entityLabel)}\nMotivo: ${input.reason}`,
      url: '/approvals',
      tag: `approval-${input.requestId}`,
    });
  })().catch((err) => console.error('[Approvals] No se pudo avisar a los Dueños:', err));
}

/** Solicitud resuelta → a quien la pidió. */
export function notifyApprovalResolved(input: {
  requestId: string;
  requestedById: string | null;
  resolvedById: string;
  action: string;
  entityLabel: string | null;
  status: 'APPROVED' | 'REJECTED' | 'FAILED';
  comment?: string | null;
  errorMessage?: string | null;
}): void {
  if (!input.requestedById || input.requestedById === input.resolvedById) return;
  const title =
    input.status === 'APPROVED' ? 'Solicitud aprobada' : input.status === 'REJECTED' ? 'Solicitud rechazada' : 'La acción aprobada falló';
  const extra =
    input.status === 'FAILED' ? input.errorMessage : input.comment ? `Comentario: ${input.comment}` : null;
  void sendPushToUsers([input.requestedById], {
    title,
    body: describe(input.action, input.entityLabel) + (extra ? `\n${extra}` : ''),
    url: '/approvals',
    tag: `approval-${input.requestId}`,
  }).catch((err) => console.error('[Approvals] No se pudo avisar al solicitante:', err));
}
