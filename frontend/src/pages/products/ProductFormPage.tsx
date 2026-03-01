import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Tag, Layers, DollarSign, FileText,
  Power, Barcode, Ruler, TrendingUp,
} from 'lucide-react';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { productsService, categoriesService, brandsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { Category, Brand } from '../../types';

// ── Constants ────────────────────────────────────────────────────
const UNIT_OPTIONS = [
  { value: '', label: 'Sin unidad' },
  { value: 'UN', label: 'UN — Unidad' },
  { value: 'KG', label: 'KG — Kilogramo' },
  { value: 'GR', label: 'GR — Gramo' },
  { value: 'LT', label: 'LT — Litro' },
  { value: 'ML', label: 'ML — Mililitro' },
  { value: 'MT', label: 'MT — Metro' },
  { value: 'CM', label: 'CM — Centímetro' },
  { value: 'M2', label: 'M2 — Metro cuadrado' },
  { value: 'CJ', label: 'CJ — Caja' },
  { value: 'BL', label: 'BL — Bulto' },
];

const COMMON_IVA = [0, 10.5, 21, 27];

// ── Schema ───────────────────────────────────────────────────────
const productSchema = z.object({
  sku: z.string().min(1, 'El SKU es requerido'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  cost: z.coerce.number().min(0, 'El costo debe ser ≥ 0'),
  price: z.coerce.number().min(0, 'El precio debe ser ≥ 0'),
  taxRate: z.coerce.number().min(0).max(100).default(21),
  isActive: z.boolean(),
});

type ProductFormData = z.output<typeof productSchema>;

// ── Section header ───────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
      {icon}
      {label}
    </div>
  );
}

