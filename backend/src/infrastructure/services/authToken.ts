import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload, UserRole } from '../../shared/types';

/**
 * Huella del hash de la contraseña. Va dentro del token (`pv`) y se compara en
 * cada request contra la del usuario: al cambiar la contraseña la huella cambia
 * y todos los tokens emitidos antes dejan de servir, sin columnas nuevas ni
 * lista de revocación.
 */
export function passwordVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export function signAuthToken(user: {
  id: string;
  username: string;
  role: UserRole | string;
  companyId?: string | null;
  password: string;
}): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as UserRole,
    ...(user.companyId ? { companyId: user.companyId } : {}),
    pv: passwordVersion(user.password),
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}
