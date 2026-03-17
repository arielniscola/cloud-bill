export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  companyId?: string | null;
  enabledModules?: string[]; // ['ALL'] or ['ventas','catalogo','compras','finanzas']
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
