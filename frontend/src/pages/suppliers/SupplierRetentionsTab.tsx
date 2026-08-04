import { useState, useEffect, useCallback } from 'react';
import { Plus, Percent, Trash2, Pencil, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input, Modal, Select } from '../../components/ui';
import { suppliersService } from '../../services';
import { RETENTION_TYPE_OPTIONS, RETENTION_BASE_OPTIONS } from '../../utils/constants';
import type { SupplierRetention, CreateSupplierRetentionDTO, RetentionBase } from '../../types/supplier.types';
import type { RetentionType } from '../../types/purchase.types';

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);
const BASE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_BASE_OPTIONS.map((o) => [o.value, o.label]),
);

interface FormState {
  type: RetentionType;
  jurisdiction: string;
  base: RetentionBase;
  percentage: string;
  arcaImpuesto: string;
  arcaRegimen: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  type: 'IIBB', jurisdiction: '', base: 'NETO', percentage: '',
  arcaImpuesto: '', arcaRegimen: '', notes: '',
};

// Código de impuesto de SICORE por régimen. IIBB es provincial (SIRCAR / ARBA /
// AGIP) y no se declara en SICORE, por eso no tiene código.
const ARCA_IMPUESTO_BY_TYPE: Record<string, string> = { GANANCIAS: '217', IVA: '767' };

const isSicoreType = (type: string) => type !== 'IIBB';

