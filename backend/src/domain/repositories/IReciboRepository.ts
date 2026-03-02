import { Recibo, ReciboWithRelations, CreateReciboInput } from '../entities/Recibo';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ReciboFilters {
  invoiceId?: string;
  budgetId?: string;
  customerId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IReciboRepository {
  findById(id: string): Promise<ReciboWithRelations | null>;
  findAll(pagination: PaginationParams, filters: ReciboFilters): Promise<PaginatedResult<ReciboWithRelations>>;
  create(data: CreateReciboInput): Promise<ReciboWithRelations>;
  cancel(id: string): Promise<ReciboWithRelations>;
  getNextNumber(): Promise<string>;
}
