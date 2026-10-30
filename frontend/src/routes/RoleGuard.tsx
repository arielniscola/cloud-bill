import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores';
import type { UserRole } from '../types';
import { roleAllowed } from '../utils/roles';

interface RoleGuardProps {
  allowed: UserRole[];
}

export default function RoleGuard({ allowed }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);

  if (!user || !roleAllowed(user.role, allowed)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
