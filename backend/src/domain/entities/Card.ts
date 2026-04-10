export interface Card {
  id: string;
  name: string;
  type: string; // CREDIT | DEBIT
  bank: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
  surcharges: CardSurcharge[];
}

export interface CardSurcharge {
  id: string;
  cardId: string;
  installments: number;
  surchargePercent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCardInput {
  name: string;
  type: string;
  bank?: string | null;
  isActive?: boolean;
  companyId: string;
  surcharges?: Array<{ installments: number; surchargePercent: number }>;
}

export interface UpdateCardInput {
  name?: string;
  type?: string;
  bank?: string | null;
  isActive?: boolean;
  surcharges?: Array<{ installments: number; surchargePercent: number }>;
}
