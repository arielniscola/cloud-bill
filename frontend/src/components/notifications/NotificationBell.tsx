import { useState, useRef, useEffect } from 'react';
import { Bell, Package, FileText, CreditCard, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type NotificationType } from '../../hooks/useNotifications';
import { useNotificationsStore } from '../../stores';

const typeIcon: Record<NotificationType, React.ElementType> = {
  'low-stock': Package,
  invoice: FileText,
  account: CreditCard,
};

const typeColor: Record<NotificationType, string> = {
  'low-stock': 'text-amber-400',
  invoice: 'text-blue-400',
  account: 'text-red-400',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const { notifications, loading } = useNotifications();
  const { isRead, markAsRead, markAllAsRead } = useNotificationsStore();

  const unreadCount = notifications.filter((n) => !isRead(n.id)).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleNotificationClick(id: string, href: string) {
    markAsRead(id);
    setOpen(false);
    navigate(href);
  }

  function handleMarkAllRead() {
    markAllAsRead(notifications.map((n) => n.id));
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
          style={{ maxHeight: '420px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <span className="text-sm font-semibold text-white">Notificaciones</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Check className="w-3 h-3" />
                Marcar todo leído
              </button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <Bell className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const Icon = typeIcon[n.type];
                  const read = isRead(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleNotificationClick(n.id, n.href)}
                        className={clsx(
                          'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-700/60 transition-colors border-b border-slate-700/40 last:border-0',
                          !read && 'bg-slate-700/20'
                        )}
                      >
                        <Icon className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', typeColor[n.type])} />
                        <div className="min-w-0 flex-1">
                          <p className={clsx('text-xs font-semibold', read ? 'text-slate-400' : 'text-white')}>
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{n.message}</p>
                        </div>
                        {!read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
