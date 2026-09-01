import { Budget, BudgetWithItems, CreateBudgetInput, UpdateBudgetInput } from '../entities/Budget';
import { PaginatedResult } from '../../shared/types';
import { Prisma } from '@prisma/client';

export interface BudgetFilters {
  customerId?: string;
  status?: string;
  type?: string;
  currency?: string;
  companyId?: string;
  fiscalMode?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IBudgetRepository {
  findById(id: string, companyId?: string): Promise<BudgetWithItems | null>;
  findAll(pagination?: { page: number; limit: number }, filters?: BudgetFilters): Promise<PaginatedResult<Budget>>;
  create(data: CreateBudgetInput): Promise<BudgetWithItems>;
  update(id: string, data: UpdateBudgetInput): Promise<BudgetWithItems>;
  delete(id: string): Promise<void>;
  getNextBudgetNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string>;
}
