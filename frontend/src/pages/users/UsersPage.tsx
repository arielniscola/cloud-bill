import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, KeyRound, Eye, EyeOff, UserX, ShieldCheck, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Input, Modal } from '../../components/ui';
import { ConfirmDialog } from '../../components/shared';
import usersService from '../../services/users.service';
import type { UserDTO } from '../../services/users.service';
import { useAuthStore } from '../../stores';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/formatters';

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN:     'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-900/30 dark:border-purple-800',
  ADMIN:           'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-800',
  SELLER:          'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800',
  FINANCES:        'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-900/30 dark:border-cyan-800',
  PURCHASES:       'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-900/30 dark:border-orange-800',
  WAREHOUSE_CLERK: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600',
};
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Administrador', SELLER: 'Vendedor',
  FINANCES: 'Finanzas', PURCHASES: 'Compras', WAREHOUSE_CLERK: 'Depósito',
};

// ── Change password modal ──────────────────────────────────────────────────────
function ChangePasswordModal({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (user) { setPassword(''); setShowPass(false); } }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await usersService.changePassword(user.id, password);
      toast.success('Contraseña actualizada');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al cambiar contraseña');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={!!user} onClose={onClose} title={`Cambiar contraseña — ${user?.name ?? ''}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nueva contraseña *</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
              value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Mínimo 6 caracteres</p>
        </div>
        <div className="flex gap-2 pt-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving}>Cambiar contraseña</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const navigate          = useNavigate();
  const { user: me }      = useAuthStore();
  const { isSuperAdmin, isAdmin } = usePermissions();
  const canManage         = isSuperAdmin || isAdmin;

  const [users, setUsers]       = useState<UserDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [passUser, setPassUser] = useState<UserDTO | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState<string | null>(null);

  const load = async () => {
    try {
      setUsers(await usersService.getAll());
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await usersService.delete(deleteId);
      toast.success('Usuario eliminado');
      setDeleteId(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleActive = async (user: UserDTO) => {
    setIsToggling(user.id);
    try {
      await usersService.update(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? 'Usuario desactivado' : 'Usuario activado');
      load();
    } catch {
      toast.error('Error al cambiar estado');
    } finally {
      setIsToggling(null);
    }
  };

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Usuarios</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {users.length} usuario{users.length !== 1 ? 's' : ''}
            {!isSuperAdmin && ' en tu empresa'}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => navigate('/users/new')}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo usuario
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o usuario…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
        />
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-40" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400 dark:text-slate-500">
            {search ? 'No se encontraron usuarios' : 'No hay usuarios todavía'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {filtered.map(user => {
              const isMe = user.id === me?.id;
              return (
                <div key={user.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 dark:hover:bg-slate-700/20 transition-colors">
                  {/* Avatar */}
                  <div className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
                    user.isActive
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                  )}>
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('text-sm font-medium', user.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500 line-through')}>
                        {user.name}
                      </span>
                      {isMe && (
                        <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded-full">
                          Vos
                        </span>
                      )}
                      {!user.isActive && (
                        <span className="text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-500 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded-full">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">
                      @{user.username}
                    </p>
                  </div>

                  {/* Role badge */}
                  <span className={clsx('hidden sm:inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border', ROLE_BADGE[user.role] ?? ROLE_BADGE.WAREHOUSE_CLERK)}>
                    {ROLE_LABEL[user.role] ?? user.role}
                  </span>

                  {/* Date */}
                  <span className="hidden lg:block text-xs text-gray-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                    {formatDate(user.createdAt)}
                  </span>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/users/${user.id}/edit`)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setPassUser(user)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                        title="Cambiar contraseña"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      {!isMe && (
                        <>
                          <button
                            onClick={() => toggleActive(user)}
                            disabled={isToggling === user.id}
                            className={clsx(
                              'p-1.5 rounded-lg transition-colors',
                              user.isActive
                                ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            )}
                            title={user.isActive ? 'Desactivar' : 'Activar'}
                          >
                            {user.isActive ? <UserX className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setDeleteId(user.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ChangePasswordModal user={passUser} onClose={() => setPassUser(null)} />
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar usuario"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
