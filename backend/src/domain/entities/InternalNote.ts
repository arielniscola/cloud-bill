export type InternalNoteType   = 'DEBIT' | 'CREDIT';
export type InternalNoteStatus = 'ACTIVE' | 'CANCELLED';
export type InternalNoteEntity = 'CUSTOMER' | 'SUPPLIER';

export interface InternalNote {
  id:         string;
  number:     string;
  type:       InternalNoteType;
  customerId: string | null;
  supplierId: string | null;
  userId:     string;
  companyId:  string;
  currency:   string;
  amount:     number;
  reason:     string;
  notes:      string | null;
  status:     InternalNoteStatus;
  createdAt:  Date;
  updatedAt:  Date;
  customer?:  { id: string; name: string } | null;
  supplier?:  { id: string; name: string } | null;
  user?:      { id: string; name: string };
}

export interface CreateInternalNoteInput {
  type:        InternalNoteType;
  customerId?: string | null;
  supplierId?: string | null;
  userId:      string;
  companyId:   string;
  currency:    string;
  amount:      number;
  reason:      string;
  notes?:      string | null;
}
