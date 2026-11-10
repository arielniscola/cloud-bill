import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ChevronLeft, Receipt, Wallet, Trash2, Percent, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, Input } from '../../components/ui';
import {
  PageHeader, BancoSelect, AccountSearchSelect, ChequeNumberInput, SupplierSearchSelect,
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
import type { PendingPurchaseInvoice, CreateOrdenPagoItemDTO, CreateOrdenPagoChequePropioDTO, CreateOrdenPagoAjusteDTO, CreateOrdenPagoRetencionDTO, CreateOrdenPagoPaymentDTO } from '../../types/ordenPago.types';
import { apiErrorMessage } from '../../utils/apiError';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C', FACTURA_M: 'Factura M',
  NOTA_DEBITO_A: 'ND A', NOTA_DEBITO_B: 'ND B', NOTA_CREDITO_A: 'NC A', NOTA_CREDITO_B: 'NC B',
  RECIBO: 'Recibo', OTRO: 'Otro',
};

interface ItemRow {
  purchaseInvoiceId: string;
  amount: string;
}

// Forma de pago (los cheques se cargan aparte y suman como una forma más).
type PayMethod = CreateOrdenPagoPaymentDTO['method'];
interface PayLine {
  method: PayMethod;
  amount: string;
  cashRegisterId: string;
  bank: string;
  reference: string;
}
// Métodos de una línea: los de OP menos Cheque (que tiene su propia sección).
const LINE_METHOD_OPTIONS = OP_PAYMENT_METHOD_OPTIONS.filter((o) => o.value !== 'CHECK');

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
  // Formas de pago. La primera se completa sola con el neto hasta que el usuario
  // toque algún importe o agregue otra (autoFill).
  const [payLines, setPayLines]             = useState<PayLine[]>([
    { method: 'CASH', amount: '', cashRegisterId: '', bank: '', reference: '' },
  ]);
  const [autoFill, setAutoFill]             = useState(true);
  const [showCheques, setShowCheques]       = useState(false);   // cheques cargados (se abrió su panel alguna vez)
  // Panel de la columna izquierda abierto (uno a la vez): mantiene la pantalla corta.
  const [openPanel, setOpenPanel]           = useState<null | 'retenciones' | 'ajustes' | 'cheques' | 'extra'>(null);
  const togglePanel = (p: 'retenciones' | 'ajustes' | 'cheques' | 'extra') => {
    if (p === 'cheques') setShowCheques(true);
    setOpenPanel((cur) => (cur === p ? null : p));
  };
  const [currency, setCurrency]             = useState('ARS');
  const [exchangeRate, setExchangeRate]     = useState('1');   // cotización USD → ARS (editable)
  const [usdRate, setUsdRate]               = useState<number | null>(null); // cotización del día (Banco Nación venta)
  const [date, setDate]                     = useState(new Date().toISOString().slice(0, 10));
  const bancos                              = useBancos();
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
      // Caja por defecto para las líneas en efectivo que todavía no eligieron una.
      if (cr.length > 0) {
        setPayLines((prev) => prev.map((l) => (l.method === 'CASH' && !l.cashRegisterId ? { ...l, cashRegisterId: cr[0].id } : l)));
      }
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
      setItems((prev) => preselect
        ? data
            .filter((inv) => preselect.includes(inv.id))
            .map((inv) => ({
              purchaseInvoiceId: inv.id,
              amount: (Number(inv.amount) - Number(inv.paidAmount ?? 0)).toFixed(2),
            }))
        // Sin preselección se conserva lo ya marcado que siga pendiente para este
        // proveedor: una recarga (o el doble efecto de StrictMode) no lo borra, y
        // al cambiar de proveedor sus facturas no coinciden y la lista se vacía.
        : prev.filter((it) => data.some((inv) => inv.id === it.purchaseInvoiceId)));
    } catch {
      toast.error('Error al cargar facturas pendientes del proveedor');
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(supplierId); }, [supplierId, fetchInvoices]);

  // Cargar cheques en cartera + chequeras la primera vez que se abre la sección de cheques
  useEffect(() => {
    if (!showCheques || chequesLoaded) return;
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
  }, [showCheques, chequesLoaded]);

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

  // ── Formas de pago: asignado vs. neto ────────────────────────────────────
  const linesTotal = round2(payLines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const assigned   = round2(linesTotal + chequesTotal);
  const difference = round2(netToPay - assigned);   // > 0 falta, < 0 sobra
  const balanced   = Math.abs(difference) <= 0.01;

  // Mientras no se toque nada, la única línea absorbe el neto (menos los cheques).
  useEffect(() => {
    if (!autoFill) return;
    const rest = round2(netToPay - chequesTotal);
    setPayLines((prev) => {
      if (prev.length !== 1) return prev;
      const amount = rest > 0 ? rest.toFixed(2) : '';
      return prev[0].amount === amount ? prev : [{ ...prev[0], amount }];
    });
  }, [autoFill, netToPay, chequesTotal]);

  const updateLine = (idx: number, patch: Partial<PayLine>) => {
    if ('amount' in patch) setAutoFill(false);
    setPayLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // Solo el efectivo sale de una caja; al pasar a efectivo se propone la primera.
      if (patch.method && patch.method !== 'CASH') next.cashRegisterId = '';
      if (patch.method === 'CASH' && !next.cashRegisterId && cashRegisters[0]) next.cashRegisterId = cashRegisters[0].id;
      return next;
    }));
  };
  const addLine = () => {
    setAutoFill(false);
    // La nueva línea arranca con lo que falta (si falta algo), en transferencia.
    setPayLines((prev) => [...prev, {
      method: 'BANK_TRANSFER', amount: difference > 0 ? difference.toFixed(2) : '',
      cashRegisterId: '', bank: '', reference: '',
    }]);
  };
  const removeLine = (idx: number) => {
    setAutoFill(false);
    setPayLines((prev) => prev.filter((_, i) => i !== idx));
  };
  /** Suma a la línea lo que falta (o le resta lo que sobra) para que cuadre. */
  const completeLine = (idx: number) => {
    const current = Number(payLines[idx]?.amount) || 0;
    const target = round2(current + difference);
    updateLine(idx, { amount: target > 0 ? target.toFixed(2) : '' });
  };

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

    // Cheques endosados / propios (los que haya cargados)
    let chequesEnCartera: string[] | undefined;
    let chequesPropios: CreateOrdenPagoChequePropioDTO[] | undefined;
    {
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

    // Formas de pago: las líneas con importe; tienen que cerrar contra el neto.
    if (payLines.some((l) => l.amount !== '' && !(Number(l.amount) > 0))) {
      toast.error('Cada forma de pago necesita un importe mayor a 0');
      return;
    }
    const payments: CreateOrdenPagoPaymentDTO[] = payLines
      .filter((l) => Number(l.amount) > 0)
      .map((l) => ({
        method: l.method,
        amount: round2(Number(l.amount)),
        cashRegisterId: l.method === 'CASH' ? (l.cashRegisterId || null) : null,
        bank: l.bank || null,
        reference: l.reference.trim() || null,
      }));
    if (payments.length === 0 && !((chequesEnCartera?.length ?? 0) > 0 || (chequesPropios?.length ?? 0) > 0)) {
      toast.error('Cargá al menos una forma de pago');
      return;
    }
    if (!balanced) {
      toast.error(difference > 0
        ? `Faltan ${formatCurrency(difference, effectiveCurrency as any)} para cubrir el neto a pagar`
        : `Las formas de pago superan el neto en ${formatCurrency(-difference, effectiveCurrency as any)}. Si querés pagar de más, cargalo como excedente.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const op = await ordenPagosService.create({
        supplierId,
        date,
        currency: effectiveCurrency as any,
        exchangeRate: showRate ? rate : 1,
        payments,
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
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Error al crear orden de pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tarjetas de la columna izquierda: cada una resume su sección plegada.
  // Columna "Compra" (flujo viejo): solo si alguna factura pendiente la tiene.
  const anyPurchase = invoices.some((inv) => !!inv.purchaseNumber);
  const chequesCount = selectedChequeIds.length + propios.filter((p) => Number(p.amount) > 0).length;
  const ajustesNetTotal = round2(totalIntereses - totalDescuentos);
  const extraTiles: { key: 'retenciones' | 'ajustes' | 'cheques' | 'extra'; label: string; count: number; detail: string; tone: string }[] = [
    {
      key: 'retenciones', label: 'Retenciones',
      count: retenciones.filter((r) => retencionAmount(r) > 0).length,
      detail: totalRetenciones > 0
        ? `${retenciones.filter((r) => retencionAmount(r) > 0).map((r) => r.type).join(' · ')} · − ${formatCurrency(totalRetenciones, effectiveCurrency as any)}`
        : 'Sin retenciones',
      tone: 'text-violet-700 dark:text-violet-400',
    },
    ...(canUseAccounting ? [{
      key: 'ajustes' as const, label: 'Ajustes',
      count: ajustes.filter((a) => Number(a.amount) > 0).length,
      detail: ajustesNetTotal !== 0
        ? `${ajustesNetTotal < 0 ? '−' : '+'} ${formatCurrency(Math.abs(ajustesNetTotal), effectiveCurrency as any)}`
        : 'Sin ajustes',
      tone: ajustesNetTotal < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
    }] : []),
    {
      key: 'cheques', label: 'Cheques',
      count: chequesCount,
      detail: chequesTotal > 0 ? formatCurrency(chequesTotal, effectiveCurrency as any) : 'Endosar o emitir',
      tone: 'text-gray-700 dark:text-slate-300',
    },
    {
      key: 'extra', label: 'Excedente / notas',
      count: (excedenteAmount > 0 ? 1 : 0) + (notes.trim() ? 1 : 0),
      detail: excedenteAmount > 0
        ? `Excedente + ${formatCurrency(excedenteAmount, effectiveCurrency as any)}`
        : notes.trim() ? notes.trim() : 'Pagar de más · observaciones',
      tone: 'text-indigo-700 dark:text-indigo-400',
    },
  ];

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

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
      {/* ── Columna izquierda: proveedor, facturas y extras ── */}
      <div className="space-y-4 min-w-0">
        {/* Proveedor · fecha · moneda (una franja) */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Proveedor *</label>
              <SupplierSearchSelect
                suppliers={suppliers}
                value={supplierId}
                onChange={(id) => setSupplierId(id)}
                placeholder="Seleccionar proveedor…"
                serverSearch
              />
            </div>
            <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Cotización USD → ARS</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
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
              </div>
            )}
          </div>
        </Card>

        {/* Facturas pendientes */}
        <Card>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
              Facturas a pagar
              {invoices.length > 0 && (
                <span className="ml-1.5 font-normal text-gray-500 dark:text-slate-400">· {items.length} de {invoices.length} pendientes</span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">Sin facturas marcadas es un <strong>pago a cuenta</strong>.</p>
          </div>
          {overImputed.length > 0 && (
            <p className="mb-3 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Estás imputando más de lo adeudado. Si querés pagarle de más,{' '}
              <button type="button" onClick={() => setOpenPanel('extra')} className="underline font-medium">cargalo como excedente</button>.
            </p>
          )}

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
            <div className="overflow-auto max-h-[46vh] -mx-1 px-1">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0 z-[1]">
                  <tr>
                    <th className="px-4 py-2 w-8"></th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Factura</th>
                    {anyPurchase && <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Compra</th>}
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
                            <span className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-200 whitespace-nowrap">{inv.number}</span>
                            <span className="whitespace-nowrap text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 px-1 py-0.5 rounded-full">
                              {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                            </span>
                          </div>
                        </td>
                        {anyPurchase && <td className="px-4 py-2.5">
                          {inv.purchaseNumber ? (
                            <>
                              <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{inv.purchaseNumber}</span>
                              {inv.purchaseDate && <span className="text-xs text-gray-400 ml-1.5">{formatDate(inv.purchaseDate)}</span>}
                            </>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>}
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

        {/* Extras plegados: cada tarjeta resume su sección y la abre debajo */}
        <div className={`grid grid-cols-2 gap-3 ${canUseAccounting ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
          {extraTiles.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => togglePanel(t.key)}
              aria-expanded={openPanel === t.key}
              className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                openPanel === t.key
                  ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-900/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-slate-100">
                {t.label}
                {t.count > 0 ? (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">{t.count}</span>
                ) : (
                  <Plus className="w-3.5 h-3.5 text-gray-400" />
                )}
              </span>
              <span className={`block text-xs mt-1 truncate ${t.count > 0 ? t.tone : 'text-gray-500 dark:text-slate-400'}`}>{t.detail}</span>
            </button>
          ))}
        </div>

        {/* Retenciones practicadas en el pago */}
        {openPanel === 'retenciones' && (
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
        )}

        {/* Ajustes: descuentos obtenidos / intereses (plan de cuentas) */}
        {canUseAccounting && openPanel === 'ajustes' && (
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

        {/* Pago con cheques */}
        {openPanel === 'cheques' && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-indigo-500" /> Cheques
              </h3>
              <button
                type="button"
                onClick={() => { setSelectedChequeIds([]); setPropios([]); setOpenPanel(null); }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Quitar cheques
              </button>
            </div>
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

        {/* Excedente: pagarle al proveedor más que lo imputado a las facturas */}
        {openPanel === 'extra' && !isPagoACuenta && items.length > 0 && (
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

        {openPanel === 'extra' && (
          <Card>
            <Input
              label="Notas"
              placeholder="Observaciones opcionales…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {(isPagoACuenta || items.length === 0) && (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">El excedente se habilita al seleccionar facturas.</p>
            )}
          </Card>
        )}

      </div>

      {/* ── Columna derecha: resumen, formas de pago y emitir (fija) ── */}
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-slate-700 space-y-1 text-sm text-gray-600 dark:text-slate-400">
          <div className="flex justify-between gap-3">
            <span>{isPagoACuenta ? 'Pago a cuenta' : `Facturas (${items.length})`}</span>
            <span className="tabular-nums">{formatCurrency(baseAmount, effectiveCurrency as any)}</span>
          </div>
          {totalIntereses > 0 && (
            <div className="flex justify-between gap-3"><span>Intereses</span><span className="tabular-nums text-amber-700 dark:text-amber-400">+ {formatCurrency(totalIntereses, effectiveCurrency as any)}</span></div>
          )}
          {totalDescuentos > 0 && (
            <div className="flex justify-between gap-3"><span>Descuentos</span><span className="tabular-nums text-emerald-700 dark:text-emerald-400">− {formatCurrency(totalDescuentos, effectiveCurrency as any)}</span></div>
          )}
          {excedenteAmount > 0 && (
            <div className="flex justify-between gap-3"><span>Excedente a cuenta</span><span className="tabular-nums text-indigo-600 dark:text-indigo-400">+ {formatCurrency(excedenteAmount, effectiveCurrency as any)}</span></div>
          )}
          {totalRetenciones > 0 && (
            <div className="flex justify-between gap-3"><span>Retenciones</span><span className="tabular-nums text-violet-700 dark:text-violet-400">− {formatCurrency(totalRetenciones, effectiveCurrency as any)}</span></div>
          )}
          <div className="flex justify-between items-end gap-3 pt-1.5">
            <span className="font-semibold text-gray-900 dark:text-white">{totalRetenciones > 0 ? 'Neto a pagar' : 'Total a pagar'}</span>
            <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{formatCurrency(netToPay, effectiveCurrency as any)}</span>
          </div>
          {effectiveCurrency === 'USD' && rate > 0 && (
            <p className="text-xs text-right text-indigo-600 dark:text-indigo-400 tabular-nums">≈ {formatCurrency(arsEquivalent, 'ARS')} · cotiz. {rate.toLocaleString('es-AR')}</p>
          )}
          {!isPagoACuenta && hasUsdInvoice && rate > 0 && (
            <p className="text-[11px] text-right text-gray-400 dark:text-slate-500">Facturas en USD a cotiz. {rate.toLocaleString('es-AR')}</p>
          )}
        </div>

        <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Formas de pago</h3>
            <button type="button" onClick={addLine} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100">
              + Agregar
            </button>
          </div>

          {payLines.map((l, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Medio de pago"
                  value={l.method}
                  onChange={(e) => updateLine(idx, { method: e.target.value as PayMethod })}
                  className="flex-1 min-w-0 border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {LINE_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  aria-label="Importe"
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={l.amount}
                  onChange={(e) => updateLine(idx, { amount: e.target.value })}
                  className="w-32 shrink-0 text-right border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {(payLines.length > 1 || chequesTotal > 0) && (
                  <button type="button" onClick={() => removeLine(idx)} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="Quitar forma de pago">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {l.method === 'CASH' ? (
                <select
                  aria-label="Caja"
                  value={l.cashRegisterId}
                  onChange={(e) => updateLine(idx, { cashRegisterId: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sin caja</option>
                  {cashRegisters.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <BancoSelect value={l.bank} onChange={(v) => updateLine(idx, { bank: v })} />
                  <input
                    aria-label="Referencia / N° operación"
                    value={l.reference}
                    onChange={(e) => updateLine(idx, { reference: e.target.value })}
                    placeholder="N° operación"
                    className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {!balanced && idx === payLines.length - 1 && (
                <button type="button" onClick={() => completeLine(idx)} className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                  {difference > 0 ? `Sumar lo que falta (${formatCurrency(difference, effectiveCurrency as any)})` : `Restar lo que sobra (${formatCurrency(-difference, effectiveCurrency as any)})`}
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => togglePanel('cheques')}
            className="w-full flex items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 px-2.5 py-2 text-sm hover:border-indigo-300"
          >
            <span className="flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
              <Wallet className="w-4 h-4 text-indigo-500" />
              {chequesTotal > 0 ? `Cheques (${chequesCount})` : 'Pagar con cheques'}
            </span>
            {chequesTotal > 0
              ? <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatCurrency(chequesTotal, effectiveCurrency as any)}</span>
              : <span className="text-xs text-indigo-600 dark:text-indigo-400">Elegir</span>}
          </button>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 space-y-2.5">
          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            balanced ? 'bg-emerald-50 dark:bg-emerald-900/20' : difference > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20'
          }`}>
            <span className="text-gray-600 dark:text-slate-300">Asignado <b className="tabular-nums text-gray-900 dark:text-white">{formatCurrency(assigned, effectiveCurrency as any)}</b></span>
            {balanced ? (
              <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Cuadra</span>
            ) : (
              <span className={`flex items-center gap-1 font-bold tabular-nums ${difference > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                <AlertTriangle className="w-4 h-4" />
                {difference > 0 ? 'Falta ' : 'Sobra '}{formatCurrency(Math.abs(difference), effectiveCurrency as any)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={() => navigate('/orden-pagos')}>Cancelar</Button>
            <Button type="submit" className="flex-1" isLoading={isSubmitting} disabled={!balanced || netToPay <= 0}>
              Emitir Orden de Pago
            </Button>
          </div>
        </div>
      </aside>
      </form>
    </div>
  );
}
