import { useAuthStore } from '../stores';
import type { UserRole } from '../types';
import { moduleIsEnabled } from '../types/company.types';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const role: UserRole = user?.role ?? 'WAREHOUSE_CLERK';
  const enabledModules: string[] = user?.enabledModules ?? ['ALL'];
  const isAdminLike = role === 'ADMIN' || role === 'OWNER';

  function isModuleEnabled(key: string): boolean {
    if (role === 'SUPER_ADMIN') return false; // SUPER_ADMIN sees its own nav, not module nav
    return moduleIsEnabled(enabledModules, key);
  }

  /**
   * Igual que isModuleEnabled pero sin la excepción de SUPER_ADMIN, que existe
   * sólo para el nav. Para habilitar UI dentro de una pantalla hay que preguntar
   * por el módulo de la empresa activa, no por quién está mirando.
   */
  function canUseModule(key: string): boolean {
    return moduleIsEnabled(enabledModules, key);
  }

  return {
    role,
    isSuperAdmin:     role === 'SUPER_ADMIN',
    /** ADMIN o Dueño: el Dueño hereda todo lo de ADMIN */
    isAdmin:          isAdminLike,
    /** Dueño: además aprueba las acciones protegidas */
    isOwner:          role === 'OWNER',
    isSeller:         role === 'SELLER',
    isWarehouseClerk: role === 'WAREHOUSE_CLERK',
    isFinances:       role === 'FINANCES',
    isPurchases:      role === 'PURCHASES',
    /** Can create/edit/delete sales documents — ADMIN and SELLER */
    canWrite: isAdminLike || role === 'SELLER',
    /** Can create/edit purchases and supplier data — ADMIN and PURCHASES */
    canWritePurchases: isAdminLike || role === 'PURCHASES',
    /** Can view purchases, suppliers and their accounts — ADMIN, FINANCES and PURCHASES */
    canAccessPurchases: isAdminLike || role === 'FINANCES' || role === 'PURCHASES',
    /** Can view finances section (IVA, cajas, bancos, reports) — ADMIN and FINANCES */
    canAccessFinances: isAdminLike || role === 'FINANCES',
    enabledModules,
    isModuleEnabled,
    canUseModule,
  };
}
