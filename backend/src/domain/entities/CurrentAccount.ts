import { Decimal } from '@prisma/client/runtime/library';
import { MovementType } from '../../shared/types';

export interface CurrentAccount {
  id: string;
  customerId: string;
  balance: Decimal;
  creditLimit: Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountMovement {
  id: string;
  currentAccountId: string;
  type: MovementType;
  amount: Decimal;
  balance: Decimal;
  description: string;
  invoiceId: string | null;
  createdAt: Date;
}

export interface CreateAccountMovementInput {
  currentAccountId: string;
  type: MovementType;
  amount: number;
  description: string;
  invoiceId?: string;
}
