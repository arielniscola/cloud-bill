export type ChequeType   = 'INGRESO' | 'EGRESO';
// ENDOSADO = cheque de tercero entregado/endosado a un proveedor en una Orden de Pago
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
  dueDate:        Date | null;
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
  createdAt:      Date;
  updatedAt:      Date;
  // relations (optional, populated on findById)
  customer?:      { id: string; name: string } | null;
  supplier?:      { id: string; name: string } | null;
}

export interface CreateChequeInput {
  type:           ChequeType;
  checkNumber?:   string;
  bank?:          string;
  amount:         number;
  currency?:      string;
  exchangeRate?:  number;
  dueDate?:       string;
  issuer?:        string;
  beneficiary?:   string;
  notes?:         string;
  customerId?:    string;
  supplierId?:    string;
  bankAccountId?: string;
  cashRegisterId?:string;
  chequeraId?:    string;
  ordenPagoId?:   string;
  fiscalMode?:    string;
}
