import { Recibo, ReciboWithRelations, CreateReciboInput } from '../entities/Recibo';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ReciboFilters {
  invoiceId?: string;
  budgetId?: string;
  ordenPedidoId?: string;
  customerId?: string;
  status?: string;
  paymentMethod?: string;
  companyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IReciboRepository {
  findById(id: string): Promise<ReciboWithRelations | null>;
  findAll(pagination: PaginationParams, filters: ReciboFilters): Promise<PaginatedResult<ReciboWithRelations>>;
  findChecks(pagination: PaginationParams, filters: CheckFilters): Promise<PaginatedResult<ReciboWithRelations>>;
  create(data: CreateReciboInput): Promise<ReciboWithRelations>;
  cancel(id: string): Promise<ReciboWithRelations>;
  updateCheckStatus(id: string, checkStatus: string): Promise<ReciboWithRelations>;
  getNextNumber(): Promise<string>;
}

export interface CheckFilters {
  customerId?: string;
  checkStatus?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  dateFrom?: Date;
  dateTo?: Date;
}
