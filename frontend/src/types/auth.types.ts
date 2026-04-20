export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK' | 'FINANCES' | 'PURCHASES';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  companyId?: string | null;
  companyName?: string | null;
  enabledModules?: string[]; // ['ALL'] or ['ventas','catalogo','compras','finanzas']
  plan?: string;             // 'STARTER' | 'PRO' | 'ENTERPRISE'
  features?: string[];       // computed list of allowed feature keys
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
