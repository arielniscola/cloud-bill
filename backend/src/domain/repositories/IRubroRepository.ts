import { Rubro, CreateRubroInput, UpdateRubroInput } from '../entities/Rubro';

export interface IRubroRepository {
  findAll(companyId?: string): Promise<Rubro[]>;
  findById(id: string): Promise<Rubro | null>;
  create(data: CreateRubroInput): Promise<Rubro>;
  update(id: string, data: UpdateRubroInput): Promise<Rubro>;
  delete(id: string): Promise<void>;
}
