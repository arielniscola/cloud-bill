export interface Chequera {
  id:            string;
  name:          string | null;
  bank:          string;
  accountNumber: string;
  numberFrom:    number | null;
  numberTo:      number | null;
  nextNumber:    number | null;
  isActive:      boolean;
  companyId:     string;
  createdAt:     string;
  updatedAt:     string;
}

export interface CreateChequeraDTO {
  name?:          string | null;
  bank:           string;
  accountNumber:  string;
  numberFrom?:    number | null;
  numberTo?:      number | null;
  nextNumber?:    number | null;
  isActive?:      boolean;
}

export type UpdateChequeraDTO = Partial<CreateChequeraDTO>;
