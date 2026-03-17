import { Company, CreateCompanyInput, UpdateCompanyInput } from '../entities/Company';

export interface ICompanyRepository {
  findAll(): Promise<Company[]>;
  findById(id: string): Promise<Company | null>;
  create(data: CreateCompanyInput): Promise<Company>;
  update(id: string, data: UpdateCompanyInput): Promise<Company>;
  updateModules(id: string, enabledModules: string[]): Promise<Company>;
  delete(id: string): Promise<void>;
}
