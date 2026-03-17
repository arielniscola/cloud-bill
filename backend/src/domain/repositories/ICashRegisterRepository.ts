import {
  CashRegister,
  CashRegisterClose,
  CashRegisterClosePreview,
  CashRegisterMovement,
  CreateCashRegisterInput,
  UpdateCashRegisterInput,
  CreateCashRegisterCloseInput,
} from '../entities/CashRegister';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ICashRegisterRepository {
  findById(id: string): Promise<CashRegister | null>;
  findAll(onlyActive?: boolean, companyId?: string): Promise<CashRegister[]>;
  create(data: CreateCashRegisterInput): Promise<CashRegister>;
  update(id: string, data: UpdateCashRegisterInput): Promise<CashRegister>;
  delete(id: string): Promise<void>;
  getMovements(
    cashRegisterId: string,
    filters: { type?: string; startDate?: string; endDate?: string },
    pagination?: PaginationParams
  ): Promise<PaginatedResult<CashRegisterMovement>>;
  getClosePreview(cashRegisterId: string): Promise<CashRegisterClosePreview>;
  createClose(cashRegisterId: string, data: CreateCashRegisterCloseInput): Promise<CashRegisterClose>;
  getCloses(cashRegisterId: string, pagination?: PaginationParams): Promise<PaginatedResult<CashRegisterClose>>;
}
