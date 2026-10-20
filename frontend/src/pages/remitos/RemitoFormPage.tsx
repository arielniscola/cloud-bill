import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Truck, FileText, Calculator, AlertCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Modal } from '../../components/ui';
import { PageHeader, BarcodeProductInput, CustomerSearchSelect, ProductSearchSelect } from '../../components/shared';
import { remitosService, customersService, productsService, invoicesService, budgetsService, stockService, warehousesService } from '../../services';
import { formatNumber } from '../../utils/formatters';
import LotPicker from '../../components/shared/LotPicker';
import type { Customer, Product, Invoice, Budget, Stock, Warehouse } from '../../types';

const remitoItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  // Lotes elegidos (productos con lotes). Vacío = el sistema reparte por vencimiento.
  lots: z.array(z.object({ lotId: z.string(), quantity: z.number() })).optional(),
});

const remitoSchema = z.object({
  customerId: z.string().min(1, 'Selecciona un cliente'),
  notes: z.string().optional().nullable(),
  transport: z.string().optional().nullable(),
  items: z.array(remitoItemSchema).min(1, 'Agrega al menos un item'),
});

type RemitoFormData = z.output<typeof remitoSchema>;

type StockEntry = Stock[] | 'loading' | 'error';

/** Stock de un producto en un depósito: disponible (cantidad − reservado) y físico. */
function stockIn(stocks: Stock[], warehouseId: string): { available: number; physical: number } {
  // Solo el registro sin variante: el remito no maneja variantes todavía.
  return stocks
    .filter((s) => s.warehouseId === warehouseId && (s.variantId ?? null) === null)
    .reduce((acc, s) => {
      const qty = Number(s.quantity);
      const reserved = Number(s.reservedQuantity);
      const q = Number.isFinite(qty) ? qty : 0;
      const r = Number.isFinite(reserved) ? reserved : 0;
      return { available: acc.available + q - r, physical: acc.physical + q };
    }, { available: 0, physical: 0 });
}

const fmtQty = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 2);

