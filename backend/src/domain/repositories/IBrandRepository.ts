import { Brand, CreateBrandInput, UpdateBrandInput } from '../entities/Brand';

export interface IBrandRepository {
  findById(id: string): Promise<Brand | null>;
  findAll(companyId?: string): Promise<Brand[]>;
  create(data: CreateBrandInput & { companyId?: string }): Promise<Brand>;
  update(id: string, data: UpdateBrandInput): Promise<Brand>;
  delete(id: string): Promise<void>;
}
