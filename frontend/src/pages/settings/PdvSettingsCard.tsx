import { useState, useEffect } from 'react';
import { Plus, Pencil, Monitor, UserPlus, UserMinus, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Card, Button, Input, Modal } from '../../components/ui';
import pdvService from '../../services/pdv.service';
import usersService from '../../services/users.service';
import type { PuntoDeVenta } from '../../types/pdv.types';
import type { UserDTO } from '../../services/users.service';
import { useAuthStore } from '../../stores';

// ── PdV Form Modal ────────────────────────────────────────────────────────────
interface PdvFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editing: PuntoDeVenta | null;
}

function PdvFormModal({ isOpen, onClose, onSave, editing }: PdvFormModalProps) {
  const [form, setForm] = useState({ number: '', name: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(editing
        ? { number: String(editing.number), name: editing.name }
        : { number: '', name: '' }
      );
    }
  }, [isOpen, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(form.number, 10);
    if (!num || num < 1 || num > 9999) {
      toast.error('El número debe estar entre 1 y 9999');
      return;
    }
    if (!form.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await pdvService.update(editing.id, { name: form.name.trim() });
        toast.success('Punto de venta actualizado');
      } else {
        await pdvService.create({ number: num, name: form.name.trim() });
        toast.success('Punto de venta creado');
      }
      onSave();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Editar Punto de Venta' : 'Nuevo Punto de Venta'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Número AFIP (1–9999)"
          type="number"
          min={1}
          max={9999}
          value={form.number}
          onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
          disabled={!!editing}
          required
        />
        <Input
          label="Nombre descriptivo"
          placeholder="ej. Caja Principal, Sucursal Norte"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving}>
            {editing ? 'Guardar cambios' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Assign User Modal ─────────────────────────────────────────────────────────
interface AssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  pdv: PuntoDeVenta;
  allUsers: UserDTO[];
}

function AssignUserModal({ isOpen, onClose, onSave, pdv, allUsers }: AssignModalProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const assignedIds = new Set((pdv.assignedUsers ?? []).map(u => u.id));
  const available = allUsers.filter(u => !assignedIds.has(u.id) && (u.role as string) !== 'SUPER_ADMIN');

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    try {
      await pdvService.assignUser(pdv.id, selectedUserId);
      toast.success('Usuario asignado');
      onSave();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al asignar usuario');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Asignar usuario a ${pdv.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Cada usuario asignado funciona como una terminal independiente en este punto de venta.
        </p>
        {available.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Todos los usuarios ya están asignados.</p>
        ) : (
          <select
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
          >
            <option value="">Seleccionar usuario...</option>
            {available.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAssign} disabled={!selectedUserId} isLoading={isSaving}>
            Asignar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Card ─────────────────────────────────────────────────────────────────
export default function PdvSettingsCard() {
  const { user } = useAuthStore();
  const [pdvs, setPdvs] = useState<PuntoDeVenta[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PuntoDeVenta | null>(null);
  const [assignModal, setAssignModal] = useState<PuntoDeVenta | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [pdvList, userList] = await Promise.all([
        pdvService.getAll(),
        usersService.getAll(),
      ]);
      setPdvs(pdvList);
      setUsers(userList);
    } catch {
      toast.error('Error al cargar puntos de venta');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleActive = async (pdv: PuntoDeVenta) => {
    setTogglingId(pdv.id);
    try {
      await pdvService.update(pdv.id, { isActive: !pdv.isActive });
      toast.success(pdv.isActive ? 'Punto de venta desactivado' : 'Punto de venta activado');
      load();
    } catch {
      toast.error('Error al cambiar estado');
    } finally {
      setTogglingId(null);
    }
  };

  const handleUnassign = async (pdvId: string, userId: string) => {
    try {
      await pdvService.unassignUser(pdvId, userId);
      toast.success('Usuario desvinculado');
      load();
    } catch {
      toast.error('Error al desvincular usuario');
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-indigo-500" />
            Terminales / Puntos de Venta
          </h3>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            Cada punto de venta representa una terminal ante AFIP. Asigná usuarios como operadores.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setModalOpen(true); }}
        >
          <Plus className="w-4 h-4 mr-1" />
          Nuevo PdV
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Cargando...</div>
      ) : pdvs.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-slate-500 italic text-center py-6">
          No hay puntos de venta configurados aún.
        </div>
      ) : (
        <div className="space-y-3">
          {pdvs.map(pdv => (
            <div
              key={pdv.id}
              className={clsx(
                'border rounded-xl p-4 transition-all',
                pdv.isActive
                  ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  : 'border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800/50 opacity-70'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                      PdV {String(pdv.number).padStart(4, '0')}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{pdv.name}</span>
                    {!pdv.isActive && (
                      <span className="text-xs text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        Inactivo
                      </span>
                    )}
                  </div>

                  {/* Assigned users */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(pdv.assignedUsers ?? []).length === 0 ? (
                      <span className="text-xs text-gray-400 dark:text-slate-500 italic">Sin terminales asignadas</span>
                    ) : (
                      (pdv.assignedUsers ?? []).map(u => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5"
                        >
                          {u.name}
                          <button
                            onClick={() => handleUnassign(pdv.id, u.id)}
                            className="ml-0.5 text-emerald-400 hover:text-red-500 transition-colors"
                            title="Desvincular"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setAssignModal(pdv)}
                    className="p-1.5 text-gray-400 hover:text-indigo-500 transition-colors"
                    title="Asignar usuario"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setEditing(pdv); setModalOpen(true); }}
                    className="p-1.5 text-gray-400 hover:text-indigo-500 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(pdv)}
                    disabled={togglingId === pdv.id}
                    className={clsx(
                      'p-1.5 transition-colors',
                      pdv.isActive
                        ? 'text-emerald-500 hover:text-gray-400'
                        : 'text-gray-300 hover:text-emerald-500'
                    )}
                    title={pdv.isActive ? 'Desactivar' : 'Activar'}
                  >
                    {pdv.isActive
                      ? <ToggleRight className="w-5 h-5" />
                      : <ToggleLeft className="w-5 h-5" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PdvFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={load}
        editing={editing}
      />

      {assignModal && (
        <AssignUserModal
          isOpen={!!assignModal}
          onClose={() => setAssignModal(null)}
          onSave={load}
          pdv={assignModal}
          allUsers={users}
        />
      )}
    </Card>
  );
}
