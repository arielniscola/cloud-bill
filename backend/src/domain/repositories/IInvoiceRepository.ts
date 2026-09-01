import { Prisma } from '@prisma/client';
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
  saleCondition?: string;
  companyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  fiscalMode?: string;
  /** Número de comprobante, razón social o CUIT del cliente. */
  search?: string;
}

/** Totales de una moneda dentro del conjunto filtrado. */
export interface InvoiceCurrencyStats {
  currency: string;
  count: number;
  total: number;
  taxAmount: number;
  pendingCount: number;
  pendingAmount: number;
  overdueCount: number;
  overdueAmount: number;
}

/**
 * Totales del conjunto filtrado completo — nunca de la página visible.
 *
 * Los importes van desglosados por moneda y NO se suman entre sí: la cuenta
 * corriente del cliente es por moneda (unique customerId+currency+fiscalMode),
 * así que el dominio nunca convierte. Sumar pesos y dólares en un solo número
 * rotulado "ARS" era mezclar dos escalas distintas.
 */
export interface InvoiceStats {
  /** Comprobantes del filtro, sin importar la moneda. */
  count: number;
  /** Un tramo por moneda presente, de mayor a menor facturado. */
  byCurrency: InvoiceCurrencyStats[];
}

export interface IInvoiceRepository {
  findById(id: string, companyId?: string): Promise<InvoiceWithItems | null>;
  findByNumber(number: string, companyId: string): Promise<Invoice | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: InvoiceFilters
  ): Promise<PaginatedResult<Invoice>>;
  getStats(filters?: InvoiceFilters): Promise<InvoiceStats>;
  create(data: CreateInvoiceInput): Promise<InvoiceWithItems>;
  update(id: string, data: UpdateInvoiceInput): Promise<Invoice>;
  updateWithItems(id: string, data: CreateInvoiceInput): Promise<InvoiceWithItems>;
  delete(id: string): Promise<void>;
  getNextInvoiceNumber(
    type: InvoiceType,
    companyId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string>;
}
