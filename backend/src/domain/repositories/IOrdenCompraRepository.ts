import { OrdenCompra, OrdenCompraWithItems, CreateOrdenCompraInput, UpdateOrdenCompraInput } from '../entities/OrdenCompra';
import { PaginatedResult } from '../../shared/types';

export interface OrdenCompraFilters {
  supplierId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IOrdenCompraRepository {
  findAll(pagination?: { page: number; limit: number }, filters?: OrdenCompraFilters): Promise<PaginatedResult<OrdenCompra>>;
  findById(id: string): Promise<OrdenCompraWithItems | null>;
  create(data: CreateOrdenCompraInput): Promise<OrdenCompraWithItems>;
  update(id: string, data: UpdateOrdenCompraInput): Promise<OrdenCompraWithItems>;
  delete(id: string): Promise<void>;
  getNextNumber(): Promise<string>;
}
