import {
  CurrentAccount,
  AccountMovement,
  CreateAccountMovementInput,
} from '../entities/CurrentAccount';
import { PaginationParams, PaginatedResult, Currency } from '../../shared/types';

export interface ICurrentAccountRepository {
  findById(id: string): Promise<CurrentAccount | null>;
  findByCustomerId(customerId: string, currency?: Currency): Promise<CurrentAccount | null>;
  findAllByCustomerId(customerId: string): Promise<CurrentAccount[]>;
  createForCustomer(customerId: string, currency: Currency, creditLimit?: number): Promise<CurrentAccount>;
  updateCreditLimit(id: string, creditLimit: number | null): Promise<CurrentAccount>;
  addMovement(data: CreateAccountMovementInput): Promise<AccountMovement>;
  getMovements(
    currentAccountId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<AccountMovement>>;
  getBalance(customerId: string, currency: Currency): Promise<number>;
  findAllWithDebt(): Promise<CurrentAccount[]>;
}
