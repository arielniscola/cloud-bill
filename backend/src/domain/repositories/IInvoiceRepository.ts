import {
  Invoice,
  InvoiceWithItems,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '../entities/Invoice';
import { PaginationParams, PaginatedResult, InvoiceStatus, InvoiceType } from '../../shared/types';

export interface InvoiceFilters {
  customerId?: string;
  userId?: string;
  status?: InvoiceStatus;
  type?: InvoiceType;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IInvoiceRepository {
  findById(id: string): Promise<InvoiceWithItems | null>;
  findByNumber(number: string): Promise<Invoice | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: InvoiceFilters
  ): Promise<PaginatedResult<Invoice>>;
  create(data: CreateInvoiceInput): Promise<InvoiceWithItems>;
  update(id: string, data: UpdateInvoiceInput): Promise<Invoice>;
  delete(id: string): Promise<void>;
  getNextInvoiceNumber(type: InvoiceType): Promise<string>;
}
