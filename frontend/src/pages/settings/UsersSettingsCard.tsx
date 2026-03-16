import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, KeyRound, Eye, EyeOff, ShieldCheck, ShieldAlert, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Input, Select, Modal } from '../../components/ui';
import { ConfirmDialog } from '../../components/shared';
import usersService from '../../services/users.service';
import type { UserDTO, CreateUserDTO, UpdateUserDTO } from '../../services/users.service';
import { useAuthStore } from '../../stores';
import { formatDate } from '../../utils/formatters';

const ROLE_OPTIONS = [
  { value: 'ADMIN',           label: 'Administrador' },
  { value: 'SELLER',          label: 'Vendedor' },
  { value: 'WAREHOUSE_CLERK', label: 'Depósito (solo lectura)' },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN:           'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-800',
  SELLER:          'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800',
  WAREHOUSE_CLERK: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600',
};
const ROLE_LABEL: Record<string, string> = {
  ADMIN:           'Administrador',
  SELLER:          'Vendedor',
  WAREHOUSE_CLERK: 'Depósito',
};

// ── Create / Edit modal ───────────────────────────────────────────────────────
interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editing: UserDTO | null;
}

function UserFormModal({ isOpen, onClose, onSave, editing }: UserFormModalProps) {
  const [form, setForm]         = useState({ name: '', email: '', password: '', role: 'SELLER' as CreateUserDTO['role'] });
  const [showPass, setShowPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(editing
        ? { name: editing.name, email: editing.email, password: '', role: editing.role }
        : { name: '', email: '', password: '', role: 'SELLER' }
      );
      setShowPass(false);
    }
  }, [isOpen, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editing) {
        const payload: UpdateUserDTO = { name: form.name, email: form.email, role: form.role };
        await usersService.update(editing.id, payload);
        toast.success('Usuario actualizado');
      } else {
        if (!form.password) { toast.error('La contraseña es requerida'); return; }
        await usersService.create(form as CreateUserDTO);
        toast.success('Usuario creado');
      }
      onSave();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Editar usuario' : 'Nuevo usuario'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <Input
          label="Email *"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
        {!editing && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Contraseña *
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        <Select
          label="Rol *"
          options={ROLE_OPTIONS}
          value={form.role}
          onChange={(v) => setForm((f) => ({ ...f, role: v as CreateUserDTO['role'] }))}
        />
        <div className="flex gap-2 pt-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving}>
            {editing ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Change password modal ────────────────────────────────────────────────────
interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserDTO | null;
}

function ChangePasswordModal({ isOpen, onClose, user }: ChangePasswordModalProps) {
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [isSaving, setIsSaving]   = useState(false);

  useEffect(() => { if (isOpen) { setPassword(''); setShowPass(false); } }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await usersService.changePassword(user.id, password);
      toast.success('Contraseña actualizada');
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al cambiar contraseña');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Cambiar contraseña — ${user?.name ?? ''}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nueva contraseña *</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
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

// ── Main card ────────────────────────────────────────────────────────────────
export default function UsersSettingsCard() {
  const { user: me } = useAuthStore();
  const [users, setUsers]             = useState<UserDTO[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null);
  const [passUser, setPassUser]       = useState<UserDTO | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [isToggling, setIsToggling]   = useState<string | null>(null);

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
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al eliminar');
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

  return (
    <>
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Usuarios</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''} registrados</p>
          </div>
          <Button size="sm" onClick={() => { setEditingUser(null); setShowForm(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nuevo usuario
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-32" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-48" />
                </div>
                <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {users.map((user) => {
              const isMe = user.id === me?.id;
              return (
                <div key={user.id} className="flex items-center gap-4 px-5 py-3.5">
                  {/* Avatar */}
                  <div className={clsx(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
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
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{user.email}</p>
                  </div>

                  {/* Role badge */}
                  <span className={clsx('hidden sm:inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border', ROLE_BADGE[user.role])}>
                    {ROLE_LABEL[user.role]}
                  </span>

                  {/* Created */}
                  <span className="hidden lg:block text-xs text-gray-400 dark:text-slate-500 tabular-nums">
                    {formatDate(user.createdAt)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditingUser(user); setShowForm(true); }}
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
                        {user.isActive
                          ? <UserX className="w-3.5 h-3.5" />
                          : <ShieldCheck className="w-3.5 h-3.5" />
                        }
                      </button>
                    )}
                    {!isMe && (
                      <button
                        onClick={() => setDeleteId(user.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role legend */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">Roles disponibles</h4>
        <div className="space-y-3">
          {[
            { role: 'ADMIN',           Icon: ShieldCheck, desc: 'Acceso total al sistema: ventas, compras, finanzas, configuración y usuarios.' },
            { role: 'SELLER',          Icon: ShieldAlert, desc: 'Puede gestionar ventas, presupuestos, clientes, productos y stock. Sin acceso a compras ni finanzas.' },
            { role: 'WAREHOUSE_CLERK', Icon: ShieldAlert, desc: 'Solo lectura: ve inventario, órdenes y facturas, pero no puede crear ni modificar nada.' },
          ].map(({ role, Icon, desc }) => (
            <div key={role} className="flex items-start gap-3">
              <span className={clsx('inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border mt-0.5 shrink-0', ROLE_BADGE[role])}>
                {ROLE_LABEL[role]}
              </span>
              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <UserFormModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSave={load}
        editing={editingUser}
      />
      <ChangePasswordModal
        isOpen={!!passUser}
        onClose={() => setPassUser(null)}
        user={passUser}
      />
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar usuario"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </>
  );
}
