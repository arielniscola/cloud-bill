import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ChevronLeft, Receipt, Wallet, Trash2, Percent } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input } from '../../components/ui';
import {
  PageHeader, BancoSelect, AccountSearchSelect, ChequeNumberInput,
  useBancos, findBancoByName, joinChequeNumber, parseChequeNumber, formatChequeNumber,
} from '../../components/shared';
import { ordenPagosService, suppliersService, purchasesService, cashRegistersService, accountingService } from '../../services';
import chequesService from '../../services/cheques.service';
import chequerasService from '../../services/chequeras.service';
import { useFeatures } from '../../hooks/useFeatures';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { OP_PAYMENT_METHOD_OPTIONS, RETENTION_TYPE_OPTIONS, RETENTION_BASE_OPTIONS } from '../../utils/constants';
import type { Supplier, CashRegister } from '../../types';
import type { SupplierRetention, RetentionBase } from '../../types/supplier.types';
import type { RetentionType } from '../../types/purchase.types';
import type { Cheque } from '../../types/cheque.types';
import type { Chequera } from '../../types/chequera.types';
import type { Account } from '../../types/accounting.types';
import type { PendingPurchaseInvoice, CreateOrdenPagoItemDTO, CreateOrdenPagoChequePropioDTO, CreateOrdenPagoAjusteDTO, CreateOrdenPagoRetencionDTO } from '../../types/ordenPago.types';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C', FACTURA_M: 'Factura M',
  NOTA_DEBITO_A: 'ND A', NOTA_DEBITO_B: 'ND B', NOTA_CREDITO_A: 'NC A', NOTA_CREDITO_B: 'NC B',
  RECIBO: 'Recibo', OTRO: 'Otro',
};

interface ItemRow {
  purchaseInvoiceId: string;
  amount: string;
}

interface PropioRow {
  chequeraId: string;
  bank: string;
  checkNumber: string;
  amount: string;
  dueDate: string;
}

interface AjusteRow {
  accountId: string;
  accountCode: string;
  description: string;
  type: 'SUMA' | 'RESTA';
  amount: string;
}

