import { Brand, CreateBrandInput, UpdateBrandInput } from '../entities/Brand';

export interface IBrandRepository {
  findById(id: string): Promise<Brand | null>;
  findAll(): Promise<Brand[]>;
  create(data: CreateBrandInput): Promise<Brand>;
  update(id: string, data: UpdateBrandInput): Promise<Brand>;
  delete(id: string): Promise<void>;
}
