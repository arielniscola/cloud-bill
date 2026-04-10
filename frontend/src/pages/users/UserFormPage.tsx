import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, ShieldCheck, ShoppingBag, DollarSign, Truck, Eye as EyeIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Input } from '../../components/ui';
import { CuitInput } from '../../components/shared';
import usersService from '../../services/users.service';
import companiesService from '../../services/companies.service';
import type { CreateUserDTO, UpdateUserDTO } from '../../services/users.service';
import type { Company } from '../../types/company.types';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuthStore } from '../../stores';

type AssignableRole = 'ADMIN' | 'SELLER' | 'FINANCES' | 'PURCHASES' | 'WAREHOUSE_CLERK';

interface RoleCard {
  value: AssignableRole;
  label: string;
  description: string;
  capabilities: string[];
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}

const ROLE_CARDS: RoleCard[] = [
  {
    value: 'ADMIN',
    label: 'Administrador',
    description: 'Acceso completo a la empresa',
    capabilities: ['Ventas y facturación', 'Compras y proveedores', 'Finanzas y cajas', 'Configuración del sistema', 'Gestión de usuarios'],
    icon: ShieldCheck,
    color: 'text-indigo-700 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-300 dark:border-indigo-600',
  },
  {
    value: 'SELLER',
    label: 'Vendedor',
    description: 'Gestión comercial y catálogo',
    capabilities: ['Facturas y presupuestos', 'Clientes y cuentas corrientes', 'Productos y stock', 'Remitos y recibos'],
    icon: ShoppingBag,
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-300 dark:border-emerald-600',
  },
  {
    value: 'FINANCES',
    label: 'Finanzas',
    description: 'Reportes y control financiero',
    capabilities: ['Reportes y libro IVA', 'Cajas y bancos', 'Cuentas corrientes (lectura)', 'Compras (lectura)'],
    icon: DollarSign,
    color: 'text-cyan-700 dark:text-cyan-300',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-300 dark:border-cyan-600',
  },
  {
    value: 'PURCHASES',
    label: 'Compras',
    description: 'Gestión de compras y proveedores',
    capabilities: ['Proveedores y cuentas', 'Órdenes de compra', 'Órdenes de pago', 'Stock (lectura)'],
    icon: Truck,
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-300 dark:border-orange-600',
  },
  {
    value: 'WAREHOUSE_CLERK',
    label: 'Depósito',
    description: 'Solo lectura del sistema',
    capabilities: ['Ver inventario y almacenes', 'Ver facturas y remitos', 'Ver órdenes', 'Sin modificaciones'],
    icon: EyeIcon,
    color: 'text-gray-600 dark:text-slate-400',
    bg: 'bg-gray-50 dark:bg-slate-700/50',
    border: 'border-gray-300 dark:border-slate-600',
  },
];

export default function UserFormPage() {
  const navigate       = useNavigate();
  const { id }         = useParams<{ id: string }>();
  const isEditing      = !!id;
  const { isSuperAdmin } = usePermissions();
  const { user: me }   = useAuthStore();

  const [form, setForm] = useState({
    name: '', username: '', email: '', password: '',
    role: 'SELLER' as AssignableRole,
    companyId: '',
  });
  const [companies, setCompanies]   = useState<Company[]>([]);
  const [showPass, setShowPass]     = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [isSaving, setIsSaving]     = useState(false);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        if (isSuperAdmin) {
          const all = await companiesService.getAll();
          setCompanies(all);
          if (!isEditing) setForm(f => ({ ...f, companyId: all[0]?.id ?? '' }));
        } else {
          // ADMIN: companyId comes from their own token (via auth)
          const companyData = localStorage.getItem('cloud-bill-company');
          let activeId = '';
          if (companyData) {
            try { activeId = JSON.parse(companyData)?.state?.activeCompanyId ?? ''; } catch { /* */ }
          }
          setForm(f => ({ ...f, companyId: activeId || me?.companyId || '' }));
        }

        if (isEditing) {
          const allUsers = await usersService.getAll();
          const user = allUsers.find(u => u.id === id);
          if (user) {
            setForm(f => ({
              ...f,
              name:      user.name,
              username:  user.username,
              email:     '',
              password:  '',
              role:      user.role,
              companyId: user.companyId ?? f.companyId,
            }));
          }
        }
      } catch {
        toast.error('Error al cargar datos');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [id, isEditing, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing && !form.password) { toast.error('La contraseña es requerida'); return; }
    setIsSaving(true);
    try {
      if (isEditing) {
        const payload: UpdateUserDTO = { name: form.name, username: form.username, role: form.role };
        if (form.email) payload.email = form.email;
        await usersService.update(id!, payload);
        toast.success('Usuario actualizado');
      } else {
        await usersService.create({
          name: form.name, username: form.username, password: form.password,
          role: form.role, companyId: form.companyId,
          ...(form.email ? { email: form.email } : {}),
        } as CreateUserDTO);
        toast.success('Usuario creado');
      }
      navigate('/users');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/users')}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isEditing ? 'Editar usuario' : 'Nuevo usuario'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Datos del usuario</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Nombre completo *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Nombre de usuario *"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value.trim() }))}
              placeholder="Sin espacios"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={isEditing ? 'Email (dejar vacío para no cambiar)' : 'Email (opcional)'}
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    minLength={6}
                    required
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Mínimo 6 caracteres</p>
              </div>
            )}
          </div>

          {/* Company selector — SUPER_ADMIN only */}
          {isSuperAdmin && companies.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Empresa *
              </label>
              <select
                value={form.companyId}
                onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">Seleccioná una empresa</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Role selector */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Rol y permisos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ROLE_CARDS.map(card => {
              const isSelected = form.role === card.value;
              const Icon = card.icon;
              return (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: card.value }))}
                  className={clsx(
                    'text-left p-4 rounded-xl border-2 transition-all',
                    isSelected
                      ? `${card.bg} ${card.border}`
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={clsx('p-1.5 rounded-lg', isSelected ? card.bg : 'bg-gray-100 dark:bg-slate-700')}>
                      <Icon className={clsx('w-4 h-4', isSelected ? card.color : 'text-gray-400 dark:text-slate-500')} />
                    </div>
                    <div>
                      <p className={clsx('text-sm font-semibold', isSelected ? card.color : 'text-gray-700 dark:text-slate-200')}>
                        {card.label}
                      </p>
                    </div>
                    {isSelected && (
                      <span className={clsx('ml-auto text-xs font-bold', card.color)}>✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-2 leading-tight">{card.description}</p>
                  <ul className="space-y-0.5">
                    {card.capabilities.map(cap => (
                      <li key={cap} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                        <span className={clsx('w-1 h-1 rounded-full flex-shrink-0', isSelected ? card.color.replace('text-', 'bg-') : 'bg-gray-300 dark:bg-slate-600')} />
                        {cap}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/users')}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </form>
    </div>
  );
}