export default function SupplierRetentionsTab({ supplierId }: { supplierId: string }) {
  const [retentions, setRetentions] = useState<SupplierRetention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRetention | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setRetentions(await suppliersService.getRetentions(supplierId));
    } catch {
      toast.error('Error al cargar las retenciones');
    } finally {
      setIsLoading(false);
    }
  }, [supplierId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setIsModalOpen(true); };

  const openEdit = (r: SupplierRetention) => {
    setEditing(r);
    setForm({
      type: r.type,
      jurisdiction: r.jurisdiction ?? '',
      base: r.base,
      percentage: String(r.percentage),
      arcaImpuesto: r.arcaImpuesto ?? '',
      arcaRegimen: r.arcaRegimen ?? '',
      notes: r.notes ?? '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const percentage = Number(form.percentage);
    if (!(percentage > 0)) { toast.error('Ingresá una alícuota mayor a 0'); return; }
    if (percentage > 100)  { toast.error('La alícuota no puede superar 100%'); return; }

    const payload: CreateSupplierRetentionDTO = {
      type: form.type,
      jurisdiction: form.jurisdiction.trim() || null,
      base: form.base,
      percentage,
      arcaImpuesto: form.arcaImpuesto.trim() || null,
      arcaRegimen: form.arcaRegimen.trim() || null,
      notes: form.notes.trim() || null,
    };

    setIsSaving(true);
    try {
      if (editing) {
        await suppliersService.updateRetention(supplierId, editing.id, payload);
        toast.success('Retención actualizada');
      } else {
        await suppliersService.createRetention(supplierId, payload);
        toast.success('Retención configurada');
      }
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar la retención');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (r: SupplierRetention) => {
    try {
      await suppliersService.updateRetention(supplierId, r.id, { isActive: !r.isActive });
      await fetchData();
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  const handleDelete = async (r: SupplierRetention) => {
    if (!confirm(`¿Eliminar la retención de ${TYPE_LABELS[r.type] ?? r.type} (${r.percentage}%)?`)) return;
    try {
      await suppliersService.deleteRetention(supplierId, r.id);
      toast.success('Retención eliminada');
      await fetchData();
    } catch {
      toast.error('Error al eliminar la retención');
    }
  };

  return (
    <Card padding="none">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
        <Percent className="w-4 h-4 text-gray-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Retenciones</h2>
        <Button variant="outline" size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
        </Button>
      </div>

      <div className="px-5 py-3 bg-gray-50/60 dark:bg-slate-800/40 border-b border-gray-100 dark:border-slate-700">
        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
          Se practican <strong>al emitir la Orden de Pago</strong>, no al cargar la factura. La orden las
          propone automáticamente aplicando la alícuota sobre la base configurada. Lo retenido no se le paga
          al proveedor —su deuda se cancela igual por el total— y queda como impuesto a depositar en el
          reporte de retenciones.
        </p>
      </div>

      {isLoading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">Cargando…</div>
      ) : retentions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
            <Percent className="w-6 h-6 text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sin retenciones configuradas</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 max-w-xs">
            Agregá un régimen para que se aplique automáticamente cada vez que le pagues a este proveedor.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700">
                {['Régimen', 'Jurisdicción', 'Base de cálculo', 'Alícuota', 'Cód. ARCA', 'Estado', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {retentions.map((r) => (
                <tr key={r.id} className={r.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-800">
                      {TYPE_LABELS[r.type] ?? r.type}
                    </span>
                    {r.notes && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{r.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{r.jurisdiction || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{BASE_LABELS[r.base] ?? r.base}</td>
                  <td className="px-4 py-3 tabular-nums font-medium text-gray-800 dark:text-slate-200">{r.percentage}%</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {!isSicoreType(r.type)
                      ? <span className="text-gray-300 dark:text-slate-600">provincial</span>
                      : r.arcaImpuesto && r.arcaRegimen
                        ? <span className="text-gray-500 dark:text-slate-400">{r.arcaImpuesto}/{r.arcaRegimen}</span>
                        : <span className="text-amber-600 dark:text-amber-400">falta</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      {r.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => toggleActive(r)} title={r.isActive ? 'Desactivar' : 'Activar'}
                        className="p-1.5 text-gray-400 hover:text-indigo-500">
                        <Power className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => openEdit(r)} title="Editar"
                        className="p-1.5 text-gray-400 hover:text-indigo-500">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(r)} title="Eliminar"
                        className="p-1.5 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Editar retención' : 'Nueva retención'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Régimen"
              options={RETENTION_TYPE_OPTIONS}
              value={form.type}
              // Al cambiar de régimen se propone el código de impuesto de SICORE
              // (el usuario lo puede pisar); IIBB no lleva ninguno.
              onChange={(v) => setForm((f) => ({
                ...f,
                type: v as RetentionType,
                arcaImpuesto: ARCA_IMPUESTO_BY_TYPE[v] ?? (isSicoreType(v) ? f.arcaImpuesto : ''),
              }))}
            />
            <Input
              label="Jurisdicción (opcional)"
              placeholder="Ej. CABA, Buenos Aires"
              value={form.jurisdiction}
              onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
            />
          </div>

          <div>
            <Select
              label="Base de cálculo"
              options={RETENTION_BASE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={form.base}
              onChange={(v) => setForm((f) => ({ ...f, base: v as RetentionBase }))}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {RETENTION_BASE_OPTIONS.find((o) => o.value === form.base)?.hint}
            </p>
          </div>

          <Input
            label="Alícuota (%)"
            type="number"
            min="0"
            max="100"
            step="0.001"
            placeholder="1.500"
            value={form.percentage}
            onChange={(e) => setForm((f) => ({ ...f, percentage: e.target.value }))}
          />

          {isSicoreType(form.type) ? (
            <div className="rounded-xl border border-gray-100 dark:border-slate-700 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Códigos ARCA (SICORE)</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  Necesarios para generar el archivo de importación de SICORE desde el reporte de retenciones.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Código de impuesto"
                  placeholder="217 Ganancias / 767 IVA"
                  value={form.arcaImpuesto}
                  onChange={(e) => setForm((f) => ({ ...f, arcaImpuesto: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                />
                <Input
                  label="Código de régimen"
                  placeholder="Ej. 116"
                  value={form.arcaRegimen}
                  onChange={(e) => setForm((f) => ({ ...f, arcaRegimen: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-slate-500">
              IIBB es un impuesto provincial: se declara por SIRCAR / ARBA / AGIP, no por SICORE.
            </p>
          )}

          <Input
            label="Notas (opcional)"
            placeholder="Ej. Padrón ARBA, alta al 01/2026"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              {editing ? 'Guardar cambios' : 'Agregar retención'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
