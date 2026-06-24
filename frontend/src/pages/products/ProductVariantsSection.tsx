import { useState, useEffect, useCallback } from 'react';
import { Shirt, Plus, Trash2, Pencil, Save, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Modal } from '../../components/ui';
import { productVariantsService } from '../../services';
import type { ProductVariant } from '../../types/product-variant.types';

interface Props {
  productId: string | null;
  enabled: boolean;            // category.allowsVariants AND empresa con módulo 'variantes'
  disabledReason?: string;     // mensaje si !enabled
}

interface InlineFormState {
  sku: string;
  name: string;
  attributes: Array<{ key: string; value: string }>;
  priceOverride: string;
}

const EMPTY_FORM: InlineFormState = {
  sku: '',
  name: '',
  attributes: [{ key: '', value: '' }],
  priceOverride: '',
};

function attrsToObj(rows: Array<{ key: string; value: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.key.trim() && r.value.trim()) out[r.key.trim()] = r.value.trim();
  }
  return out;
}

function attrsSummary(attrs: Record<string, string>): string {
  return Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
}

export default function ProductVariantsSection({ productId, enabled, disabledReason }: Props) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [form, setForm] = useState<InlineFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setIsLoading(true);
    try {
      const data = await productVariantsService.getByProduct(productId);
      setVariants(data);
    } catch {
      toast.error('Error al cargar variantes');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  if (!enabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          <Shirt className="w-3.5 h-3.5" />
          Variantes
        </div>
        <div className="text-sm text-gray-400 dark:text-slate-500 italic px-3 py-4 bg-gray-50 dark:bg-slate-700/30 rounded-lg border border-dashed border-gray-200 dark:border-slate-600">
          {disabledReason ?? 'Las variantes están deshabilitadas para este producto.'}
        </div>
      </div>
    );
  }

  if (!productId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          <Shirt className="w-3.5 h-3.5" />
          Variantes
        </div>
        <div className="text-sm text-amber-700 dark:text-amber-400 px-3 py-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          Guardá el producto primero para poder agregar variantes (talles, colores, etc.).
        </div>
      </div>
    );
  }

  const handleAddOrUpdate = async () => {
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error('SKU y nombre son obligatorios');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        attributes: attrsToObj(form.attributes),
        priceOverride: form.priceOverride.trim() ? Number(form.priceOverride) : null,
      };
      if (editingId) {
        await productVariantsService.update(editingId, payload);
        toast.success('Variante actualizada');
      } else {
        await productVariantsService.create(productId, payload);
        toast.success('Variante creada');
      }
      setShowInlineForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar variante');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (v: ProductVariant) => {
    setEditingId(v.id);
    setForm({
      sku: v.sku,
      name: v.name,
      attributes: Object.keys(v.attributes).length > 0
        ? Object.entries(v.attributes).map(([key, value]) => ({ key, value: String(value) }))
        : [{ key: '', value: '' }],
      priceOverride: v.priceOverride !== null ? String(v.priceOverride) : '',
    });
    setShowInlineForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta variante? Si tiene movimientos de stock, no se podrá deshacer.')) return;
    try {
      await productVariantsService.delete(id);
      toast.success('Variante eliminada');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          <Shirt className="w-3.5 h-3.5" />
          Variantes
          <span className="text-[10px] text-gray-400 normal-case font-normal">({variants.length})</span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowBulkModal(true)}
            className="text-xs"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Generar en lote
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY_FORM);
              setShowInlineForm(true);
            }}
            className="text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Agregar variante
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-400">Cargando variantes…</div>}

      {!isLoading && variants.length === 0 && !showInlineForm && (
        <div className="text-sm text-gray-400 dark:text-slate-500 italic px-3 py-6 bg-gray-50 dark:bg-slate-700/30 rounded-lg border border-dashed border-gray-200 dark:border-slate-600 text-center">
          Sin variantes aún. Agregá una manualmente o generá en lote desde una matriz de atributos.
        </div>
      )}

      {variants.length > 0 && (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50/80 dark:bg-slate-700/40 text-xs text-gray-400 dark:text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">SKU</th>
                <th className="px-4 py-2 text-left font-semibold">Nombre</th>
                <th className="px-4 py-2 text-left font-semibold">Atributos</th>
                <th className="px-4 py-2 text-right font-semibold">Precio</th>
                <th className="px-4 py-2 text-right font-semibold w-20">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {variants.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-2 font-mono text-xs text-indigo-600 dark:text-indigo-400">{v.sku}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-slate-300">{v.name}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-slate-400">{attrsSummary(v.attributes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-slate-400">
                    {v.priceOverride !== null ? Number(v.priceOverride).toFixed(2) : <span className="text-gray-300">heredado</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleEdit(v)}
                      className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-400 hover:text-indigo-600"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 ml-1"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInlineForm && (
        <div className="bg-violet-50/50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="SKU *"
              placeholder="REM-NEG-M"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
            <Input
              label="Nombre *"
              placeholder="Talle M"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">
              Atributos (talle, color, etc.)
            </label>
            {form.attributes.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="atributo (ej: talle)"
                  value={row.key}
                  onChange={(e) => {
                    const next = [...form.attributes];
                    next[i] = { ...next[i], key: e.target.value };
                    setForm({ ...form, attributes: next });
                  }}
                />
                <Input
                  placeholder="valor (ej: M)"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...form.attributes];
                    next[i] = { ...next[i], value: e.target.value };
                    setForm({ ...form, attributes: next });
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = form.attributes.filter((_, idx) => idx !== i);
                    setForm({ ...form, attributes: next.length ? next : [{ key: '', value: '' }] });
                  }}
                  className="p-2 rounded text-gray-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, attributes: [...form.attributes, { key: '', value: '' }] })}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              + Agregar atributo
            </button>
          </div>

          <Input
            label="Precio override (opcional)"
            type="number"
            step="0.01"
            placeholder="Hereda del producto si está vacío"
            value={form.priceOverride}
            onChange={(e) => setForm({ ...form, priceOverride: e.target.value })}
          />

          <div className="flex gap-2">
            <Button type="button" onClick={handleAddOrUpdate} isLoading={isSaving}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {editingId ? 'Guardar cambios' : 'Crear variante'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowInlineForm(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <BulkVariantsModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        productId={productId}
        onCreated={async () => {
          setShowBulkModal(false);
          await load();
        }}
      />
    </div>
  );
}

// ─── Bulk modal ──────────────────────────────────────────────────────────

interface BulkProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  onCreated: () => void;
}

interface MatrixRow {
  key: string;
  values: string;  // CSV: "S, M, L"
}

function BulkVariantsModal({ isOpen, onClose, productId, onCreated }: BulkProps) {
  const [skuPrefix, setSkuPrefix] = useState('');
  const [rows, setRows] = useState<MatrixRow[]>([{ key: 'talle', values: 'S, M, L, XL' }]);
  const [priceOverride, setPriceOverride] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setSkuPrefix('');
    setRows([{ key: 'talle', values: 'S, M, L, XL' }]);
    setPriceOverride('');
  };

  const preview = rows
    .filter((r) => r.key.trim() && r.values.trim())
    .reduce((count, r) => count * r.values.split(',').filter((v) => v.trim()).length, 1);

  const handleSubmit = async () => {
    if (!skuPrefix.trim()) {
      toast.error('El prefijo del SKU es obligatorio');
      return;
    }
    const matrix: Record<string, string[]> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      const vals = r.values.split(',').map((v) => v.trim()).filter(Boolean);
      if (vals.length === 0) continue;
      matrix[k] = vals;
    }
    if (Object.keys(matrix).length === 0) {
      toast.error('Agregá al menos un atributo con valores');
      return;
    }
    setIsSaving(true);
    try {
      const result = await productVariantsService.bulkCreate(productId, {
        skuPrefix: skuPrefix.trim(),
        attributeMatrix: matrix,
        priceOverride: priceOverride.trim() ? Number(priceOverride) : null,
      });
      toast.success(`${result.length} variantes creadas`);
      reset();
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al generar variantes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generar variantes en lote" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Generá una variante por cada combinación de atributos. Ej: 4 talles × 2 colores = 8 variantes.
        </p>

        <Input
          label="Prefijo del SKU *"
          placeholder="REM-NEG"
          value={skuPrefix}
          onChange={(e) => setSkuPrefix(e.target.value)}
          hint="Se usa como base para generar SKUs únicos (ej: REM-NEG-S, REM-NEG-M…)"
        />

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Atributos</label>
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input
                placeholder="atributo (talle)"
                value={row.key}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], key: e.target.value };
                  setRows(next);
                }}
              />
              <Input
                placeholder="valores separados por coma (S, M, L)"
                value={row.values}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], values: e.target.value };
                  setRows(next);
                }}
              />
              <button
                type="button"
                onClick={() => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)}
                className="p-2 rounded text-gray-400 hover:text-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { key: '', values: '' }])}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + Agregar atributo
          </button>
        </div>

        <Input
          label="Precio override (opcional)"
          type="number"
          step="0.01"
          placeholder="Aplica a todas las variantes generadas"
          value={priceOverride}
          onChange={(e) => setPriceOverride(e.target.value)}
        />

        <div className="px-3 py-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg text-sm text-violet-700 dark:text-violet-300">
          Se generarán <strong>{preview}</strong> variante{preview === 1 ? '' : 's'}.
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" onClick={handleSubmit} isLoading={isSaving} disabled={preview === 0}>
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Generar {preview} variante{preview === 1 ? '' : 's'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
