import { useAuthStore } from '../stores';
import type { UserRole } from '../types';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const role: UserRole = user?.role ?? 'WAREHOUSE_CLERK';
  const enabledModules: string[] = user?.enabledModules ?? ['ALL'];

  function isModuleEnabled(key: string): boolean {
    if (role === 'SUPER_ADMIN') return false; // SUPER_ADMIN sees its own nav, not module nav
    if (enabledModules.includes('ALL')) return true;
    return enabledModules.includes(key);
  }

  return {
    role,
    isSuperAdmin:    role === 'SUPER_ADMIN',
    isAdmin:         role === 'ADMIN',
    isSeller:        role === 'SELLER',
    isWarehouseClerk: role === 'WAREHOUSE_CLERK',
    /** Can create, edit, delete — true for ADMIN and SELLER */
    canWrite: role === 'ADMIN' || role === 'SELLER',
    /** Can access purchases & suppliers section */
    canAccessPurchases: role === 'ADMIN',
    /** Can access finances section (IVA, cash registers management, reports, settings, activity) */
    canAccessFinances: role === 'ADMIN',
    enabledModules,
    isModuleEnabled,
  };
}
