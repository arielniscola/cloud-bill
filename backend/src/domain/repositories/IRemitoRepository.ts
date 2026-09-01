import type { Prisma } from '@prisma/client';
import {
  Remito,
  RemitoWithItems,
  RemitoItem,
  CreateRemitoInput,
} from '../entities/Remito';
import { PaginationParams, PaginatedResult, RemitoStatus } from '../../shared/types';

export interface RemitoFilters {
  customerId?: string;
  status?: RemitoStatus;
  companyId?: string;
  fiscalMode?: string;
  dateFrom?: Date;
  dateTo?: Date;
  ordenPedidoId?: string;
  invoiceId?: string;
  budgetId?: string;
}

export interface IRemitoRepository {
  findById(id: string, companyId?: string): Promise<RemitoWithItems | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: RemitoFilters
  ): Promise<PaginatedResult<Remito>>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  create(data: CreateRemitoInput, tx?: Prisma.TransactionClient): Promise<RemitoWithItems>;
  updateStatus(id: string, status: RemitoStatus, tx?: Prisma.TransactionClient): Promise<Remito>;
  updateItemDeliveredQuantity(itemId: string, deliveredQuantity: number): Promise<RemitoItem>;
  getNextRemitoNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string>;
  delete(id: string): Promise<void>;
}
