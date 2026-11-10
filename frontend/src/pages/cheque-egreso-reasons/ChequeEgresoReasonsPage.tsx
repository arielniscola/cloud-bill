import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Check, Edit, Plus, Power, Tags, Trash2, X } from 'lucide-react';
import { Button, Input, Spinner } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import chequeEgresosService from '../../services/cheque-egresos.service';
import type { ChequeEgresoReason } from '../../types/cheque.types';
import { apiErrorMessage } from '../../utils/apiError';

/** Catálogo de motivos para egresar cheques de cartera (cambio por efectivo, extravío…). */
export default function ChequeEgresoReasonsPage() {
  const [reasons, setReasons] = useState<ChequeEgresoReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChequeEgresoReason | null>(null);

  const load = useCallback(async () => {
    try {
      setReasons(await chequeEgresosService.getReasons(true));
    } catch {
      toast.error('No se pudieron cargar los motivos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (name.length < 2) { toast.error('Ingresá el nombre del motivo'); return; }
    setIsCreating(true);
    try {
      await chequeEgresosService.createReason(name);
      setNewName('');
      toast.success(`Motivo "${name}" creado`);
      load();
    } catch (error) {
      toast.error((apiErrorMessage(error) ?? 'No se pudo crear el motivo'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      await chequeEgresosService.updateReason(editing.id, { name: editing.name.trim() });
      setEditing(null);
      load();
    } catch (error) {
      toast.error((apiErrorMessage(error) ?? 'No se pudo guardar el motivo'));
    }
  };

  const toggleActive = async (r: ChequeEgresoReason) => {
    try {
      await chequeEgresosService.updateReason(r.id, { isActive: !r.isActive });
      load();
    } catch (error) {
      toast.error((apiErrorMessage(error) ?? 'No se pudo cambiar el estado'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await chequeEgresosService.deleteReason(deleteTarget.id);
      toast.success(result.deactivated ? `"${deleteTarget.name}" ya tenía egresos: quedó desactivado` : `"${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
      load();
    } catch (error) {
      toast.error((apiErrorMessage(error) ?? 'No se pudo eliminar el motivo'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Motivos de egreso de cheques"
        subtitle="Por qué sale un cheque de la cartera: cambio por efectivo, entrega a terceros, extravío…"
        backTo="/banco-cheques"
      />

      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Nuevo motivo"
              placeholder="Ej.: Cambio en financiera"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
            />
          </div>
          <Button onClick={handleCreate} isLoading={isCreating}>
            <Plus className="mr-1.5 h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : reasons.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center dark:border-slate-700">
          <Tags className="mb-2 h-8 w-8 text-gray-300 dark:text-slate-600" />
          <p className="text-sm text-gray-500 dark:text-slate-400">Todavía no hay motivos cargados</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {reasons.map((r) => {
            const isEditing = editing?.id === r.id;
            return (
              <div key={r.id} className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', !r.isActive && 'opacity-60')}>
                {isEditing ? (
                  <>
                    <div className="min-w-[12rem] flex-1">
                      <Input
                        value={editing.name}
                        autoFocus
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={handleSaveEdit} title="Guardar"><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)} title="Cancelar"><X className="h-4 w-4" /></Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                        {r.usageCount === 0 ? 'Sin egresos' : `${r.usageCount} egreso${r.usageCount === 1 ? '' : 's'}`}
                        {!r.isActive && ' · Desactivado'}
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        type="button" title="Editar"
                        onClick={() => setEditing({ id: r.id, name: r.name })}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" title={r.isActive ? 'Desactivar' : 'Activar'}
                        onClick={() => toggleActive(r)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 dark:text-slate-500 dark:hover:bg-amber-900/30 dark:hover:text-amber-400"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        type="button" title="Eliminar"
                        onClick={() => setDeleteTarget(r)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar motivo"
        message={
          deleteTarget && deleteTarget.usageCount > 0
            ? `"${deleteTarget.name}" ya se usó en ${deleteTarget.usageCount} egreso(s): no se borra, queda desactivado y el historial lo sigue mostrando.`
            : `¿Eliminar el motivo "${deleteTarget?.name ?? ''}"?`
        }
        confirmText={deleteTarget && deleteTarget.usageCount > 0 ? 'Desactivar' : 'Eliminar'}
      />
    </div>
  );
}
