import { Budget, BudgetWithItems, CreateBudgetInput, UpdateBudgetInput } from '../entities/Budget';
import { PaginatedResult } from '../../shared/types';

export interface BudgetFilters {
  customerId?: string;
  status?: string;
  type?: string;
  currency?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IBudgetRepository {
  findById(id: string): Promise<BudgetWithItems | null>;
  findAll(pagination?: { page: number; limit: number }, filters?: BudgetFilters): Promise<PaginatedResult<Budget>>;
  create(data: CreateBudgetInput): Promise<BudgetWithItems>;
  update(id: string, data: UpdateBudgetInput): Promise<BudgetWithItems>;
  delete(id: string): Promise<void>;
  getNextBudgetNumber(): Promise<string>;
}
