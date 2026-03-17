import api from './api';
import type { Company, CreateCompanyDTO, UpdateCompanyDTO } from '../types/company.types';

const companiesService = {
  async getAll(): Promise<Company[]> {
    const res = await api.get<{ data: Company[] }>('/companies');
    return res.data.data;
  },
  async getById(id: string): Promise<Company> {
    const res = await api.get<{ data: Company }>(`/companies/${id}`);
    return res.data.data;
  },
  async create(data: CreateCompanyDTO): Promise<Company> {
    const res = await api.post<{ data: Company }>('/companies', data);
    return res.data.data;
  },
  async update(id: string, data: UpdateCompanyDTO): Promise<Company> {
    const res = await api.put<{ data: Company }>(`/companies/${id}`, data);
    return res.data.data;
  },
  async updateModules(id: string, enabledModules: string[]): Promise<Company> {
    const res = await api.patch<{ data: Company }>(`/companies/${id}/modules`, { enabledModules });
    return res.data.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/companies/${id}`);
  },
};

export default companiesService;
