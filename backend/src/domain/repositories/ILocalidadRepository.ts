import { Localidad, CreateLocalidadInput, UpdateLocalidadInput } from '../entities/Localidad';

export interface ILocalidadRepository {
  findAll(companyId: string): Promise<Localidad[]>;
  findById(id: string, companyId?: string): Promise<Localidad | null>;
  create(data: CreateLocalidadInput): Promise<Localidad>;
  update(id: string, data: UpdateLocalidadInput): Promise<Localidad>;
  delete(id: string): Promise<void>;
  /**
   * Localidades (city + province) ya cargadas en clientes y proveedores de la
   * empresa, distintas, para importarlas al catálogo.
   */
  findUsedInParties(companyId: string): Promise<{ city: string; province: string | null; postalCode: string | null }[]>;
}
