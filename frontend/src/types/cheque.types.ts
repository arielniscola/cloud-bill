export type ChequeType   = 'INGRESO' | 'EGRESO';
export type ChequeStatus = 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'RETURNED' | 'ENDOSADO';

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
};

export const CHEQUE_STATUS_COLORS: Record<ChequeStatus, string> = {
  PENDING:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  DEPOSITED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  CLEARED:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  BOUNCED:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RETURNED:  'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
  ENDOSADO:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
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
};
