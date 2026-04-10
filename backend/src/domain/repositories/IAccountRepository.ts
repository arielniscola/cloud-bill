import { Account, CreateAccountInput } from '../entities/Accounting';

export interface IAccountRepository {
  findAll(companyId: string): Promise<Account[]>;
  findByCode(code: string, companyId: string): Promise<Account | null>;
  bulkCreate(accounts: CreateAccountInput[]): Promise<void>;
  hasAccounts(companyId: string): Promise<boolean>;
}
