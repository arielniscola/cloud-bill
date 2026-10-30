import type { UserRole } from '../types';

/**
 * El Dueño (OWNER) hereda todo lo de ADMIN: cualquier pantalla o menú que
 * habilita a ADMIN lo habilita a él. Mismo criterio que `requireRoles` en el backend.
 */
export function roleAllowed(role: UserRole | undefined, allowed: readonly string[]): boolean {
  if (!role) return false;
  if (allowed.includes(role)) return true;
  return role === 'OWNER' && allowed.includes('ADMIN');
}
