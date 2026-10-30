import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { approvalsService } from '../../services/approvals.service';
import { useApprovalStore } from '../../stores/approval.store';
import { usePermissions } from '../../hooks/usePermissions';

const POLL_MS = 60_000;

interface ApprovalsBellProps {
  triggerClassName?: string;
  iconClassName?: string;
}

/**
 * Acceso a /approvals con contador. Al Dueño le cuenta lo que tiene que
 * resolver; al resto, sus propios pedidos pendientes (y solo aparece si hay).
 */
export default function ApprovalsBell({ triggerClassName, iconClassName }: ApprovalsBellProps) {
  const navigate = useNavigate();
  const { isOwner, isSuperAdmin } = usePermissions();
  const version = useApprovalStore((s) => s.version);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (isSuperAdmin) return;
    let alive = true;
    const load = () => {
      approvalsService.pendingCount().then((c) => { if (alive) setCount(c); }).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [isSuperAdmin, version]);

  if (isSuperAdmin || (!isOwner && count === 0)) return null;

  const title = isOwner ? `Aprobaciones pendientes: ${count}` : `Tus solicitudes pendientes: ${count}`;

  return (
    <button
      type="button"
      onClick={() => navigate('/approvals')}
      title={title}
      aria-label={title}
      className={triggerClassName ?? 'relative p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-white transition-colors'}
    >
      <span className="relative inline-flex">
        <ShieldCheck className={iconClassName ?? 'w-4 h-4'} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </span>
    </button>
  );
}
