import api from './api';

type AssignableRole = 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK' | 'FINANCES' | 'PURCHASES';

export interface UserDTO {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: AssignableRole;
  isActive: boolean;
  companyId: string | null;
  createdAt: string;
}

export interface CreateUserDTO {
  name: string;
  username: string;
  password: string;
  role: AssignableRole;
  companyId: string;
  email?: string;
}

export interface UpdateUserDTO {
  name?: string;
  username?: string;
  email?: string;
  role?: AssignableRole;
  isActive?: boolean;
  companyId?: string;
}

const usersService = {
  async getAll(filters?: { companyId?: string }): Promise<UserDTO[]> {
    const res = await api.get<{ data: UserDTO[] }>('/users', {
      params: filters?.companyId ? { companyId: filters.companyId } : undefined,
    });
    return res.data.data;
  },
  async create(data: CreateUserDTO): Promise<UserDTO> {
    const res = await api.post<{ data: UserDTO }>('/users', data);
    return res.data.data;
  },
  async update(id: string, data: UpdateUserDTO): Promise<UserDTO> {
    const res = await api.put<{ data: UserDTO }>(`/users/${id}`, data);
    return res.data.data;
  },
  async changePassword(id: string, password: string): Promise<void> {
    await api.patch(`/users/${id}/password`, { password });
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },
  // Accesos rápidos del dashboard del usuario actual (self-service, cualquier rol)
  async getDashboardShortcuts(): Promise<string[] | null> {
    const res = await api.get<{ data: { shortcuts: string[] | null } }>('/users/me/dashboard-shortcuts');
    return res.data.data.shortcuts;
  },
  async saveDashboardShortcuts(shortcuts: string[]): Promise<string[]> {
    const res = await api.put<{ data: { shortcuts: string[] } }>('/users/me/dashboard-shortcuts', { shortcuts });
    return res.data.data.shortcuts;
  },
};

export default usersService;
