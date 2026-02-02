import {
  CurrentAccount,
  AccountMovement,
  CreateAccountMovementInput,
} from '../entities/CurrentAccount';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ICurrentAccountRepository {
  findById(id: string): Promise<CurrentAccount | null>;
  findByCustomerId(customerId: string): Promise<CurrentAccount | null>;
  createForCustomer(customerId: string, creditLimit?: number): Promise<CurrentAccount>;
  updateCreditLimit(id: string, creditLimit: number | null): Promise<CurrentAccount>;
  addMovement(data: CreateAccountMovementInput): Promise<AccountMovement>;
  getMovements(
    currentAccountId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<AccountMovement>>;
  getBalance(customerId: string): Promise<number>;
}
