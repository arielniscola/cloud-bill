import { useAuthStore } from '../stores';
import type { UserRole } from '../types';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const role: UserRole = user?.role ?? 'WAREHOUSE_CLERK';

  return {
    role,
    isAdmin: role === 'ADMIN',
    isSeller: role === 'SELLER',
    isWarehouseClerk: role === 'WAREHOUSE_CLERK',
    /** Can create, edit, delete — true for ADMIN and SELLER */
    canWrite: role === 'ADMIN' || role === 'SELLER',
    /** Can access purchases & suppliers section */
    canAccessPurchases: role === 'ADMIN',
    /** Can access finances section (IVA, cash registers management, reports, settings, activity) */
    canAccessFinances: role === 'ADMIN',
  };
}