function SkeletonForm() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 animate-pulse">
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-16" />
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
        </div>
      </div>
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export default function RemitoFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get('invoiceId') || undefined;
  const budgetId = searchParams.get('budgetId') || undefined;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceDoc, setSourceDoc] = useState<Invoice | Budget | null>(null);
  const [sourceProducts, setSourceProducts] = useState<{ id: string; name: string; sku: string; maxQty: number }[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  // Productos elegidos que pueden no estar en la precarga (búsqueda remota / lector).
  const [pickedProducts, setPickedProducts] = useState<Record<string, Product>>({});
  // Stock completo por producto (todos los depósitos): cambiar de depósito no vuelve a pedir.
  const [stockByProduct, setStockByProduct] = useState<Record<string, StockEntry>>({});
  // Datos del submit retenidos mientras se confirma el aviso de stock.
  const [pendingSubmit, setPendingSubmit] = useState<RemitoFormData | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RemitoFormData>({
    resolver: zodResolver(remitoSchema) as any,
    defaultValues: {
      customerId: '',
      items: [{ productId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const customerId = watch('customerId') || '';
  const items = watch('items');

  useEffect(() => {
    const load = async () => {
      setIsLoadingData(true);
      try {
        if (invoiceId) {
          const [inv, customersData] = await Promise.all([
            invoicesService.getById(invoiceId),
            customersService.getAll({ limit: 50 }),
          ]);
          setSourceDoc(inv as Invoice);
          setCustomers(customersData.data);
          setValue('customerId', inv.customerId);

          // Build source products from invoice items
          const sp = inv.items
            .filter((item) => item.product)
            .map((item) => ({
              id: item.product!.id,
              name: item.product!.name,
              sku: item.product!.sku ?? '',
              maxQty: Number(item.quantity),
            }));
          setSourceProducts(sp);

          // Pre-fill items from invoice
          if (sp.length > 0) {
            const prefilled = sp.map((p) => ({ productId: p.id, quantity: p.maxQty }));
            setValue('items', prefilled);
          }
        } else if (budgetId) {
          const [bud, customersData] = await Promise.all([
            budgetsService.getById(budgetId),
            customersService.getAll({ limit: 50 }),
          ]);
          setSourceDoc(bud as Budget);
          setCustomers(customersData.data);
          if (bud.customerId) {
            setValue('customerId', bud.customerId);
          }

          // Build source products from budget items that have productId
          const sp = bud.items
            .filter((item) => item.productId && item.product)
            .map((item) => ({
              id: item.product!.id,
              name: item.product!.name,
              sku: item.product!.sku ?? '',
              maxQty: Number(item.quantity),
            }));
          setSourceProducts(sp);

          // Pre-fill items from budget
          if (sp.length > 0) {
            const prefilled = sp.map((p) => ({ productId: p.id, quantity: p.maxQty }));
            setValue('items', prefilled);
          }
        } else {
          const [customersData, productsData, warehousesData] = await Promise.all([
            customersService.getAll({ limit: 50 }),
            productsService.getAll({ limit: 1000 }),
            warehousesService.getAll().catch(() => [] as Warehouse[]),
          ]);
          setCustomers(customersData.data);
          setProducts(productsData.data);
          const active = warehousesData.filter((w) => w.isActive);
          setWarehouses(active);
          setWarehouseId((active.find((w) => w.isDefault) ?? active[0])?.id ?? '');
        }
      } catch {
        toast.error('Error al cargar datos');
      } finally {
        setIsLoadingData(false);
      }
    };
    load();
  }, [invoiceId, budgetId, setValue]);

  const findProduct = (id: string) => products.find((p) => p.id === id) ?? pickedProducts[id];
  const rememberProduct = (product: Product) =>
    setPickedProducts((prev) => (prev[product.id] ? prev : { ...prev, [product.id]: product }));

  const hasSource = !!(invoiceId || budgetId);

  // Carga el stock de cada producto nuevo en las líneas (solo remito libre:
  // el vinculado ya descontó/reservó al emitir el documento de origen).
  const productIdsKey = (items ?? []).map((i) => i.productId).join(',');
  useEffect(() => {
    if (hasSource) return;
    const missing = [...new Set((items ?? []).map((i) => i.productId).filter(Boolean))]
      .filter((id) => !(id in stockByProduct));
    if (missing.length === 0) return;
    setStockByProduct((prev) => ({ ...prev, ...Object.fromEntries(missing.map((id) => [id, 'loading' as const])) }));
    missing.forEach((id) => {
      stockService.getProductStock(id)
        .then((stocks) => setStockByProduct((prev) => ({ ...prev, [id]: stocks })))
        // No se marca 0: no saber cuánto hay no es lo mismo que no haber.
        .catch(() => setStockByProduct((prev) => ({ ...prev, [id]: 'error' })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdsKey, hasSource]);

  /** Stock de la línea en el depósito elegido; null = no aplica (servicio, sin producto o remito vinculado). */
  const lineStock = (productId: string):
    | null
    | { state: 'loading' | 'error' }
    | { state: 'ok'; available: number; physical: number } => {
    if (hasSource || !productId || !warehouseId) return null;
    if (findProduct(productId)?.trackStock === false) return null;
    const entry = stockByProduct[productId];
    if (entry === undefined || entry === 'loading') return { state: 'loading' };
    if (entry === 'error') return { state: 'error' };
    return { state: 'ok', ...stockIn(entry, warehouseId) };
  };

  // Al elegir a mano un producto que ya está en otra línea, se suma la cantidad allá.
  const handleProductPick = (index: number, productId: string, picked?: Product) => {
    if (picked) rememberProduct(picked);
    const existingIndex = productId
      ? items.findIndex((item, i) => i !== index && item.productId === productId)
      : -1;
    if (existingIndex >= 0) {
      setValue(
        `items.${existingIndex}.quantity`,
        Number(items[existingIndex].quantity) + (Number(items[index]?.quantity) || 1)
      );
      if (fields.length > 1) remove(index);
      else setValue(`items.${index}.productId`, '');
      // Cambió la cantidad: lo elegido de lotes ya no aplica.
      setValue(`items.${existingIndex}.lots`, undefined);
      toast.success('El producto ya estaba cargado: se sumó la cantidad a esa línea');
      return;
    }
    setValue(`items.${index}.productId`, productId, { shouldValidate: true });
    setValue(`items.${index}.lots`, undefined);
  };

  const handleBarcodeAdd = (product: Product, qty: number = 1) => {
    rememberProduct(product);
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      setValue(`items.${existingIndex}.quantity`, Number(items[existingIndex].quantity) + qty);
      return;
    }
    // Reutilizar la fila vacía inicial: si queda, su producto requerido bloquea el submit
    const emptyIndex = items.findIndex((item) => !item.productId);
    if (emptyIndex >= 0) {
      setValue(`items.${emptyIndex}.productId`, product.id);
      setValue(`items.${emptyIndex}.quantity`, qty);
    } else {
      append({ productId: product.id, quantity: qty });
    }
  };

  // Líneas cuya cantidad supera lo disponible en el depósito elegido.
  const shortLines = (items ?? []).flatMap((item) => {
    const stock = lineStock(item.productId);
    if (!stock || stock.state !== 'ok') return [];
    const requested = Number(item.quantity) || 0;
    if (requested <= stock.available) return [];
    const product = findProduct(item.productId);
    return [{
      productId: item.productId,
      label: product ? `${product.sku} - ${product.name}` : 'Producto',
      requested,
      available: stock.available,
      physical: stock.physical,
    }];
  });
  // Superar el stock físico lo rechaza el backend; superar solo el disponible
  // significa tomar mercadería reservada para otra venta: se puede, confirmando.
  const exceedsPhysical = shortLines.some((l) => l.requested > l.physical);

  const onSubmit = async (data: RemitoFormData) => {
    if (shortLines.length > 0) {
      setPendingSubmit(data);
      return;
    }
    await submitRemito(data);
  };

  const submitRemito = async (data: RemitoFormData) => {
    setPendingSubmit(null);
    setIsSubmitting(true);
    try {
      const remito = await remitosService.create({
        customerId: data.customerId,
        notes: data.notes || undefined,
        // Vacío + factura de origen → el backend hereda el transporte de la factura.
        transport: data.transport ? data.transport : undefined,
        invoiceId: invoiceId || undefined,
        budgetId: budgetId || undefined,
        warehouseId: !hasSource && warehouseId ? warehouseId : undefined,
        items: data.items,
      });
      toast.success('Remito creado');
      navigate(`/remitos/${remito.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al crear remito');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceProductOptions = [
    { value: '', label: 'Seleccioná un producto' },
    ...sourceProducts.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` })),
  ];

  const sourceLabel = invoiceId ? 'Factura' : 'Presupuesto';
  const sourceNumber = sourceDoc
    ? (sourceDoc as any).number
    : null;

  const canAddItem = !hasSource || items.length < sourceProducts.length;

  if (isLoadingData) {
    return (
      <div>
        <PageHeader title="Nuevo Remito" backTo="/remitos" />
        <SkeletonForm />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Nuevo Remito" backTo="/remitos" />

      {/* Source document banner */}
      {hasSource && sourceNumber && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm text-indigo-800 dark:text-indigo-300">
          {invoiceId ? <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" /> : <Calculator className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />}
          <span>
            Remito generado desde <strong>{sourceLabel} {sourceNumber}</strong>.
            Solo se pueden entregar productos incluidos en ese documento.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── Left: items ── */}
          <div>
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                  Ítems a entregar
                </h3>
              </div>

              {/* Barcode input — only in free mode */}
              {!hasSource && (
                <div className="px-5 pt-4">
                  <BarcodeProductInput products={products} onAdd={handleBarcodeAdd} />
                </div>
              )}

              {/* Items grid */}
              <div className="p-5 space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_80px_32px] gap-3 px-1">
                  <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Producto</span>
                  <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider text-right">Cantidad</span>
                  <span />
                </div>

                {fields.map((field, index) => {
                  const maxQty = hasSource
                    ? sourceProducts.find((p) => p.id === items[index]?.productId)?.maxQty
                    : undefined;
                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-[1fr_80px_32px] gap-3 items-start py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                    >
                      <div>
                        {hasSource ? (
                          <Select
                            options={sourceProductOptions}
                            value={items[index]?.productId || ''}
                            onChange={(value) => setValue(`items.${index}.productId`, value)}
                            error={errors.items?.[index]?.productId?.message}
                          />
                        ) : (
                          // El catálogo puede superar la precarga: busca contra el backend.
                          <ProductSearchSelect
                            products={products}
                            value={items[index]?.productId || ''}
                            onChange={(value, picked) => handleProductPick(index, value, picked)}
                            error={errors.items?.[index]?.productId?.message}
                            serverSearch
                            searchParams={{ isActive: true }}
                            stockWarehouseId={warehouseId || undefined}
                          />
                        )}
                        {(() => {
                          const stock = lineStock(items[index]?.productId);
                          if (!stock) return null;
                          if (stock.state !== 'ok') {
                            return (
                              <span className="block mt-1 text-[10px] text-gray-300 dark:text-slate-600">
                                {stock.state === 'loading' ? 'Consultando stock…' : 'Stock no disponible'}
                              </span>
                            );
                          }
                          const { available } = stock;
                          const requested = Number(items[index]?.quantity) || 0;
                          const short = requested > available;
                          // Justo: la línea se lleva todo lo que queda.
                          const tight = !short && available > 0 && requested === available;
                          return (
                            <span
                              title={`Disponible en ${warehouses.find((w) => w.id === warehouseId)?.name ?? 'el depósito'} (cantidad menos reservado)`}
                              className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${
                                short
                                  ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800'
                                  : tight
                                    ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800'
                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800'
                              }`}
                            >
                              {short && <AlertTriangle className="w-2.5 h-2.5" />}
                              {available <= 0
                                ? 'Sin stock'
                                : short
                                  ? `Faltan ${fmtQty(requested - available)} · disp. ${fmtQty(available)}`
                                  : `Disp. ${fmtQty(available)}`}
                            </span>
                          );
                        })()}
                        {!hasSource && warehouseId && findProduct(items[index]?.productId)?.trackLots && (
                          <LotPicker
                            productId={items[index].productId}
                            warehouseId={warehouseId}
                            quantity={Number(items[index]?.quantity) || 0}
                            value={items[index]?.lots}
                            onChange={(lots) => setValue(`items.${index}.lots`, lots)}
                          />
                        )}
                      </div>
                      <div>
                        <Input
                          type="number"
                          step="1"
                          min={1}
                          max={maxQty}
                          {...register(`items.${index}.quantity`)}
                          error={errors.items?.[index]?.quantity?.message}
                        />
                        {maxQty !== undefined && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 text-right">máx. {maxQty}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        className="flex items-center justify-center w-8 h-8 mt-1 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150 disabled:opacity-20 disabled:pointer-events-none active:scale-[0.98]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {errors.items?.message && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errors.items.message}
                  </div>
                )}

                {canAddItem && (
                  <button
                    type="button"
                    onClick={() => append({ productId: '', quantity: 1 })}
                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.98] mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: config + submit ── */}
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Config panel */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Configuración</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                {!hasSource && warehouses.length > 0 && (
                  <div>
                    <Select
                      label="Depósito"
                      options={warehouses.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} (por defecto)` : w.name }))}
                      value={warehouseId}
                      onChange={(id) => {
                        setWarehouseId(id);
                        // Los lotes son de cada depósito: lo elegido en el otro ya no sirve.
                        (items ?? []).forEach((_, i) => setValue(`items.${i}.lots`, undefined));
                      }}
                    />
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">La mercadería se descuenta de este depósito.</p>
                  </div>
                )}
                <div>
                  <CustomerSearchSelect
                    customers={customers}
                    value={customerId}
                    onChange={(id) => setValue('customerId', id)}
                    label="Cliente *"
                    error={errors.customerId?.message}
                    disabled={hasSource && !!sourceDoc && !!(sourceDoc as any).customerId}
                    serverSearch
                  />
                </div>
                <div>
                  <Textarea
                    label="Notas"
                    {...register('notes')}
                    rows={3}
                    placeholder="Observaciones internas..."
                  />
                </div>
                <div>
                  <Input
                    label="Transporte"
                    placeholder={invoiceId ? 'Vacío = el de la factura' : 'Ej: Transporte propio'}
                    {...register('transport')}
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex flex-col gap-2">
              {shortLines.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {shortLines.length === 1 ? '1 ítem supera' : `${shortLines.length} ítems superan`} el stock disponible del depósito.
                </div>
              )}
              <Button type="submit" isLoading={isSubmitting} className="w-full justify-center">
                <Truck className="w-4 h-4 mr-2" />
                Crear remito
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/remitos')}
                className="w-full justify-center"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </form>

      <Modal
        isOpen={!!pendingSubmit}
        onClose={() => setPendingSubmit(null)}
        title={exceedsPhysical ? 'Stock insuficiente' : 'Stock disponible insuficiente'}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            {exceedsPhysical
              ? `No hay stock suficiente en ${warehouses.find((w) => w.id === warehouseId)?.name ?? 'el depósito'} para estos ítems. Ajustá las cantidades o elegí otro depósito.`
              : 'Estos ítems superan el disponible: el remito tomaría mercadería reservada para otras ventas.'}
          </p>
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg divide-y divide-gray-100 dark:divide-slate-700">
            {shortLines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-gray-900 dark:text-white truncate">{l.label}</span>
                <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                  pedido {fmtQty(l.requested)} · disp. {fmtQty(l.available)}
                  {l.physical !== l.available && ` · físico ${fmtQty(l.physical)}`}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingSubmit(null)}>
              Volver
            </Button>
            {!exceedsPhysical && (
              <Button type="button" onClick={() => pendingSubmit && submitRemito(pendingSubmit)}>
                Crear igual
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
