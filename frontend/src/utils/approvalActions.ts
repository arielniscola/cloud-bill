// Copia del catálogo del backend (`shared/constants/approvalActions.ts`).

export type ApprovalAction =
  | 'INVOICE_CANCEL'
  | 'INVOICE_DELETE'
  | 'NOTE_CANCEL'
  | 'CREDIT_NOTE_REFUND'
  | 'REMITO_CANCEL'
  | 'PURCHASE_REMITO_CANCEL'
  | 'RECIBO_CANCEL'
  | 'CASH_MOVEMENT_CANCEL';

export const APPROVAL_ACTION_LABELS: Record<ApprovalAction, string> = {
  INVOICE_CANCEL:         'Anular factura',
  INVOICE_DELETE:         'Eliminar borrador de factura',
  NOTE_CANCEL:            'Anular o eliminar nota de crédito / débito',
  CREDIT_NOTE_REFUND:     'Devolución de nota de crédito',
  REMITO_CANCEL:          'Anular remito',
  PURCHASE_REMITO_CANCEL: 'Anular remito de compra',
  RECIBO_CANCEL:          'Anular recibo',
  CASH_MOVEMENT_CANCEL:   'Anular movimiento de caja',
};

export type ApprovalEntityType = 'INVOICE' | 'REMITO' | 'PURCHASE_REMITO' | 'RECIBO' | 'CASH_MOVEMENT';

/**
 * La acción no se ejecutó porque pasó por el circuito de aprobación: quedó una
 * solicitud pendiente (`pending`) o el usuario no cargó el motivo (`cancelled`).
 * El interceptor ya avisó con un toast; quien llamó solo tiene que cerrar su
 * diálogo y no mostrar un error.
 */
export class ApprovalFlowError extends Error {
  constructor(public readonly outcome: 'pending' | 'cancelled') {
    super(outcome === 'pending' ? 'Solicitud de aprobación enviada' : 'Solicitud de aprobación cancelada');
    this.name = 'ApprovalFlowError';
  }
}

export function approvalOutcome(err: unknown): 'pending' | 'cancelled' | null {
  return err instanceof ApprovalFlowError ? err.outcome : null;
}
