import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores';
import type { UserRole } from '../types';

interface RoleGuardProps {
  allowed: UserRole[];
}

export default function RoleGuard({ allowed }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);

  if (!user || !allowed.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
