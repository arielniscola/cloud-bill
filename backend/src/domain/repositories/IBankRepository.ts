import { BankAccount, BankMovement, CreateBankAccountInput, CreateBankMovementInput } from '../entities/Bank';
import { PaginatedResult, PaginationParams } from '../../shared/types';

export interface IBankRepository {
  findAllAccounts(companyId: string): Promise<BankAccount[]>;
  findAccountById(id: string): Promise<BankAccount | null>;
  createAccount(data: CreateBankAccountInput): Promise<BankAccount>;
  updateAccount(id: string, data: Partial<CreateBankAccountInput> & { isActive?: boolean }): Promise<BankAccount>;
  deleteAccount(id: string): Promise<void>;

  getMovements(bankAccountId: string, pagination: PaginationParams): Promise<PaginatedResult<BankMovement>>;
  addMovement(data: CreateBankMovementInput): Promise<BankMovement>;
}
