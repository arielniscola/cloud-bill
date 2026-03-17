import { UserRole } from '../../shared/types';

export interface User {
  id: string;
  username: string;
  email?: string | null;
  password: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  companyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>;
