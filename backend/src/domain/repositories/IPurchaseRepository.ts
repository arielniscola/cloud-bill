import { Purchase, PurchaseWithItems, CreatePurchaseInput, UpdatePurchaseInput } from '../entities/Purchase';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface PurchaseFilters {
  supplierId?: string;
  status?: 'REGISTERED' | 'CANCELLED';
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IPurchaseRepository {
  findAll(pagination?: PaginationParams, filters?: PurchaseFilters): Promise<PaginatedResult<Purchase>>;
  findById(id: string): Promise<PurchaseWithItems | null>;
  findAllByPeriod(year: number, month: number): Promise<PurchaseWithItems[]>;
  create(data: CreatePurchaseInput): Promise<PurchaseWithItems>;
  update(id: string, data: UpdatePurchaseInput): Promise<Purchase>;
  delete(id: string): Promise<void>;
}