// Retención a practicar en este pago. `baseAmount` se recalcula solo desde las
// facturas seleccionadas salvo que el usuario lo edite a mano (`manualBase`).
interface RetencionRow {
  supplierRetentionId: string | null;
  type: RetentionType;
  jurisdiction: string;
  base: RetentionBase;
  baseAmount: string;
  percentage: string;
  manualBase: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Label unico para los campos del cheque propio: los componentes traen labels
// con tipografias distintas (Input usa text-sm/mb-1.5, BancoSelect text-xs) y
// eso desalineaba las filas de la grilla.
const FIELD_LABEL = 'block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1';

export default function OrdenPagoFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canUseAccounting } = useFeatures();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [supplierId, setSupplierId]         = useState(searchParams.get('supplierId') ?? '');
  // Facturas que vienen marcadas desde el listado de facturas de compra.
  const preselectRef = useRef<string[] | null>(
    searchParams.get('invoices')?.split(',').filter(Boolean) ?? null
  );
  const [paymentMethod, setPaymentMethod]   = useState('CASH');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [currency, setCurrency]             = useState('ARS');
  const [exchangeRate, setExchangeRate]     = useState('1');   // cotización USD → ARS (editable)
  const [usdRate, setUsdRate]               = useState<number | null>(null); // cotización del día (Banco Nación venta)
  const [date, setDate]                     = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference]           = useState('');
  const [bank, setBank]                     = useState('');
  const bancos                              = useBancos();
  const bancoCabecera                       = findBancoByName(bancos, bank);
  const [checkDueDate, setCheckDueDate]     = useState('');
  const [notes, setNotes]                   = useState('');
  const [items, setItems]                   = useState<ItemRow[]>([]);
  const [accountAmount, setAccountAmount]   = useState('');  // pago a cuenta (sin facturas)
  const [ajustes, setAjustes]               = useState<AjusteRow[]>([]);
  const [accounts, setAccounts]             = useState<Account[]>([]);
  const [retenciones, setRetenciones]       = useState<RetencionRow[]>([]);
  const [supplierRetentions, setSupplierRetentions] = useState<SupplierRetention[]>([]);

  const [suppliers, setSuppliers]           = useState<Supplier[]>([]);
  const [invoices, setInvoices]             = useState<PendingPurchaseInvoice[]>([]);
  const [cashRegisters, setCashRegisters]   = useState<CashRegister[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Pago con cheques
  const [carteraCheques, setCarteraCheques]   = useState<Cheque[]>([]);
  const [selectedChequeIds, setSelectedChequeIds] = useState<string[]>([]);
  const [chequeras, setChequeras]             = useState<Chequera[]>([]);
  const [propios, setPropios]                 = useState<PropioRow[]>([]);
  const [chequesLoaded, setChequesLoaded]     = useState(false);

  useEffect(() => {
    Promise.all([
      suppliersService.getAll({ limit: 1000, isActive: true }),
      cashRegistersService.getAll(),
    ]).then(([s, cr]) => {
      setSuppliers(s.data);
      setCashRegisters(cr);
      if (cr.length > 0) setCashRegisterId(cr[0].id);
    }).catch(() => {});
  }, []);

  // Cotización del día (Banco Nación venta) para pagos en USD
  useEffect(() => {
    fetch('https://dolarapi.com/v1/dolares/oficial')
      .then((r) => r.json())
      .then((d) => { if (d?.venta) setUsdRate(Number(d.venta)); })
      .catch(() => { /* sin conexión: se carga la cotización a mano */ });
  }, []);

  // Proponer la cotización del día cuando hay USD en juego (sin pisar un valor ya editado)
  useEffect(() => {
    if (!usdRate) return;
    const anyUsdInvoice = items.some((it) => invoices.find((x) => x.id === it.purchaseInvoiceId)?.currency === 'USD');
    const needsRate = anyUsdInvoice || (items.length === 0 && currency === 'USD');
    if (needsRate && (!exchangeRate || exchangeRate === '1')) setExchangeRate(String(usdRate));
  }, [usdRate, items, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDayRate = async () => {
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
      const d = await res.json();
      if (d?.venta) { setUsdRate(Number(d.venta)); setExchangeRate(String(d.venta)); }
    } catch { /* editable a mano */ }
  };

  // Plan de cuentas para los ajustes (descuentos / intereses) — solo si la empresa tiene Contabilidad
  useEffect(() => {
    if (!canUseAccounting) return;
    accountingService.getAccounts()
      .then((accs) => setAccounts(accs.filter((a) => a.isAuxiliary && a.isActive)))
      .catch(() => { /* sin plan de cuentas: la sección queda vacía */ });
  }, [canUseAccounting]);

  // Retenciones configuradas del proveedor: se proponen automáticamente al
  // elegirlo. El usuario puede quitarlas o ajustarlas antes de emitir.
  useEffect(() => {
    if (!supplierId) {
      setSupplierRetentions([]);
      setRetenciones([]);
      return;
    }
    suppliersService.getRetentions(supplierId, true)
      .then((configured) => {
        setSupplierRetentions(configured);
        setRetenciones(configured.map((r) => ({
          supplierRetentionId: r.id,
          type: r.type,
          jurisdiction: r.jurisdiction ?? '',
          base: r.base,
          baseAmount: '',       // lo completa el efecto de recálculo
          percentage: String(r.percentage),
          manualBase: false,
        })));
      })
      .catch(() => { setSupplierRetentions([]); setRetenciones([]); });
  }, [supplierId]);

  const addRetencion = () => setRetenciones((prev) => [...prev, {
    supplierRetentionId: null, type: 'IIBB', jurisdiction: '', base: 'NETO',
    baseAmount: '', percentage: '', manualBase: false,
  }]);
  const removeRetencion = (idx: number) => setRetenciones((prev) => prev.filter((_, i) => i !== idx));
  const updateRetencion = (idx: number, patch: Partial<RetencionRow>) =>
    setRetenciones((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addAjuste = () => setAjustes((prev) => [...prev, { accountId: '', accountCode: '', description: '', type: 'RESTA', amount: '' }]);

  // Excedente: se le paga al proveedor por encima de lo imputado a las facturas.
  // Al pagar la orden queda como crédito interno (saldo a favor nuestro) en su
  // cuenta corriente, imputable a facturas futuras.
  const [excedente, setExcedente] = useState('');
  const removeAjuste = (idx: number) => setAjustes((prev) => prev.filter((_, i) => i !== idx));
  const updateAjuste = (idx: number, patch: Partial<AjusteRow>) =>
    setAjustes((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));

  // Al elegir una cuenta: completa concepto y propone el tipo (INCOME=descuento→RESTA, EXPENSE=interés→SUMA)
  const selectAjusteAccount = (idx: number, accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    updateAjuste(idx, {
      accountId,
      accountCode: acc?.code ?? '',
      description: acc?.name ?? '',
      ...(acc ? { type: acc.type === 'EXPENSE' ? 'SUMA' : 'RESTA' } : {}),
    });
  };

  const fetchInvoices = useCallback(async (sid: string) => {
    if (!sid) { setInvoices([]); setItems([]); return; }
    setLoadingInvoices(true);
    try {
      const data = await purchasesService.getPendingInvoices(sid);
      setInvoices(data);
      // Facturas preseleccionadas desde el listado (?invoices=id1,id2). Solo la
      // primera carga: después manda lo que el usuario marque a mano.
      const preselect = preselectRef.current;
      preselectRef.current = null;
      setItems(preselect
        ? data
            .filter((inv) => preselect.includes(inv.id))
            .map((inv) => ({
              purchaseInvoiceId: inv.id,
              amount: (Number(inv.amount) - Number(inv.paidAmount ?? 0)).toFixed(2),
            }))
        : []);
    } catch {
      toast.error('Error al cargar facturas pendientes del proveedor');
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(supplierId); }, [supplierId, fetchInvoices]);

  // Cargar cheques en cartera + chequeras la primera vez que se elige método CHECK
  useEffect(() => {
    if (paymentMethod !== 'CHECK' || chequesLoaded) return;
    setChequesLoaded(true);
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      chequesService.getAll({ type: 'INGRESO', status: 'PENDING', limit: 200 }),
      chequerasService.getAll(),
    ]).then(([ch, q]) => {
      // "No vencidos": sin vencimiento o con vencimiento >= hoy
      setCarteraCheques(ch.data.filter((c) => !c.dueDate || c.dueDate.slice(0, 10) >= today));
      setChequeras(q.filter((x) => x.isActive));
    }).catch(() => toast.error('Error al cargar cheques en cartera'));
  }, [paymentMethod, chequesLoaded]);

  const toggleCheque = (id: string) => {
    setSelectedChequeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addPropio = () => {
    setPropios((prev) => [...prev, { chequeraId: '', bank: '', checkNumber: '', amount: '', dueDate: '' }]);
  };
  const updatePropio = (idx: number, patch: Partial<PropioRow>) => {
    setPropios((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };
  const removePropio = (idx: number) => {
    setPropios((prev) => prev.filter((_, i) => i !== idx));
  };

  const carteraTotal = carteraCheques
    .filter((c) => selectedChequeIds.includes(c.id))
    .reduce((s, c) => s + Number(c.amount), 0);
  const propiosTotal = propios.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const chequesTotal = carteraTotal + propiosTotal;

  const invCurrency = (invoiceId: string) => invoices.find((x) => x.id === invoiceId)?.currency || 'ARS';

  // Se pueden mezclar monedas: las facturas en USD se convierten a ARS con la cotización.
  // Saldo pendiente de la factura = total menos lo ya imputado por OP pagadas.
  const invoiceBalance = (inv: PendingPurchaseInvoice) => Number(inv.amount) - Number(inv.paidAmount ?? 0);

  const toggleInvoice = (inv: PendingPurchaseInvoice) => {
    const exists = items.some((i) => i.purchaseInvoiceId === inv.id);
    setItems((prev) => exists
      ? prev.filter((i) => i.purchaseInvoiceId !== inv.id)
      : [...prev, { purchaseInvoiceId: inv.id, amount: invoiceBalance(inv).toFixed(2) }]);
    // Al sumar una factura en USD, proponer la cotización del día si todavía no se cargó
    if (!exists && (inv.currency || 'ARS') === 'USD' && (!exchangeRate || exchangeRate === '1') && usdRate) {
      setExchangeRate(String(usdRate));
    }
  };

  const updateAmount = (invoiceId: string, amount: string) => {
    setItems((prev) => prev.map((i) => i.purchaseInvoiceId === invoiceId ? { ...i, amount } : i));
  };

  const isPagoACuenta = items.length === 0;
  const rate = Number(exchangeRate) || 0;
  const hasUsdInvoice = items.some((it) => invCurrency(it.purchaseInvoiceId) === 'USD');
  // Pago a cuenta: vale la moneda elegida. Pago de facturas: la OP se liquida en ARS (las USD se convierten).
  const effectiveCurrency = isPagoACuenta ? currency : 'ARS';
  const showRate = isPagoACuenta ? currency === 'USD' : hasUsdInvoice;

  // Monto de un ítem en la moneda de liquidación (ARS si la factura es en USD → se multiplica por la cotización)
  const itemAmount = (it: ItemRow) => {
    const amt = Number(it.amount) || 0;
    return invCurrency(it.purchaseInvoiceId) === 'USD' ? amt * rate : amt;
  };

  const baseAmount = isPagoACuenta
    ? (Number(accountAmount) || 0)
    : items.reduce((s, it) => s + itemAmount(it), 0);
  const ajustesNet = ajustes.reduce(
    (s, a) => s + (a.type === 'SUMA' ? (Number(a.amount) || 0) : -(Number(a.amount) || 0)),
    0
  );
  const totalDescuentos = ajustes.filter((a) => a.type === 'RESTA').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totalIntereses  = ajustes.filter((a) => a.type === 'SUMA').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const excedenteAmount = isPagoACuenta ? 0 : (Number(excedente) || 0);

  // Imputar a una factura más de lo que se le debe deja la cuenta descuadrada:
  // ese sobrante va por "Excedente a cuenta". Se avisa, no se bloquea.
  const overImputed = items.filter((it) => {
    const inv = invoices.find((p) => p.id === it.purchaseInvoiceId);
    return inv ? (Number(it.amount) || 0) > invoiceBalance(inv) + 0.005 : false;
  });
  const totalAmount = baseAmount + ajustesNet + excedenteAmount;

  // ── Bases de retención ────────────────────────────────────────────────────
  // Se arman desde las facturas seleccionadas, prorrateadas por la porción que
  // se está pagando de cada una (un pago parcial retiene sobre esa parte). Los
  // importes quedan en la moneda de liquidación de la OP.
  const retentionBases = (() => {
    if (isPagoACuenta) {
      // Sin facturas no hay discriminación de IVA: la única base posible es el importe.
      const amount = Number(accountAmount) || 0;
      return { NETO: amount, IVA: 0, BRUTO: amount };
    }
    let neto = 0, iva = 0, bruto = 0;
    for (const it of items) {
      const inv = invoices.find((x) => x.id === it.purchaseInvoiceId);
      if (!inv) continue;
      const conv = inv.currency === 'USD' ? rate : 1;
      const paid = itemAmount(it);                 // ya convertido a la moneda de la OP
      const invTotal = Number(inv.amount) * conv;
      const ratio = invTotal > 0 ? paid / invTotal : 0;
      neto  += Number(inv.subtotal)  * conv * ratio;
      iva   += Number(inv.taxAmount) * conv * ratio;
      bruto += paid;
    }
    return { NETO: round2(neto), IVA: round2(iva), BRUTO: round2(bruto) };
  })();

  // Refleja la base en las filas que no fueron editadas a mano.
  const basesKey = `${retentionBases.NETO}|${retentionBases.IVA}|${retentionBases.BRUTO}`;
  useEffect(() => {
    setRetenciones((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.manualBase) return r;
        const auto = String(retentionBases[r.base] ?? 0);
        if (auto === r.baseAmount) return r;
        changed = true;
        return { ...r, baseAmount: auto };
      });
      return changed ? next : prev;
    });
  }, [basesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const retencionAmount = (r: RetencionRow) =>
    round2(((Number(r.baseAmount) || 0) * (Number(r.percentage) || 0)) / 100);
  const totalRetenciones = round2(retenciones.reduce((s, r) => s + retencionAmount(r), 0));
  // Lo retenido no se le paga al proveedor, pero su deuda se cancela igual por
  // el total: `totalAmount` es la imputación y esto es el egreso real de dinero.
  const netToPay = round2(totalAmount - totalRetenciones);

  // Equivalente ARS para mostrar en pago a cuenta en USD (en pago de facturas el total ya está en ARS)
  const arsEquivalent = effectiveCurrency === 'USD' ? netToPay * rate : netToPay;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId)       { toast.error('Seleccioná un proveedor'); return; }

    // Pago a cuenta: sin facturas, requiere importe explícito
    if (isPagoACuenta) {
      if (!(Number(accountAmount) > 0)) {
        toast.error('Seleccioná al menos una factura o ingresá un importe para el pago a cuenta');
        return;
      }
    }
    // Los montos en USD se convierten a ARS con la cotización (la OP se liquida en ARS)
    const parsedItems: CreateOrdenPagoItemDTO[] = items.map((it) => ({
      purchaseInvoiceId: it.purchaseInvoiceId,
      amount: itemAmount(it),
    }));
    if (parsedItems.some((i) => i.amount <= 0)) {
      toast.error('Todos los montos deben ser mayores a 0');
      return;
    }

    // Ajustes (descuentos / intereses)
    const validAjustes = ajustes.filter((a) => a.description.trim() && Number(a.amount) > 0);
    if (validAjustes.length !== ajustes.length) {
      toast.error('Cada ajuste necesita un concepto y un monto mayor a 0');
      return;
    }
    const parsedAjustes: CreateOrdenPagoAjusteDTO[] = validAjustes.map((a) => ({
      accountId: a.accountId || undefined,
      accountCode: a.accountCode || undefined,
      description: a.description.trim(),
      type: a.type,
      amount: Number(a.amount),
    }));
    if (totalAmount <= 0) {
      toast.error('El total a pagar debe ser mayor a 0 luego de los ajustes');
      return;
    }

    // Retenciones: solo viajan las que tienen alícuota e importe > 0.
    if (retenciones.some((r) => Number(r.percentage) > 0 && !(Number(r.baseAmount) > 0))) {
      toast.error('Cada retención necesita una base mayor a 0');
      return;
    }
    const parsedRetenciones: CreateOrdenPagoRetencionDTO[] = retenciones
      .filter((r) => retencionAmount(r) > 0)
      .map((r) => ({
        supplierRetentionId: r.supplierRetentionId,
        type: r.type,
        jurisdiction: r.jurisdiction.trim() || null,
        base: r.base,
        baseAmount: Number(r.baseAmount),
        percentage: Number(r.percentage),
        amount: retencionAmount(r),
      }));
    if (totalRetenciones > totalAmount) {
      toast.error('Las retenciones no pueden superar el total a pagar');
      return;
    }
    if (showRate && rate <= 0) {
      toast.error('Ingresá la cotización (USD → ARS) para el pago');
      return;
    }

    // Cheques (solo si el método es CHECK)
    let chequesEnCartera: string[] | undefined;
    let chequesPropios: CreateOrdenPagoChequePropioDTO[] | undefined;
    if (paymentMethod === 'CHECK') {
      chequesEnCartera = selectedChequeIds.length > 0 ? selectedChequeIds : undefined;
      const validPropios = propios.filter((p) => Number(p.amount) > 0);
      if (validPropios.length !== propios.length) {
        toast.error('Todos los cheques propios deben tener un monto mayor a 0');
        return;
      }
      chequesPropios = validPropios.length > 0
        ? validPropios.map((p) => ({
            chequeraId: p.chequeraId || undefined,
            bank: p.bank || undefined,
            checkNumber: parseChequeNumber(p.checkNumber).numero ? p.checkNumber : undefined,
            amount: Number(p.amount),
            dueDate: p.dueDate || undefined,
          }))
        : undefined;
    }

    setIsSubmitting(true);
    try {
      const op = await ordenPagosService.create({
        supplierId,
        cashRegisterId: cashRegisterId || undefined,
        date,
        currency: effectiveCurrency as any,
        exchangeRate: showRate ? rate : 1,
        paymentMethod: paymentMethod as any,
        reference: reference || undefined,
        bank: bank || undefined,
        checkDueDate: checkDueDate || undefined,
        notes: notes || undefined,
        items: parsedItems,
        amount: isPagoACuenta ? Number(accountAmount) : undefined,
        onAccountAmount: excedenteAmount > 0 ? excedenteAmount : undefined,
        ajustes: parsedAjustes.length > 0 ? parsedAjustes : undefined,
        retenciones: parsedRetenciones.length > 0 ? parsedRetenciones : undefined,
        chequesEnCartera,
        chequesPropios,
      });
      toast.success(`Orden de Pago ${op.number} creada`);
      navigate(`/orden-pagos/${op.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al crear orden de pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Nueva Orden de Pago"
        subtitle="Registrar pago a proveedor"
        actions={
          <Button variant="outline" onClick={() => navigate('/orden-pagos')}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Volver
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del pago */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Datos del pago</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Proveedor *</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">Seleccionar proveedor…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Método de pago *</label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const v = e.target.value;
                  setPaymentMethod(v);
                  // Solo el efectivo mueve caja: al cambiar de método se limpia
                  // para no mandar una caja que el backend igual va a descartar.
                  if (v !== 'CASH') setCashRegisterId('');
                }}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {OP_PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            {paymentMethod === 'CASH' && cashRegisters.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Caja</label>
                <select
                  value={cashRegisterId}
                  onChange={(e) => setCashRegisterId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sin caja</option>
                  {cashRegisters.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
                </select>
              </div>
            )}

            {isPagoACuenta && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Moneda</label>
                <select
                  value={currency}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCurrency(v);
                    if (v === 'USD') { if ((!exchangeRate || exchangeRate === '1') && usdRate) setExchangeRate(String(usdRate)); }
                    else setExchangeRate('1');
                  }}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ARS">ARS — Peso</option>
                  <option value="USD">USD — Dólar</option>
                </select>
              </div>
            )}

            {showRate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Cotización (USD → ARS)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="0.00"
                    className="w-full text-right border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={fetchDayRate}
                    className="shrink-0 text-xs px-2.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                    title="Traer la cotización del día (Banco Nación venta)"
                  >
                    Hoy
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                  Las facturas en USD se convierten a ARS con esta cotización.
                </p>
              </div>
            )}

            {paymentMethod !== 'CHECK' && (
              <Input
                label="Referencia / N° operación"
                placeholder="Nro transferencia, comprobante…"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            )}

            {paymentMethod === 'CHECK' && (
              <>
                <BancoSelect label="Banco" value={bank} onChange={setBank} />
                <ChequeNumberInput
                  value={reference}
                  onChange={setReference}
                  bancoCode={bancoCabecera?.code}
                  sucursal={bancoCabecera?.sucursal}
                />
                <Input label="Vencimiento cheque" type="date" value={checkDueDate} onChange={(e) => setCheckDueDate(e.target.value)} />
              </>
            )}

            {paymentMethod === 'BANK_TRANSFER' && (
              <BancoSelect label="Banco" value={bank} onChange={setBank} />
            )}
          </div>

          <div className="mt-4">
            <Input
              label="Notas"
              placeholder="Observaciones opcionales…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </Card>

        {/* Pago con cheques */}
        {paymentMethod === 'CHECK' && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-indigo-500" /> Cheques
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Endosá cheques de terceros que tengas en cartera y/o emití cheques propios desde una chequera.
            </p>

            {/* Cheques en cartera (terceros) */}
            <div className="mb-6">
              <h4 className="text-xs font-semibold uppercase text-gray-400 mb-2">Cheques en cartera (terceros)</h4>
              {carteraCheques.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500 py-2">No hay cheques en cartera disponibles (no vencidos).</p>
              ) : (
                <div className="space-y-1.5">
                  {carteraCheques.map((c) => {
                    const selected = selectedChequeIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer ${selected ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/10' : 'border-gray-200 dark:border-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleCheque(c.id)}
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        />
                        <span className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">
                          {c.checkNumber ? formatChequeNumber(c.checkNumber) : c.number}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-slate-400">{c.bank ?? '—'}</span>
                        {c.issuer && <span className="text-xs text-gray-400 truncate">· {c.issuer}</span>}
                        <span className="text-xs text-gray-400 ml-auto tabular-nums">
                          {c.dueDate ? `Vto ${formatDate(c.dueDate)}` : 'Sin vto'}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200 w-28 text-right">
                          {formatCurrency(Number(c.amount), c.currency)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cheques propios */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-gray-400">Cheques propios</h4>
                <Button type="button" variant="outline" size="sm" onClick={addPropio}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar cheque
                </Button>
              </div>
              {propios.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500 py-2">Sin cheques propios. Agregá uno para emitir desde una chequera.</p>
              ) : (
                <div className="space-y-2">
                  {propios.map((p, idx) => {
                    const chequera = chequeras.find((q) => q.id === p.chequeraId);
                    return (
                      // Grilla de 12 columnas en dos filas de 4/4/4: los tres controles de
                      // arriba y los de abajo comparten el mismo eje. Va `items-start` y
                      // cada campo pone su propio label (los de los componentes tienen
                      // tipografías distintas): así los textos de ayuda que cuelgan abajo
                      // —el formato del N° de cheque, el próximo número de la chequera—
                      // no desplazan verticalmente al resto de la fila.
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-x-2 gap-y-3 items-start border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                        <div className="sm:col-span-4 min-w-0">
                          <label className={FIELD_LABEL}>Chequera</label>
                          <select
                            value={p.chequeraId}
                            onChange={(e) => {
                              const q = chequeras.find((x) => x.id === e.target.value);
                              const cat = q ? findBancoByName(bancos, q.bank) : null;
                              const prevParts = parseChequeNumber(p.checkNumber);
                              updatePropio(idx, {
                                chequeraId: e.target.value,
                                bank: q?.bank ?? p.bank,
                                checkNumber: q && q.nextNumber != null
                                  ? joinChequeNumber({
                                      banco:    cat?.code ?? prevParts.banco,
                                      sucursal: cat?.sucursal ?? prevParts.sucursal,
                                      numero:   String(q.nextNumber),
                                    })
                                  : p.checkNumber,
                              });
                            }}
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Sin chequera (N° manual)</option>
                            {chequeras.map((q) => (
                              <option key={q.id} value={q.id}>
                                {(q.name ? q.name + ' · ' : '') + q.bank}{q.nextNumber != null ? ` · próx. ${q.nextNumber}` : ''}
                              </option>
                            ))}
                          </select>
                          {chequera?.nextNumber != null && (
                            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1">Próximo N°: {chequera.nextNumber}</p>
                          )}
                        </div>
                        <div className="sm:col-span-4 min-w-0">
                          <label className={FIELD_LABEL}>Banco</label>
                          <BancoSelect value={p.bank} onChange={(v) => updatePropio(idx, { bank: v })} />
                        </div>
                        <div className="sm:col-span-4 min-w-0">
                          <ChequeNumberInput
                            value={p.checkNumber}
                            onChange={(v) => updatePropio(idx, { checkNumber: v })}
                            bancoCode={findBancoByName(bancos, p.bank)?.code}
                            sucursal={findBancoByName(bancos, p.bank)?.sucursal}
                            labelClassName={FIELD_LABEL}
                          />
                        </div>
                        <div className="sm:col-span-4 min-w-0">
                          <label className={FIELD_LABEL}>Monto</label>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={p.amount}
                            onChange={(e) => updatePropio(idx, { amount: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-4 min-w-0">
                          <label className={FIELD_LABEL}>Vencimiento</label>
                          <Input
                            type="date"
                            value={p.dueDate}
                            onChange={(e) => updatePropio(idx, { dueDate: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-4 flex justify-end">
                          <div>
                            {/* Label invisible: alinea el botón con los inputs de al lado */}
                            <span aria-hidden className={`${FIELD_LABEL} invisible`}>Quitar</span>
                            <button type="button" onClick={() => removePropio(idx)} className="p-2 text-gray-400 hover:text-red-500" title="Quitar cheque">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {chequesTotal > 0 && (
              <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                <span className="text-gray-500 dark:text-slate-400">Total en cheques:</span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatCurrency(chequesTotal, currency as any)}</span>
              </div>
            )}
          </Card>
        )}

        {/* Facturas pendientes */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Facturas a pagar</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Seleccioná las facturas del proveedor a cancelar y ajustá el monto si es un pago parcial.
            Si no seleccionás ninguna, se registra como <strong>pago a cuenta</strong>.
          </p>

          {!supplierId ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">Seleccioná un proveedor para ver sus facturas pendientes</p>
          ) : loadingInvoices ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">No hay facturas pendientes de pago para este proveedor</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-2 w-8"></th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Factura</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Compra</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Vencimiento</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Monto a pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {invoices.map((inv) => {
                    const selected = items.find((i) => i.purchaseInvoiceId === inv.id);
                    return (
                      <tr key={inv.id} className={selected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => toggleInvoice(inv)}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">{inv.number}</span>
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 px-1 py-0.5 rounded-full">
                              {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {inv.purchaseNumber ? (
                            <>
                              <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{inv.purchaseNumber}</span>
                              {inv.purchaseDate && <span className="text-xs text-gray-400 ml-1.5">{formatDate(inv.purchaseDate)}</span>}
                            </>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                          {inv.dueDate ? formatDate(inv.dueDate) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800 dark:text-slate-200">
                          {formatCurrency(Number(inv.amount), inv.currency)}
                          {Number(inv.paidAmount ?? 0) > 0 && (
                            <p className="text-[10px] font-normal text-amber-600 dark:text-amber-400 mt-0.5">
                              saldo {formatCurrency(invoiceBalance(inv), inv.currency)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {selected && (
                            <>
                              <input
                                type="number"
                                min="0.01"
                                max={invoiceBalance(inv)}
                                step="0.01"
                                value={selected.amount}
                                onChange={(e) => updateAmount(inv.id, e.target.value)}
                                className="w-28 text-right border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              {inv.currency === 'USD' && rate > 0 && (
                                <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5 tabular-nums">
                                  ≈ {formatCurrency((Number(selected.amount) || 0) * rate, 'ARS')}
                                </p>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pago a cuenta: sin facturas seleccionadas */}
          {supplierId && items.length === 0 && (
            <div className="mt-4 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/10 p-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Importe del pago a cuenta
                  </label>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                    Pago al proveedor sin imputar a una factura. Queda como saldo a favor en su cuenta corriente.
                  </p>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={accountAmount}
                    onChange={(e) => setAccountAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-48 text-right border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Retenciones practicadas en el pago */}
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-gray-400" /> Retenciones
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={addRetencion}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar retención
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Se descuentan de lo que se le paga al proveedor, pero <strong>su deuda se cancela por el total</strong>:
            lo retenido queda como impuesto a depositar y va al reporte de retenciones.
            {supplierRetentions.length > 0 && ' Se cargaron las configuradas para este proveedor.'}
          </p>

          {retenciones.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-2">
              {supplierId
                ? 'Sin retenciones. Configuralas en la ficha del proveedor para que se apliquen solas, o agregá una acá.'
                : 'Elegí un proveedor para ver sus retenciones configuradas.'}
            </p>
          ) : (
            <div className="space-y-2">
              {retenciones.map((r, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Régimen</label>
                    <select
                      value={r.type}
                      onChange={(e) => updateRetencion(idx, { type: e.target.value as RetentionType })}
                      className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {RETENTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Base</label>
                    <select
                      value={r.base}
                      onChange={(e) => updateRetencion(idx, { base: e.target.value as RetentionBase, manualBase: false })}
                      className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {RETENTION_BASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      label="Importe base"
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.baseAmount}
                      onChange={(e) => updateRetencion(idx, { baseAmount: e.target.value, manualBase: true })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      label="Alícuota %"
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      value={r.percentage}
                      onChange={(e) => updateRetencion(idx, { percentage: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Retenido</label>
                    <p className="px-2 py-2 text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                      {formatCurrency(retencionAmount(r), effectiveCurrency as any)}
                    </p>
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button type="button" onClick={() => removeRetencion(idx)} className="p-2 text-gray-400 hover:text-red-500" title="Quitar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Ajustes: descuentos obtenidos / intereses (plan de cuentas) */}
        {canUseAccounting && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Ajustes (descuentos / intereses)</h3>
              <Button type="button" variant="outline" size="sm" onClick={addAjuste}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Agregar ajuste
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Conceptos del plan de cuentas que ajustan el total a pagar. Un <strong>descuento</strong> resta y un <strong>interés/recargo</strong> suma.
            </p>

            {accounts.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 py-2">
                No hay cuentas disponibles. Configurá el plan de cuentas en el módulo de Contabilidad.
              </p>
            ) : ajustes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 py-2">Sin ajustes. Agregá uno para descontar o sumar intereses al pago.</p>
            ) : (
              <div className="space-y-2">
                {ajustes.map((a, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="sm:col-span-5">
                      <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Cuenta</label>
                      <AccountSearchSelect
                        accounts={accounts}
                        value={a.accountId}
                        onChange={(accountId) => selectAjusteAccount(idx, accountId)}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Tipo</label>
                      <select
                        value={a.type}
                        onChange={(e) => updateAjuste(idx, { type: e.target.value as 'SUMA' | 'RESTA' })}
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="RESTA">Descuento (resta)</option>
                        <option value="SUMA">Interés (suma)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        label="Monto"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={a.amount}
                        onChange={(e) => updateAjuste(idx, { amount: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button type="button" onClick={() => removeAjuste(idx)} className="p-2 text-gray-400 hover:text-red-500" title="Quitar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Summary + submit */}
        {/* Excedente: pagarle al proveedor más que lo imputado a las facturas */}
        {!isPagoACuenta && items.length > 0 && (
          <Card>
            {overImputed.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Estás imputando más de lo adeudado en{' '}
                  {overImputed.length === 1 ? 'una factura' : `${overImputed.length} facturas`}
                  {': '}
                  {overImputed.map((it) => invoices.find((p) => p.id === it.purchaseInvoiceId)?.number).filter(Boolean).join(', ')}.
                  {' '}Si la intención es pagarle de más, cargá la diferencia acá abajo como excedente:
                  así queda como crédito a favor en vez de sobre-imputar la factura.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Excedente a cuenta</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 max-w-lg">
                  Importe que se le paga al proveedor <strong>por encima</strong> de las facturas seleccionadas.
                  Al pagar la orden queda como <strong>crédito interno</strong> a favor nuestro en su cuenta
                  corriente y se puede imputar a una factura futura.
                </p>
              </div>
              <div className="text-right">
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                  Importe ({effectiveCurrency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={excedente}
                  onChange={(e) => setExcedente(e.target.value)}
                  className="w-40 text-right border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </Card>
        )}

        {(items.length > 0 || (isPagoACuenta && Number(accountAmount) > 0) || ajustes.length > 0 || totalRetenciones > 0) && (
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {isPagoACuenta
                  ? 'Pago a cuenta (sin factura)'
                  : `${items.length} factura${items.length !== 1 ? 's' : ''} seleccionada${items.length !== 1 ? 's' : ''}`}
              </p>
              <div className="text-right">
                {(totalDescuentos > 0 || totalIntereses > 0 || totalRetenciones > 0 || excedenteAmount > 0) && (
                  <div className="mb-1.5 space-y-0.5">
                    <p className="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
                      Subtotal facturas: {formatCurrency(baseAmount, effectiveCurrency as any)}
                    </p>
                    {totalIntereses > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 tabular-nums">
                        + Intereses: {formatCurrency(totalIntereses, effectiveCurrency as any)}
                      </p>
                    )}
                    {totalDescuentos > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                        − Descuentos: {formatCurrency(totalDescuentos, effectiveCurrency as any)}
                      </p>
                    )}
                    {excedenteAmount > 0 && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 tabular-nums">
                        + Excedente a cuenta: {formatCurrency(excedenteAmount, effectiveCurrency)}
                      </p>
                    )}
                    {totalRetenciones > 0 && (
                      <>
                        <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums pt-1 border-t border-dashed border-gray-200 dark:border-slate-700">
                          Se cancela al proveedor: {formatCurrency(totalAmount, effectiveCurrency as any)}
                        </p>
                        <p className="text-xs text-violet-600 dark:text-violet-400 tabular-nums">
                          − Retenciones: {formatCurrency(totalRetenciones, effectiveCurrency as any)}
                        </p>
                      </>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {totalRetenciones > 0 ? 'Neto a pagar' : 'Total a pagar'}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {formatCurrency(netToPay, effectiveCurrency as any)}
                </p>
                {effectiveCurrency === 'USD' && rate > 0 && (
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 tabular-nums mt-0.5">
                    ≈ {formatCurrency(arsEquivalent, 'ARS')} · cotiz. {rate.toLocaleString('es-AR')}
                  </p>
                )}
                {!isPagoACuenta && hasUsdInvoice && rate > 0 && (
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                    Facturas en USD convertidas a cotiz. {rate.toLocaleString('es-AR')}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => navigate('/orden-pagos')}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            <Plus className="w-4 h-4 mr-2" />
            Emitir Orden de Pago
          </Button>
        </div>
      </form>
    </div>
  );
}
