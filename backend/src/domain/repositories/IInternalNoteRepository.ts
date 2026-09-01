import { InternalNote, CreateInternalNoteInput } from '../entities/InternalNote';
import { PaginationParams, PaginatedResult } from '../../shared/types';
import { Prisma } from '@prisma/client';

export interface InternalNoteFilters {
  customerId?: string;
  supplierId?: string;
  entity?:     'CUSTOMER' | 'SUPPLIER';  // filtra por presencia de cliente/proveedor
  type?:       string;
  status?:     string;
  currency?:   string;
  dateFrom?:   Date;
  dateTo?:     Date;
  companyId?:  string;
}

export interface IInternalNoteRepository {
  findById(id: string, companyId?: string): Promise<InternalNote | null>;
  findAll(
    pagination: PaginationParams,
    filters: InternalNoteFilters
  ): Promise<PaginatedResult<InternalNote>>;
  create(data: CreateInternalNoteInput): Promise<InternalNote>;
  cancel(id: string): Promise<InternalNote>;
  getNextNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string>;
}
