import { Provincia, CreateProvinciaInput, UpdateProvinciaInput } from '../entities/Provincia';

export interface IProvinciaRepository {
  /** Si la empresa todavía no tiene catálogo, lo crea con las 24 jurisdicciones. */
  findAll(companyId: string): Promise<Provincia[]>;
  findById(id: string, companyId?: string): Promise<Provincia | null>;
  create(data: CreateProvinciaInput): Promise<Provincia>;
  update(id: string, data: UpdateProvinciaInput): Promise<Provincia>;
  delete(id: string): Promise<void>;
}
