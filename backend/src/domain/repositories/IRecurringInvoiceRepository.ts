import { RecurringInvoice, CreateRecurringInvoiceInput } from '../entities/RecurringInvoice';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface RecurringInvoiceFilters {
  companyId?: string;
  customerId?: string;
  isActive?: boolean;
}

export interface IRecurringInvoiceRepository {
  findById(id: string, companyId?: string): Promise<RecurringInvoice | null>;
  findAll(pagination?: PaginationParams, filters?: RecurringInvoiceFilters): Promise<PaginatedResult<RecurringInvoice>>;
  /** Abonos activos con nextRunAt vencido según NOW() de la base (para el generador). */
  findDue(): Promise<RecurringInvoice[]>;
  create(data: CreateRecurringInvoiceInput): Promise<RecurringInvoice>;
  update(id: string, data: Partial<CreateRecurringInvoiceInput> & { isActive?: boolean }): Promise<RecurringInvoice>;
  delete(id: string): Promise<void>;
  /**
   * Reclama una corrida de forma atómica: avanza nextRunAt solo si el abono
   * sigue vencido (nextRunAt <= NOW() en la base). Devuelve false si otro
   * proceso ya la tomó — una vez avanzada, deja de estar vencida.
   */
  claimRun(id: string, newNextRunAt: Date): Promise<boolean>;
  /** Registra el resultado de una corrida exitosa. */
  recordRun(id: string, ranAt: Date): Promise<void>;
}
