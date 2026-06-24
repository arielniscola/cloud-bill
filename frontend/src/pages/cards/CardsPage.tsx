import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, CreditCard, X, Search, Power, Percent, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, ConfirmDialog, BancoSelect } from '../../components/shared';
import { Button, Input, Select, Modal } from '../../components/ui';
import { cardsService } from '../../services';
import type { Card } from '../../types/card.types';

// ── Schemas ──────────────────────────────────────────────────────
const surchargeSchema = z.object({
  installments: z.coerce.number().int().min(1),
  surchargePercent: z.coerce.number().min(0).max(100),
});

const cardSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  type: z.enum(['CREDIT', 'DEBIT']),
  bank: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  surcharges: z.array(surchargeSchema).default([]),
});

type CardFormData = z.infer<typeof cardSchema>;
type FilterTab = 'all' | 'active' | 'inactive';

// ── Constants ────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'CREDIT', label: 'Crédito' },
  { value: 'DEBIT',  label: 'Débito'  },
];

const TYPE_LABEL: Record<string, string> = { CREDIT: 'Crédito', DEBIT: 'Débito' };

const TYPE_STYLE: Record<string, { badge: string; gradient: string; icon: string }> = {
  CREDIT: {
    badge:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    gradient: 'from-indigo-600 to-purple-700',
    icon:     'text-purple-200',
  },
  DEBIT: {
    badge:    'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    gradient: 'from-sky-500 to-cyan-600',
    icon:     'text-sky-200',
  },
};

const PRESET_INSTALLMENTS = [1, 3, 6, 12, 18, 24];

// ── ModalToggle ──────────────────────────────────────────────────
function ModalToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
      checked
        ? 'bg-emerald-50/70 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
        : 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
        checked ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-400 dark:text-slate-500'
      }`}>
        <Power className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium leading-none ${checked ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-600 dark:text-slate-300'}`}>
          Tarjeta activa
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 leading-none">
          Solo las tarjetas activas aparecen al registrar pagos.
        </p>
      </div>
      <div
        className={`relative flex-shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-600'}`}
        style={{ width: 36, height: 20 }}
      >
        <span className={`absolute top-[3px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[17px]' : 'translate-x-[3px]'
        }`} />
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

