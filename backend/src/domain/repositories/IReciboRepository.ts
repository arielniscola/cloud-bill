import type { Prisma } from '@prisma/client';
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
  fiscalMode?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IReciboRepository {
  findById(id: string, companyId?: string): Promise<ReciboWithRelations | null>;
  findAll(pagination: PaginationParams, filters: ReciboFilters): Promise<PaginatedResult<ReciboWithRelations>>;
  findChecks(pagination: PaginationParams, filters: CheckFilters): Promise<PaginatedResult<ReciboWithRelations>>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  create(data: CreateReciboInput, tx?: Prisma.TransactionClient): Promise<ReciboWithRelations>;
  cancel(id: string, tx?: Prisma.TransactionClient): Promise<ReciboWithRelations>;
  updateCheckStatus(id: string, checkStatus: string): Promise<ReciboWithRelations>;
  getNextNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string>;
}

export interface CheckFilters {
  customerId?: string;
  checkStatus?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  dateFrom?: Date;
  dateTo?: Date;
}
