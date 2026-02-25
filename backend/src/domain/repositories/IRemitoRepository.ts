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
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IRemitoRepository {
  findById(id: string): Promise<RemitoWithItems | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: RemitoFilters
  ): Promise<PaginatedResult<Remito>>;
  create(data: CreateRemitoInput): Promise<RemitoWithItems>;
  updateStatus(id: string, status: RemitoStatus): Promise<Remito>;
  updateItemDeliveredQuantity(itemId: string, deliveredQuantity: number): Promise<RemitoItem>;
  getNextRemitoNumber(): Promise<string>;
  delete(id: string): Promise<void>;
}
