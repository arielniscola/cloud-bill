export type CardType = 'CREDIT' | 'DEBIT';

export interface CardSurcharge {
  id: string;
  cardId: string;
  installments: number;
  surchargePercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  bank: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  surcharges: CardSurcharge[];
}

export interface CreateCardDTO {
  name: string;
  type: CardType;
  bank?: string | null;
  isActive?: boolean;
  surcharges: Array<{ installments: number; surchargePercent: number }>;
}

export type UpdateCardDTO = Partial<CreateCardDTO>;
