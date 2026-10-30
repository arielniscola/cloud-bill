// Catálogo de acciones protegidas: si la empresa no la desactivó, quien no es
// Dueño (OWNER) no la ejecuta directo sino que genera una solicitud de
// aprobación. El frontend tiene una copia en `utils/approvalActions.ts`.

export const APPROVAL_ACTIONS = [
  'INVOICE_CANCEL',         // Anular factura
  'INVOICE_DELETE',         // Eliminar borrador de factura
  'NOTE_CANCEL',            // Anular o eliminar NC / ND
  'CREDIT_NOTE_REFUND',     // Devolución de una NC (pagarla)
  'REMITO_CANCEL',          // Anular remito de venta
  'PURCHASE_REMITO_CANCEL', // Anular remito de compra
  'RECIBO_CANCEL',          // Anular recibo
  'CASH_MOVEMENT_CANCEL',   // Anular retiro / ingreso de caja
] as const;

export type ApprovalAction = typeof APPROVAL_ACTIONS[number];

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

export function isApprovalAction(value: string): value is ApprovalAction {
  return (APPROVAL_ACTIONS as readonly string[]).includes(value);
}
