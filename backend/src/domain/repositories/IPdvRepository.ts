import { PuntoDeVenta, CreatePdvInput, UpdatePdvInput } from '../entities/PuntoDeVenta';

export interface IPdvRepository {
  findAll(companyId: string): Promise<PuntoDeVenta[]>;
  findById(id: string): Promise<PuntoDeVenta | null>;
  findByNumber(number: number, companyId: string): Promise<PuntoDeVenta | null>;
  create(input: CreatePdvInput): Promise<PuntoDeVenta>;
  update(id: string, input: UpdatePdvInput): Promise<PuntoDeVenta>;
  /** Assign a PdV to a user (null removes the assignment) */
  assignToUser(userId: string, pdvId: string | null): Promise<void>;
  /** Get the PdV assigned to a user (null if none) */
  getForUser(userId: string): Promise<PuntoDeVenta | null>;
}
