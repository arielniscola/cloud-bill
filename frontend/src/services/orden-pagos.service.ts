import api from './api';
import type { OrdenPago, CreateOrdenPagoDTO, OrdenPagoFilters, SupplierAccount } from '../types/ordenPago.types';
import type { PaginatedResponse } from '../types/api.types';

const ordenPagosService = {
  getAll(filters?: OrdenPagoFilters): Promise<PaginatedResponse<OrdenPago>> {
    return api.get('/orden-pagos', { params: filters }).then((r) => r.data);
  },

  getById(id: string): Promise<OrdenPago> {
    return api.get(`/orden-pagos/${id}`).then((r) => r.data.data);
  },

  create(data: CreateOrdenPagoDTO): Promise<OrdenPago> {
    return api.post('/orden-pagos', data).then((r) => r.data.data);
  },

  cancel(id: string): Promise<OrdenPago> {
    return api.delete(`/orden-pagos/${id}`).then((r) => r.data.data);
  },

  getSupplierAccount(supplierId: string, params?: { page?: number; limit?: number }): Promise<SupplierAccount> {
    return api.get(`/orden-pagos/supplier/${supplierId}/account`, { params }).then((r) => r.data.data);
  },
};

export default ordenPagosService;
