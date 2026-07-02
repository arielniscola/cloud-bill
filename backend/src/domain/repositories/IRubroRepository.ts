import { Rubro, CreateRubroInput, UpdateRubroInput } from '../entities/Rubro';

export interface IRubroRepository {
  findById(id: string, companyId?: string): Promise<Rubro | null>;
  findAll(companyId?: string): Promise<Rubro[]>;
  findByParentId(parentId: string | null): Promise<Rubro[]>;
  create(data: CreateRubroInput & { companyId?: string }): Promise<Rubro>;
  update(id: string, data: UpdateRubroInput): Promise<Rubro>;
  delete(id: string): Promise<void>;
}
