import { AfipConfig, CreateAfipConfigInput } from '../entities/AfipConfig';

/**
 * La configuración de ARCA (certificado + clave privada + CUIT) es POR EMPRESA.
 * `companyId` es obligatorio en ambos métodos: sin él, `findFirst` devolvía la
 * config de cualquier empresa y una empresa podía terminar emitiendo con el
 * certificado de otra.
 */
export interface IAfipConfigRepository {
  getActive(companyId: string): Promise<AfipConfig | null>;
  upsert(data: CreateAfipConfigInput, companyId: string): Promise<AfipConfig>;
}