// ── CardFormModal ────────────────────────────────────────────────
function CardFormModal({
  open,
  onClose,
  onSaved,
  editCard,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (card: Card) => void;
  editCard?: Card | null;
}) {
  const [saving, setSaving] = useState(false);

  const {
    register, handleSubmit, control, reset, watch, setValue,
    formState: { errors },
  } = useForm<CardFormData>({
    resolver: zodResolver(cardSchema) as any,
    defaultValues: { name: '', type: 'CREDIT', bank: null, isActive: true, surcharges: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'surcharges' });
  const isActiveVal = watch('isActive') ?? true;

  useEffect(() => {
    if (open) {
      reset(
        editCard
          ? {
              name: editCard.name,
              type: editCard.type as 'CREDIT' | 'DEBIT',
              bank: editCard.bank ?? null,
              isActive: editCard.isActive,
              surcharges: editCard.surcharges.map((s) => ({
                installments: s.installments,
                surchargePercent: s.surchargePercent,
              })),
            }
          : { name: '', type: 'CREDIT', bank: null, isActive: true, surcharges: [] }
      );
    }
  }, [open, editCard]); // eslint-disable-line react-hooks/exhaustive-deps

  const existingInstallments = new Set(fields.map((f) => f.installments));

  const addPreset = (installments: number) => {
    if (existingInstallments.has(installments)) return;
    append({ installments, surchargePercent: 0 });
  };

  const onSubmit = async (data: CardFormData) => {
    setSaving(true);
    try {
      const saved = editCard
        ? await cardsService.update(editCard.id, data)
        : await cardsService.create(data);
      toast.success(editCard ? 'Tarjeta actualizada' : 'Tarjeta creada');
      onSaved(saved);
      onClose();
    } catch {
      toast.error('Error al guardar la tarjeta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={editCard ? 'Editar tarjeta' : 'Nueva tarjeta'}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Basic fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input
              label="Nombre *"
              placeholder="Ej: Visa, Mastercard…"
              {...register('name')}
              error={errors.name?.message}
              autoFocus
            />
          </div>
          <Select
            label="Tipo"
            options={TYPE_OPTIONS}
            value={watch('type')}
            onChange={(val) => setValue('type', val as 'CREDIT' | 'DEBIT')}
          />
          <BancoSelect label="Banco (opcional)" placeholder="Ej: Galicia, Macro…" value={watch('bank')} onChange={(v) => setValue('bank', v)} />
        </div>

        {/* Surcharges */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Recargos por cuotas
            </span>
          </div>

          {/* Preset quick-add */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESET_INSTALLMENTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => addPreset(n)}
                disabled={existingInstallments.has(n)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                  existingInstallments.has(n)
                    ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-transparent cursor-not-allowed'
                    : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                }`}
              >
                {n === 1 ? 'Contado' : `${n}c`}
              </button>
            ))}
          </div>

          {fields.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-slate-500 italic py-2 text-center border border-dashed border-gray-200 dark:border-slate-600 rounded-lg">
              Sin recargos — el pago con esta tarjeta no aplicará recargo.
            </p>
          ) : (
            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="flex items-center gap-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-gray-600 dark:text-slate-400 w-20 shrink-0 font-medium">
                    {field.installments === 1 ? 'Contado' : `${field.installments} cuotas`}
                  </span>
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="w-24 text-sm border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      {...register(`surcharges.${idx}.surchargePercent`)}
                    />
                    <Percent className="w-3 h-3 text-gray-400" />
                  </div>
                  <button type="button" onClick={() => remove(idx)} className="text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => append({ installments: 1, surchargePercent: 0 })}
            className="mt-2 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar cuotas personalizadas
          </button>
        </div>

        {/* Active toggle */}
        <ModalToggle checked={isActiveVal} onChange={(v) => setValue('isActive', v)} />

        <div className="flex gap-2.5 pt-1 border-t border-gray-100 dark:border-slate-700">
          <Button type="submit" isLoading={saving}>
            {editCard ? 'Guardar cambios' : 'Crear tarjeta'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Card tile ─────────────────────────────────────────────────────
function CardTile({
  card,
  onEdit,
  onDeactivate,
}: {
  card: Card;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const style = TYPE_STYLE[card.type] ?? TYPE_STYLE.CREDIT;
  const sorted = [...card.surcharges].sort((a, b) => a.installments - b.installments);

  return (
    <div
      className={`group relative bg-white dark:bg-slate-800 border rounded-2xl overflow-hidden transition-all duration-150 hover:shadow-md ${
        card.isActive
          ? 'border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
          : 'border-gray-100 dark:border-slate-700/50 opacity-55'
      }`}
    >
      {/* Visual card header */}
      <div className={`relative bg-gradient-to-br ${style.gradient} px-4 pt-4 pb-5`}>
        {/* Status */}
        {!card.isActive && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold bg-black/30 text-white px-2 py-0.5 rounded-full">
            Inactiva
          </span>
        )}

        {/* Card chip illustration */}
        <div className="flex items-start justify-between mb-3">
          <div className="w-7 h-5 rounded-sm bg-amber-300/80 border border-amber-200/60" />
          <CreditCard className={`w-5 h-5 ${style.icon}`} />
        </div>

        {/* Name */}
        <p className="text-white font-bold text-base leading-tight tracking-wide truncate">
          {card.name}
        </p>

        {/* Bank + type */}
        <div className="flex items-center gap-2 mt-1">
          {card.bank && (
            <span className="flex items-center gap-1 text-white/70 text-xs">
              <Building2 className="w-3 h-3" />
              {card.bank}
            </span>
          )}
          <span className="text-white/60 text-xs font-medium">{TYPE_LABEL[card.type]}</span>
        </div>
      </div>

      {/* Surcharges section */}
      <div className="px-4 py-3">
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-slate-500 italic">Sin recargos configurados</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sorted.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-0.5 text-xs rounded-lg px-2 py-1 bg-gray-50 dark:bg-slate-700 border border-gray-100 dark:border-slate-600"
              >
                <span className="text-gray-500 dark:text-slate-400 font-medium">
                  {s.installments === 1 ? '1c' : `${s.installments}c`}
                </span>
                {s.surchargePercent > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold ml-0.5">
                    +{s.surchargePercent}%
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium ml-0.5">sin rec.</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="absolute top-2.5 left-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Editar"
          className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {card.isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeactivate(); }}
            title="Desactivar"
            className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-red-500/80 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────
function SkeletonTile() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden animate-pulse">
      <div className="h-24 bg-gray-200 dark:bg-slate-700" />
      <div className="px-4 py-3 space-y-2">
        <div className="h-3 w-20 bg-gray-100 dark:bg-slate-600 rounded" />
        <div className="h-3 w-32 bg-gray-100 dark:bg-slate-600 rounded" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cardsService.getAll();
      setCards(data);
    } catch {
      toast.error('Error al cargar tarjetas');
    } finally {
      setLoading(false);
      setIsFirstLoad(false);
    }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  const activeCount = useMemo(() => cards.filter((c) => c.isActive).length, [cards]);
  const inactiveCount = cards.length - activeCount;

  const filtered = useMemo(() => {
    let base = cards;
    if (activeTab === 'active')   base = cards.filter((c) => c.isActive);
    if (activeTab === 'inactive') base = cards.filter((c) => !c.isActive);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.bank ?? '').toLowerCase().includes(q)
    );
  }, [cards, activeTab, search]);

  const handleSaved = (card: Card) => {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === card.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = card; return next; }
      return [...prev, card];
    });
  };

  const handleDeactivate = async () => {
    if (!deactivateId) return;
    setIsDeactivating(true);
    try {
      await cardsService.delete(deactivateId);
      toast.success('Tarjeta desactivada');
      setCards((prev) => prev.map((c) => (c.id === deactivateId ? { ...c, isActive: false } : c)));
      setDeactivateId(null);
    } catch {
      toast.error('Error al desactivar');
    } finally {
      setIsDeactivating(false);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',      label: 'Todas',    count: cards.length },
    { id: 'active',   label: 'Activas',  count: activeCount  },
    { id: 'inactive', label: 'Inactivas', count: inactiveCount },
  ];

  const deactivatingCard = cards.find((c) => c.id === deactivateId);

  return (
    <div>
      <PageHeader
        title="Tarjetas"
        subtitle={
          isFirstLoad
            ? undefined
            : `${cards.length} ${cards.length === 1 ? 'tarjeta' : 'tarjetas'} · ${activeCount} activas`
        }
        actions={
          <Button onClick={() => { setEditCard(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva tarjeta
          </Button>
        }
      />

      {/* Toolbar */}
      {!isFirstLoad && cards.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === tab.id
                      ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                      : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarjetas…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 dark:placeholder-slate-500 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
            />
          </div>
        </div>
      )}

      {/* Content */}
      {isFirstLoad && loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
            <CreditCard className="w-7 h-7 text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            {search ? 'Sin resultados' : activeTab !== 'all' ? 'Sin tarjetas en esta vista' : 'Sin tarjetas configuradas'}
          </p>
          <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mb-5">
            {search
              ? `No se encontraron tarjetas para "${search}".`
              : activeTab !== 'all'
              ? 'Probá con otro filtro o creá una nueva tarjeta.'
              : 'Configurá las tarjetas de crédito y débito con sus recargos por cuotas.'}
          </p>
          {!search && activeTab === 'all' && (
            <Button onClick={() => { setEditCard(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Crear primera tarjeta
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              onEdit={() => { setEditCard(card); setFormOpen(true); }}
              onDeactivate={() => setDeactivateId(card.id)}
            />
          ))}
          {/* Add tile */}
          {activeTab === 'all' && !search && (
            <button
              onClick={() => { setEditCard(null); setFormOpen(true); }}
              className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-2xl min-h-[140px] text-gray-400 dark:text-slate-500 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-150 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-medium">Nueva tarjeta</span>
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      <CardFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        editCard={editCard}
      />

      <ConfirmDialog
        isOpen={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={handleDeactivate}
        title="Desactivar tarjeta"
        message={`¿Desactivar la tarjeta "${deactivatingCard?.name}"? Podés reactivarla editándola.`}
        confirmText="Desactivar"
        isLoading={isDeactivating}
      />
    </div>
  );
}
