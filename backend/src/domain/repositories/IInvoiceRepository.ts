import {
  Invoice,
  InvoiceWithItems,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '../entities/Invoice';
import { PaginationParams, PaginatedResult, InvoiceStatus, InvoiceType, Currency } from '../../shared/types';

export interface InvoiceFilters {
  customerId?: string;
  userId?: string;
  status?: InvoiceStatus;
  type?: InvoiceType;
  currency?: Currency;
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
  updateWithItems(id: string, data: CreateInvoiceInput): Promise<InvoiceWithItems>;
  delete(id: string): Promise<void>;
  getNextInvoiceNumber(type: InvoiceType): Promise<string>;
}
