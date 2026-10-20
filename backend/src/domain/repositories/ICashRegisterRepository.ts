import {
  CashRegister,
  CashRegisterClose,
  CashRegisterClosePreview,
  CashRegisterMovement,
  CreateCashRegisterInput,
  UpdateCashRegisterInput,
  CreateCashRegisterCloseInput,
  CashMovement,
  CreateCashMovementInput,
} from '../entities/CashRegister';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ICashRegisterRepository {
  findById(id: string, companyId?: string): Promise<CashRegister | null>;
  findAll(onlyActive?: boolean, companyId?: string): Promise<CashRegister[]>;
  create(data: CreateCashRegisterInput): Promise<CashRegister>;
  update(id: string, data: UpdateCashRegisterInput): Promise<CashRegister>;
  delete(id: string): Promise<void>;
  getMovements(
    cashRegisterId: string,
    filters: { type?: string; startDate?: string; endDate?: string; fiscalMode?: string },
    pagination?: PaginationParams
  ): Promise<PaginatedResult<CashRegisterMovement>>;
  getClosePreview(cashRegisterId: string, fiscalMode?: string): Promise<CashRegisterClosePreview>;
  createClose(cashRegisterId: string, data: CreateCashRegisterCloseInput, fiscalMode?: string): Promise<CashRegisterClose>;
  getCloses(cashRegisterId: string, pagination?: PaginationParams): Promise<PaginatedResult<CashRegisterClose>>;
  createCashMovement(data: CreateCashMovementInput): Promise<CashMovement>;
  findCashMovement(id: string, cashRegisterId: string, companyId?: string): Promise<CashMovement | null>;
  cancelCashMovement(movement: CashMovement): Promise<CashMovement>;
}
