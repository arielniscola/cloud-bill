export type ChequeType   = 'INGRESO' | 'EGRESO';
export type ChequeStatus = 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'RETURNED' | 'ENDOSADO' | 'EGRESADO';

export interface Cheque {
  id:             string;
  number:         string;
  type:           ChequeType;
  checkNumber:    string | null;
  bank:           string | null;
  amount:         number;
  currency:       string;
  exchangeRate:   number;
  dueDate:        string | null;
  issuer:         string | null;
  beneficiary:    string | null;
  status:         ChequeStatus;
  notes:          string | null;
  customerId:     string | null;
  supplierId:     string | null;
  bankAccountId:  string | null;
  cashRegisterId: string | null;
  chequeraId:     string | null;
  ordenPagoId:    string | null;
  userId:         string;
  companyId:      string;
  fiscalMode:     string;
  createdAt:      string;
  updatedAt:      string;
  customer?:      { id: string; name: string } | null;
  supplier?:      { id: string; name: string } | null;
  /** Orden de pago con la que se entregó el cheque (a quién partió). */
  ordenPago?:     { id: string; number: string } | null;
}

export interface CreateChequeDTO {
  type:            ChequeType;
  checkNumber?:    string;
  bank?:           string;
  amount:          number;
  currency?:       string;
  exchangeRate?:   number;
  dueDate?:        string;
  issuer?:         string;
  beneficiary?:    string;
  notes?:          string;
  customerId?:     string | null;
  supplierId?:     string | null;
  bankAccountId?:  string | null;
  cashRegisterId?: string | null;
  chequeraId?:     string | null;
}

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  PENDING:   'En cartera',
  DEPOSITED: 'Depositado',
  CLEARED:   'Acreditado',
  BOUNCED:   'Rechazado',
  RETURNED:  'Devuelto',
  ENDOSADO:  'Endosado',
  EGRESADO:  'Egresado',
};

export const CHEQUE_STATUS_COLORS: Record<ChequeStatus, string> = {
  PENDING:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  DEPOSITED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  CLEARED:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  BOUNCED:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RETURNED:  'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
  ENDOSADO:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  EGRESADO:  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

// Allowed transitions per status
export const CHEQUE_NEXT_STATUSES: Record<ChequeStatus, Array<{ value: ChequeStatus; label: string }>> = {
  PENDING:   [
    { value: 'DEPOSITED', label: 'Marcar depositado' },
    { value: 'CLEARED',   label: 'Marcar acreditado' },
    { value: 'BOUNCED',   label: 'Marcar rechazado'  },
    { value: 'RETURNED',  label: 'Devolver'          },
  ],
  DEPOSITED: [
    { value: 'CLEARED',  label: 'Marcar acreditado' },
    { value: 'BOUNCED',  label: 'Marcar rechazado'  },
  ],
  CLEARED:  [],
  BOUNCED:  [{ value: 'PENDING', label: 'Volver a cartera' }],
  RETURNED: [{ value: 'PENDING', label: 'Volver a cartera' }],
  // Cheque endosado a proveedor: estado terminal desde la cartera (se gestiona vía la OP)
  ENDOSADO: [],
  // Egresado de cartera: vuelve solo anulando el egreso (pestaña "Egresos de cartera").
  EGRESADO: [],
};

// ── Rechazo de cheque ─────────────────────────────────────────────
/** Cómo se documenta el débito al rechazar: nota interna o Nota de Débito. */
export type ChequeBounceMode = 'INTERNAL_NOTE' | 'DEBIT_NOTE';

export interface ChequeBounceOptions {
  bounceMode: ChequeBounceMode;
  /** Solo proveedor + DEBIT_NOTE: N° de la ND que mandó el proveedor. */
  debitNoteNumber?: string;
  /** Solo proveedor + DEBIT_NOTE: letra del comprobante. */
  debitNoteLetter?: 'A' | 'B' | 'C';
}

export interface ChequeBounceResult {
  kind: 'INTERNAL_NOTE' | 'SALES_DEBIT_NOTE' | 'PURCHASE_DEBIT_NOTE' | 'REVERSED' | 'NONE';
  id?: string;
  number?: string;
}

// ── Egreso de cheques en cartera ──────────────────────────────────
/** Origen del cheque en cartera: cargado en Cheques o recibido en una cobranza. */
export type CarteraSource = 'CHEQUE' | 'RECIBO';

export interface CarteraCheque {
  source:      CarteraSource;
  id:          string;
  /** N° interno (CHQ-…) o N° de recibo. */
  number:      string;
  checkNumber: string | null;
  bank:        string | null;
  amount:      string | number;
  currency:    string;
  dueDate:     string | null;
  /** Librador o cliente. */
  holder:      string | null;
  createdAt:   string;
}

export interface ChequeEgresoReason {
  id:         string;
  name:       string;
  isActive:   boolean;
  usageCount: number;
}

export interface ChequeEgreso {
  id:           string;
  source:       CarteraSource;
  chequeId:     string | null;
  reciboId:     string | null;
  sourceNumber?: string | null;
  checkNumber:  string | null;
  bank:         string | null;
  amount:       number;
  currency:     string;
  dueDate:      string | null;
  holder:       string | null;
  reasonId:     string | null;
  reasonName:   string;
  notes:        string | null;
  /** Fecha del egreso (YYYY-MM-DD). */
  date:         string;
  status:       'ACTIVE' | 'CANCELLED';
  createdAt:    string;
  cancelledAt:  string | null;
  cancelReason: string | null;
  user:         { id: string; name: string };
  cancelledBy?: { id: string; name: string } | null;
}

export interface CreateChequeEgresoDTO {
  source:   CarteraSource;
  id:       string;
  reasonId: string;
  date?:    string;
  notes?:   string | null;
}
