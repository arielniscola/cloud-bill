import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Landmark, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { cashRegistersService } from '../../services';
import type { CashRegister } from '../../types';

function CashRegisterCard({
  cr,
  onEdit,
  onDelete,
  onClick,
}: {
  cr: CashRegister;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 hover:border-indigo-200 dark:hover:border-indigo-600 hover:shadow-sm transition-all duration-150 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              cr.isActive ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-gray-100 dark:bg-slate-700'
            }`}
          >
            <Landmark
              className={`w-5 h-5 ${cr.isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500'}`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{cr.name}</p>
            {cr.description ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">{cr.description}</p>
            ) : (
              <p className="text-xs text-gray-300 dark:text-slate-600 mt-0.5 italic">Sin descripción</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
            title="Editar"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
            cr.isActive
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
          }`}
        >
          {cr.isActive ? (
            <><CheckCircle className="w-3 h-3" />Activa</>
          ) : (
            <><XCircle className="w-3 h-3" />Inactiva</>
          )}
        </span>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-32" />
          <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-48" />
        </div>
      </div>
      <div className="mt-4 h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-16" />
    </div>
  );
}

export default function CashRegistersPage() {
  const navigate = useNavigate();
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [isDeleting, setIsDeleting]       = useState(false);

  const fetchCashRegisters = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await cashRegistersService.getAll();
      setCashRegisters(data);
    } catch {
      toast.error('Error al cargar cajas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCashRegisters(); }, [fetchCashRegisters]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await cashRegistersService.delete(deleteId);
      toast.success('Caja eliminada');
      setDeleteId(null);
      fetchCashRegisters();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar caja');
    } finally {
      setIsDeleting(false);
    }
  };

  const activeCount   = cashRegisters.filter((cr) => cr.isActive).length;
  const inactiveCount = cashRegisters.filter((cr) => !cr.isActive).length;

  return (
    <div>
      <PageHeader
        title="Cajas"
        subtitle={`${cashRegisters.length} cajas registradas`}
        actions={
          <Button onClick={() => navigate('/cash-registers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva caja
          </Button>
        }
      />

      {/* Summary pills */}
      {!isLoading && cashRegisters.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-3.5 h-3.5" />
            {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </span>
          {inactiveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-600">
              <XCircle className="w-3.5 h-3.5" />
              {inactiveCount} inactiva{inactiveCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : cashRegisters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
            <Landmark className="w-7 h-7 text-gray-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">No hay cajas registradas</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-6 max-w-xs">
            Creá cajas para organizar los cobros de facturas y presupuestos.
          </p>
          <Button onClick={() => navigate('/cash-registers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva caja
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cashRegisters.map((cr) => (
            <CashRegisterCard
              key={cr.id}
              cr={cr}
              onClick={() => navigate(`/cash-registers/${cr.id}`)}
              onEdit={() => navigate(`/cash-registers/${cr.id}/edit`)}
              onDelete={() => setDeleteId(cr.id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar caja"
        message="¿Estás seguro de que deseas eliminar esta caja? Los pagos registrados con esta caja no se verán afectados."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
