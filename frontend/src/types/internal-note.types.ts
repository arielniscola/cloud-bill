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
  createdAt:  string;
  updatedAt:  string;
  customer?:  { id: string; name: string } | null;
  supplier?:  { id: string; name: string } | null;
  user?:      { id: string; name: string } | null;
}

export interface CreateInternalNoteDTO {
  type:        InternalNoteType;
  customerId?: string | null;
  supplierId?: string | null;
  currency:    'ARS' | 'USD';
  amount:      number;
  reason:      string;
  notes?:      string | null;
}

export interface InternalNoteFilters {
  page?:       number;
  limit?:      number;
  customerId?: string;
  supplierId?: string;
  entity?:     InternalNoteEntity;
  type?:       InternalNoteType | '';
  status?:     InternalNoteStatus | '';
  currency?:   string;
  dateFrom?:   string;
  dateTo?:     string;
}
