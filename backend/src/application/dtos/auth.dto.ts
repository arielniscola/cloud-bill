import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3, 'Mínimo 3 caracteres'),
  email:    z.string().email('Invalid email format').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  role:     z.enum(['SUPER_ADMIN', 'ADMIN', 'SELLER', 'WAREHOUSE_CLERK']).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO    = z.infer<typeof loginSchema>;
