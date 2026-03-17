import { OrdenPedido, OrdenPedidoWithItems, CreateOrdenPedidoInput, UpdateOrdenPedidoInput } from '../entities/OrdenPedido';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface OrdenPedidoFilters {
  customerId?: string;
  status?: string;
  currency?: string;
  companyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IOrdenPedidoRepository {
  findById(id: string): Promise<OrdenPedidoWithItems | null>;
  findAll(pagination?: PaginationParams, filters?: OrdenPedidoFilters): Promise<PaginatedResult<OrdenPedido>>;
  create(data: CreateOrdenPedidoInput): Promise<OrdenPedidoWithItems>;
  update(id: string, data: UpdateOrdenPedidoInput): Promise<OrdenPedidoWithItems>;
  delete(id: string): Promise<void>;
  getNextNumber(): Promise<string>;
}
