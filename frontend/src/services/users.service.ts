import api from './api';

export interface UserDTO {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK';
  isActive: boolean;
  companyId: string | null;
  createdAt: string;
}

export interface CreateUserDTO {
  name: string;
  username: string;
  password: string;
  role: 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK';
  companyId: string;
  email?: string;
}

export interface UpdateUserDTO {
  name?: string;
  username?: string;
  email?: string;
  role?: 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK';
  isActive?: boolean;
}

const usersService = {
  async getAll(): Promise<UserDTO[]> {
    const res = await api.get<{ data: UserDTO[] }>('/users');
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
};

export default usersService;
