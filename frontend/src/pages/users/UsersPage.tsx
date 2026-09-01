import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, KeyRound, Eye, EyeOff, UserX, ShieldCheck, Search,
  Building2, X, MoreHorizontal, ChevronDown, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Modal, Select } from '../../components/ui';
import { ConfirmDialog } from '../../components/shared';
import usersService from '../../services/users.service';
import companiesService from '../../services/companies.service';
import type { UserDTO } from '../../services/users.service';
import type { Company } from '../../types/company.types';
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

const ROLE_OPTIONS = [
  { value: '', label: 'Todos los roles' },
  ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
];
const STATUS_OPTIONS = [
  { value: '',         label: 'Todos' },
  { value: 'active',   label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
];

/** Con más grupos que esto el listado arranca colapsado. */
const COLLAPSE_THRESHOLD = 8;
const NO_COMPANY = '__none';

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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
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
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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

// ── Menú de acciones destructivas ──────────────────────────────────────────────
function RowMenu({
  user, isToggling, onToggleActive, onDelete,
}: {
  user: UserDTO;
  isToggling: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Más acciones"
        aria-expanded={open}
        className={clsx(
          'w-7 h-7 rounded-md flex items-center justify-center border transition-colors',
          open
            ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200'
            : 'border-transparent text-gray-400 dark:text-slate-500 group-hover:border-gray-200 dark:group-hover:border-slate-600 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:text-gray-700 dark:group-hover:text-slate-200'
        )}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-52 p-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl">
          <button
            onClick={() => { setOpen(false); onToggleActive(); }}
            disabled={isToggling}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-sm text-left text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50 transition-colors"
          >
            {user.isActive
              ? <><UserX className="w-3.5 h-3.5" />Desactivar</>
              : <><ShieldCheck className="w-3.5 h-3.5" />Activar</>}
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-sm text-left text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Fila de usuario ────────────────────────────────────────────────────────────
function UserRow({
  user, isMe, canManage, isToggling, onEdit, onChangePassword, onToggleActive, onDelete,
}: {
  user: UserDTO;
  isMe: boolean;
  canManage: boolean;
  isToggling: boolean;
  onEdit: () => void;
  onChangePassword: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50/70 dark:hover:bg-slate-700/20 transition-colors">
      <div className={clsx(
        'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold',
        user.isActive
          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
      )}>
        {user.name.slice(0, 2).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx(
            'text-sm font-semibold truncate',
            user.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'
          )}>
            {user.name}
          </span>
          {isMe && (
            <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded-full">
              Vos
            </span>
          )}
          {!user.isActive && (
            <span className="text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded-full">
              Inactivo
            </span>
          )}
        </div>
        <p className={clsx(
          'text-xs truncate mt-0.5',
          user.isActive ? 'text-gray-400 dark:text-slate-500' : 'text-gray-300 dark:text-slate-600'
        )}>
          @{user.username}
          {user.email && <span> · {user.email}</span>}
        </p>
      </div>

      <span className={clsx(
        'hidden sm:inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0',
        ROLE_BADGE[user.role] ?? ROLE_BADGE.WAREHOUSE_CLERK
      )}>
        {ROLE_LABEL[user.role] ?? user.role}
      </span>

      <span className={clsx(
        'hidden lg:block text-xs tabular-nums flex-shrink-0 w-[78px] text-right',
        user.isActive ? 'text-gray-400 dark:text-slate-500' : 'text-gray-300 dark:text-slate-600'
      )}>
        {formatDate(user.createdAt)}
      </span>

      {canManage && (
        // Ancho fijo: las etiquetas aparecen al pasar el puntero sin mover el resto de la fila.
        <div className="flex items-center justify-end gap-1.5 flex-shrink-0 w-[232px]">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-transparent text-gray-400 dark:text-slate-500 group-hover:border-gray-200 dark:group-hover:border-slate-600 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:text-gray-700 dark:group-hover:text-slate-200 transition-colors"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden group-hover:inline text-xs font-medium">Editar</span>
          </button>
          <button
            onClick={onChangePassword}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-transparent text-gray-400 dark:text-slate-500 group-hover:border-gray-200 dark:group-hover:border-slate-600 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:text-gray-700 dark:group-hover:text-slate-200 transition-colors"
            title="Cambiar contraseña"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden group-hover:inline text-xs font-medium">Contraseña</span>
          </button>
          {!isMe && (
            <RowMenu
              user={user}
              isToggling={isToggling}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const navigate          = useNavigate();
  const { user: me }      = useAuthStore();
  const { isSuperAdmin } = usePermissions();
  const canManage        = isSuperAdmin;

  const [users, setUsers]       = useState<UserDTO[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [roleFilter, setRoleFilter]       = useState<string>('');
  const [statusFilter, setStatusFilter]   = useState<string>('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [passUser, setPassUser] = useState<UserDTO | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      setUsers(await usersService.getAll(companyFilter ? { companyId: companyFilter } : undefined));
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter]);

  // Load companies for filter dropdown (SUPER_ADMIN only)
  useEffect(() => {
    if (!isSuperAdmin) return;
    companiesService.getAll()
      .then(setCompanies)
      .catch(() => {});
  }, [isSuperAdmin]);

  const companyMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.id, c.name);
    return m;
  }, [companies]);

  const companyOptions = useMemo(() => [
    { value: '', label: 'Todas las empresas' },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ], [companies]);

  const stats = useMemo(() => ({
    total:  users.length,
    active: users.filter(u => u.isActive).length,
    admins: users.filter(u => u.role === 'ADMIN').length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  // Agrupado por empresa: solo tiene sentido para el SUPER_ADMIN, que ve varias.
  const groups = useMemo(() => {
    if (!isSuperAdmin) return null;
    const map = new Map<string, UserDTO[]>();
    for (const u of filtered) {
      const key = u.companyId ?? NO_COMPANY;
      const list = map.get(key);
      if (list) list.push(u); else map.set(key, [u]);
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        name: key === NO_COMPANY ? 'Sin empresa' : companyMap.get(key) ?? 'Empresa desconocida',
        users: list,
      }))
      .sort((a, b) => {
        if (a.key === NO_COMPANY) return 1;
        if (b.key === NO_COMPANY) return -1;
        return a.name.localeCompare(b.name, 'es');
      });
  }, [filtered, isSuperAdmin, companyMap]);

  // Con muchos grupos el listado arranca colapsado. Se recalcula solo cuando
  // cambia el conjunto de empresas cargadas, no al filtrar o buscar.
  const loadedCompanyKeys = useMemo(
    () => [...new Set(users.map(u => u.companyId ?? NO_COMPANY))].sort().join('|'),
    [users]
  );
  useEffect(() => {
    if (!isSuperAdmin) return;
    const keys = loadedCompanyKeys ? loadedCompanyKeys.split('|') : [];
    setCollapsed(keys.length > COLLAPSE_THRESHOLD ? new Set(keys) : new Set());
  }, [loadedCompanyKeys, isSuperAdmin]);

  // Buscando, nada queda escondido detrás de un grupo cerrado.
  const forceExpand = search.trim() !== '';

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await usersService.delete(deleteId);
      toast.success('Usuario eliminado');
      setDeleteId(null);
      load();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
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

  const isFiltering = search.trim() !== '' || !!roleFilter || !!statusFilter;
  const clearFilters = () => { setSearch(''); setRoleFilter(''); setStatusFilter(''); };

  const rowProps = (user: UserDTO) => ({
    user,
    isMe: user.id === me?.id,
    canManage,
    isToggling: isToggling === user.id,
    onEdit: () => navigate(`/users/${user.id}/edit`),
    onChangePassword: () => setPassUser(user),
    onToggleActive: () => toggleActive(user),
    onDelete: () => setDeleteId(user.id),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Usuarios</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {users.length} usuario{users.length !== 1 ? 's' : ''}
            {isSuperAdmin && groups
              ? ` en ${groups.length} empresa${groups.length !== 1 ? 's' : ''}`
              : ' en tu empresa'}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => navigate('/users/new')} className="flex-shrink-0">
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo usuario
          </Button>
        )}
      </div>

      {/* Resumen */}
      {isSuperAdmin && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3">
            <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">Usuarios</p>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3">
            <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">{stats.active}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">Activos</p>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3">
            <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">{stats.admins}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">Administradores</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, usuario o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 shadow-sm text-sm py-2 pl-9 pr-9 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isSuperAdmin && (
          <Select
            className="sm:w-56 flex-shrink-0"
            options={companyOptions}
            value={companyFilter}
            onChange={setCompanyFilter}
          />
        )}
        <Select
          className="sm:w-44 flex-shrink-0"
          options={ROLE_OPTIONS}
          value={roleFilter}
          onChange={setRoleFilter}
        />
        <Select
          className="sm:w-36 flex-shrink-0"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-40" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-gray-400 dark:text-slate-500">
              {isFiltering ? 'Ningún usuario coincide con los filtros' : 'No hay usuarios todavía'}
            </p>
            {isFiltering && (
              <Button variant="secondary" className="mt-4" onClick={clearFilters}>Limpiar filtros</Button>
            )}
          </div>
        ) : groups ? (
          <div>
            {groups.map(group => {
              const isCollapsed = !forceExpand && collapsed.has(group.key);
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-2.5 px-5 py-2 bg-gray-50 dark:bg-slate-900/40 border-y border-gray-100 dark:border-slate-700/60 first:border-t-0">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={!isCollapsed}
                      className="flex items-center gap-2.5 min-w-0 text-left group/head"
                      title={isCollapsed ? 'Mostrar usuarios' : 'Ocultar usuarios'}
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />}
                      <div className="w-[22px] h-[22px] rounded-md bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <span className="text-[13px] font-semibold text-gray-700 dark:text-slate-200 truncate group-hover/head:text-gray-900 dark:group-hover/head:text-white transition-colors">
                        {group.name}
                      </span>
                      <span className="text-[11.5px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                        {group.users.length} usuario{group.users.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    <div className="flex-1" />
                    {group.key !== NO_COMPANY && (
                      <Link
                        to={`/companies/${group.key}`}
                        className="text-[11.5px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0"
                      >
                        Ver empresa
                      </Link>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
                      {group.users.map(user => <UserRow key={user.id} {...rowProps(user)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
            {filtered.map(user => <UserRow key={user.id} {...rowProps(user)} />)}
          </div>
        )}

        {!isLoading && isFiltering && filtered.length > 0 && (
          <div className="px-5 py-2.5 bg-gray-50/60 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {filtered.length} de {users.length} usuarios
            </span>
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Limpiar filtros
            </button>
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
