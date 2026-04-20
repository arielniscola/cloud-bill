import { InternalNote, CreateInternalNoteInput } from '../entities/InternalNote';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface InternalNoteFilters {
  customerId?: string;
  supplierId?: string;
  type?:       string;
  status?:     string;
  currency?:   string;
  dateFrom?:   Date;
  dateTo?:     Date;
  companyId?:  string;
}

export interface IInternalNoteRepository {
  findById(id: string): Promise<InternalNote | null>;
  findAll(
    pagination: PaginationParams,
    filters: InternalNoteFilters
  ): Promise<PaginatedResult<InternalNote>>;
  create(data: CreateInternalNoteInput): Promise<InternalNote>;
  cancel(id: string): Promise<InternalNote>;
  getNextNumber(): Promise<string>;
}
