import type { Prisma } from '@prisma/client';
import {
  CurrentAccount,
  AccountMovement,
  CreateAccountMovementInput,
} from '../entities/CurrentAccount';
import { PaginationParams, PaginatedResult, Currency } from '../../shared/types';

/** Origen del movimiento, para los filtros del extracto. */
export type MovementOrigin = 'INVOICE' | 'CREDIT_DEBIT_NOTE' | 'RECIBO' | 'INTERNAL_NOTE';

export interface MovementFilters {
  type?: 'DEBIT' | 'CREDIT';
  origin?: MovementOrigin;
  /** Busca en la descripción y en el número del comprobante asociado. */
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface ICurrentAccountRepository {
  findById(id: string): Promise<CurrentAccount | null>;
  findByCustomerId(customerId: string, currency?: Currency, fiscalMode?: string): Promise<CurrentAccount | null>;
  findAllByCustomerId(customerId: string, fiscalMode?: string): Promise<CurrentAccount[]>;
  createForCustomer(customerId: string, currency: Currency, creditLimit?: number, fiscalMode?: string, tx?: Prisma.TransactionClient): Promise<CurrentAccount>;
  updateCreditLimit(id: string, creditLimit: number | null): Promise<CurrentAccount>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  addMovement(data: CreateAccountMovementInput, tx?: Prisma.TransactionClient): Promise<AccountMovement>;
  /** `currentAccountId` acepta varios ids (modo "Todos": una cuenta por fiscalMode) para traer los movimientos combinados. */
  getMovements(
    currentAccountId: string | string[],
    pagination?: PaginationParams,
    filters?: MovementFilters
  ): Promise<PaginatedResult<AccountMovement>>;
  getBalance(customerId: string, currency: Currency): Promise<number>;
  /** `includeCredit`: además de los deudores, trae los saldos a favor (balance < 0). */
  findAllWithDebt(companyId?: string, fiscalMode?: string, includeCredit?: boolean): Promise<CurrentAccount[]>;
}
