import { BankAccount, BankMovement, CreateBankAccountInput, CreateBankMovementInput } from '../entities/Bank';
import { PaginatedResult, PaginationParams } from '../../shared/types';

export interface IBankRepository {
  findAllAccounts(companyId: string): Promise<BankAccount[]>;
  findAccountById(id: string, companyId: string): Promise<BankAccount | null>;
  createAccount(data: CreateBankAccountInput): Promise<BankAccount>;
  updateAccount(id: string, companyId: string, data: Partial<CreateBankAccountInput> & { isActive?: boolean }): Promise<BankAccount>;
  deleteAccount(id: string, companyId: string): Promise<void>;

  getMovements(bankAccountId: string, pagination: PaginationParams, fiscalMode?: string): Promise<PaginatedResult<BankMovement>>;
  addMovement(data: CreateBankMovementInput): Promise<BankMovement>;
}