// ── IVA quick selector ───────────────────────────────────────────
function IvaSelector({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const isCustom = !COMMON_IVA.includes(value);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">IVA</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {COMMON_IVA.map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => onChange(rate)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
              value === rate && !isCustom
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {rate}%
          </button>
        ))}
        <button
          type="button"
          onClick={() => { if (!isCustom) onChange(0); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
            isCustom
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-white border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
          }`}
        >
          Otro
        </button>
      </div>
      {isCustom && (
        <div className="flex items-center gap-2 max-w-[140px]">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            placeholder="Ej: 5"
          />
          <span className="text-sm text-gray-500 flex-shrink-0">%</span>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Price preview card ───────────────────────────────────────────
function PricePreview({ cost, price, taxRate }: { cost: number; price: number; taxRate: number }) {
  const margin = price > 0 && cost >= 0 ? price - cost : null;
  const marginPct = margin !== null && price > 0 ? (margin / price) * 100 : null;
  const pvpFinal = price * (1 + taxRate / 100);

  const marginColor =
    marginPct === null ? 'text-gray-400'
    : marginPct < 0 ? 'text-red-600'
    : marginPct < 20 ? 'text-amber-600'
    : marginPct < 40 ? 'text-blue-600'
    : 'text-emerald-600';

  if (!price && !cost) return null;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Margen $</p>
        <p className={`text-sm font-bold ${marginColor}`}>
          {margin !== null ? formatCurrency(margin) : '—'}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Margen %</p>
        <p className={`text-sm font-bold ${marginColor}`}>
          {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">PVP + IVA</p>
        <p className="text-sm font-bold text-gray-800">
          {price > 0 ? formatCurrency(pvpFinal) : '—'}
        </p>
      </div>
    </div>
  );
}

// ── Active toggle ────────────────────────────────────────────────
function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
      checked ? 'bg-emerald-50/70 border-emerald-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
        checked ? 'bg-emerald-100 text-emerald-600' : 'bg-white border border-gray-200 text-gray-400'
      }`}>
        <Power className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium leading-none ${checked ? 'text-emerald-800' : 'text-gray-600'}`}>
          Producto activo
        </p>
        <p className="text-xs text-gray-400 mt-1 leading-none">
          Solo los productos activos aparecen en facturas, remitos y compras.
        </p>
      </div>
      <div
        className={`relative flex-shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`}
        style={{ width: 40, height: 22 }}
      >
        <span className={`absolute top-[3px] w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
        }`} />
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function FormSkeleton() {
  return (
    <Card className="max-w-3xl animate-pulse">
      <div className="space-y-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="space-y-4">
            <div className="h-3 w-32 bg-gray-100 rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          </div>
        ))}
        <div className="h-28 bg-gray-100 rounded-xl" />
        <div className="flex gap-3">
          <div className="h-9 w-36 bg-gray-100 rounded-lg" />
          <div className="h-9 w-24 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: { taxRate: 21, isActive: true },
  });

  const categoryId = watch('categoryId') || '';
  const brandId    = watch('brandId')    || '';
  const unit       = watch('unit')       || '';
  const taxRate    = watch('taxRate')    ?? 21;
  const cost       = watch('cost')       ?? 0;
  const price      = watch('price')      ?? 0;
  const isActiveVal = watch('isActive');

  // Load dropdowns
  useEffect(() => {
    Promise.all([categoriesService.getAll(), brandsService.getAll()])
      .then(([cats, brnds]) => {
        setCategories(cats);
        setBrands(brnds.filter((b) => b.isActive));
      })
      .catch(() => {});
  }, []);

  // Load product when editing
  useEffect(() => {
    if (!isEditing) return;
    const fetch = async () => {
      try {
        const p = await productsService.getById(id);
        setValue('sku',           p.sku);
        setValue('name',          p.name);
        setValue('description',   p.description);
        setValue('categoryId',    p.categoryId);
        setValue('brandId',       p.brandId);
        setValue('barcode',       p.barcode);
        setValue('unit',          p.unit);
        setValue('internalNotes', p.internalNotes);
        setValue('cost',          p.cost);
        setValue('price',         p.price);
        setValue('taxRate',       p.taxRate);
        setValue('isActive',      p.isActive);
      } catch {
        toast.error('Error al cargar producto');
        navigate('/products');
      } finally {
        setIsFetching(false);
      }
    };
    fetch();
  }, [id, isEditing, setValue, navigate]);

  const onSubmit = async (data: ProductFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        categoryId:    data.categoryId    || null,
        brandId:       data.brandId       || null,
        barcode:       data.barcode       || null,
        unit:          data.unit          || null,
        internalNotes: data.internalNotes || null,
      };
      if (isEditing) {
        await productsService.update(id, payload);
        toast.success('Producto actualizado');
      } else {
        await productsService.create(payload);
        toast.success('Producto creado');
      }
      navigate('/products');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar producto');
    } finally {
      setIsLoading(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: 'Sin categoría' }];
    const roots = categories.filter((c) => !c.parentId);
    for (const root of roots) {
      opts.push({ value: root.id, label: root.name });
      for (const child of root.children ?? []) {
        opts.push({ value: child.id, label: `\u00A0\u00A0└ ${child.name}` });
      }
    }
    return opts;
  }, [categories]);

  const brandOptions = useMemo(() => [
    { value: '', label: 'Sin marca' },
    ...brands.map((b) => ({ value: b.id, label: b.name })),
  ], [brands]);

  if (isFetching) {
    return (
      <div>
        <PageHeader title={isEditing ? 'Editar Producto' : 'Nuevo Producto'} backTo="/products" />
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Producto' : 'Nuevo Producto'}
        backTo="/products"
      />

      <Card className="max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* ── Identificación ── */}
          <div className="space-y-4">
            <SectionHeader icon={<Tag className="w-3.5 h-3.5" />} label="Identificación" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SKU *</label>
                <input
                  type="text"
                  placeholder="Ej: PROD-001"
                  {...register('sku')}
                  autoFocus={!isEditing}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
                {errors.sku && <p className="mt-1 text-xs text-red-500">{errors.sku.message}</p>}
              </div>
              <Input
                label="Nombre *"
                placeholder="Nombre del producto"
                {...register('name')}
                error={errors.name?.message}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-gray-400" />
                  Código de barras
                </label>
                <input
                  type="text"
                  placeholder="7790001234567"
                  {...register('barcode')}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                />
              </div>
              <Select
                label="Unidad de medida"
                options={UNIT_OPTIONS}
                value={unit}
                onChange={(v) => setValue('unit', v || null)}
              />
            </div>
          </div>

          {/* ── Clasificación ── */}
          <div className="space-y-4">
            <SectionHeader icon={<Layers className="w-3.5 h-3.5" />} label="Clasificación" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Categoría"
                options={categoryOptions}
                value={categoryId}
                onChange={(v) => setValue('categoryId', v || null)}
              />
              <Select
                label="Marca"
                options={brandOptions}
                value={brandId}
                onChange={(v) => setValue('brandId', v || null)}
              />
            </div>
          </div>

          {/* ── Precios ── */}
          <div className="space-y-4">
            <SectionHeader icon={<DollarSign className="w-3.5 h-3.5" />} label="Precios" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Costo *"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register('cost')}
                error={errors.cost?.message}
                hint="Precio de compra al proveedor"
              />
              <Input
                label="Precio de venta *"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register('price')}
                error={errors.price?.message}
                hint="Precio sin IVA"
              />
            </div>

            <IvaSelector
              value={Number(taxRate)}
              onChange={(v) => setValue('taxRate', v)}
              error={errors.taxRate?.message}
            />

            <PricePreview cost={Number(cost)} price={Number(price)} taxRate={Number(taxRate)} />
          </div>

          {/* ── Descripción ── */}
          <div className="space-y-4">
            <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} label="Descripción" />
            <Textarea
              label="Descripción comercial"
              placeholder="Descripción visible en facturas y remitos"
              rows={3}
              {...register('description')}
              error={errors.description?.message}
            />
            <Textarea
              label="Notas internas"
              placeholder="Notas visibles solo en el sistema (proveedor preferido, observaciones de stock…)"
              rows={2}
              {...register('internalNotes')}
              error={errors.internalNotes?.message}
            />
          </div>

          {/* ── Estado ── */}
          <ActiveToggle
            checked={isActiveVal}
            onChange={(v) => setValue('isActive', v)}
          />

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/products')} disabled={isLoading}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
