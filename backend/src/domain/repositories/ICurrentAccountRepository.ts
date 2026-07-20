import type { Prisma } from '@prisma/client';
import {
  CurrentAccount,
  AccountMovement,
  CreateAccountMovementInput,
} from '../entities/CurrentAccount';
import { PaginationParams, PaginatedResult, Currency } from '../../shared/types';

export interface ICurrentAccountRepository {
  findById(id: string): Promise<CurrentAccount | null>;
  findByCustomerId(customerId: string, currency?: Currency, fiscalMode?: string): Promise<CurrentAccount | null>;
  findAllByCustomerId(customerId: string): Promise<CurrentAccount[]>;
  createForCustomer(customerId: string, currency: Currency, creditLimit?: number, fiscalMode?: string, tx?: Prisma.TransactionClient): Promise<CurrentAccount>;
  updateCreditLimit(id: string, creditLimit: number | null): Promise<CurrentAccount>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  addMovement(data: CreateAccountMovementInput, tx?: Prisma.TransactionClient): Promise<AccountMovement>;
  getMovements(
    currentAccountId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<AccountMovement>>;
  getBalance(customerId: string, currency: Currency): Promise<number>;
  findAllWithDebt(companyId?: string): Promise<CurrentAccount[]>;
}
