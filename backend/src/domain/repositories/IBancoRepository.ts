import { Banco, CreateBancoInput, UpdateBancoInput } from '../entities/Banco';

export interface IBancoRepository {
  findAll(companyId: string): Promise<Banco[]>;
  findById(id: string): Promise<Banco | null>;
  create(data: CreateBancoInput): Promise<Banco>;
  update(id: string, data: UpdateBancoInput): Promise<Banco>;
  delete(id: string): Promise<void>;
}
