import { CashRegister, CreateCashRegisterInput, UpdateCashRegisterInput } from '../entities/CashRegister';

export interface ICashRegisterRepository {
  findById(id: string): Promise<CashRegister | null>;
  findAll(onlyActive?: boolean): Promise<CashRegister[]>;
  create(data: CreateCashRegisterInput): Promise<CashRegister>;
  update(id: string, data: UpdateCashRegisterInput): Promise<CashRegister>;
  delete(id: string): Promise<void>;
}
