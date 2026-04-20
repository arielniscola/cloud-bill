import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, RefreshCw, Users, Package, UserCheck, FileText, ClipboardList, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Select } from '../../components/ui';
import { PageHeader, CustomerSearchSelect } from '../../components/shared';
import { invoicesService, reportsService, usersService, customersService, ordenPedidosService } from '../../services';
import type { ByProductRow } from '../../services/reports.service';
import { formatCurrency, formatDate, formatCuit } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_TYPE_OPTIONS,
  INVOICE_STATUSES,
  INVOICE_STATUS_OPTIONS,
  CURRENCY_OPTIONS,
} from '../../utils/constants';
import type { Invoice, InvoiceStatus, InvoiceType, Currency, Customer } from '../../types';
import type { OrdenPedido } from '../../types/orden-pedido.types';
import type { UserDTO } from '../../services/users.service';

// ── Types ──────────────────────────────────────────────────────────────────
type DataSource = 'invoices' | 'op';
type ViewTab    = 'list' | 'by-customer' | 'by-seller' | 'by-product';

interface ByCustomerRow {
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  count: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface BySellerRow {
  userId: string;
  sellerName: string;
  count: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

const OP_STATUSES: Record<string, string> = {
  DRAFT: 'Borrador', CONFIRMED: 'Confirmado', PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagado', CANCELLED: 'Cancelado', CONVERTED: 'Convertido',
};
const OP_STATUS_OPTIONS = Object.entries(OP_STATUSES).map(([value, label]) => ({ value, label }));

type OPStatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
const OP_STATUS_VARIANT: Record<string, OPStatusVariant> = {
  DRAFT: 'default', CONFIRMED: 'info', PARTIALLY_PAID: 'warning',
  PAID: 'success', CANCELLED: 'error', CONVERTED: 'default',
};

// ── Helpers ────────────────────────────────────────────────────────────────
const today           = new Date().toISOString().substring(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString().substring(0, 10);

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default', ISSUED: 'info', PAID: 'success', CANCELLED: 'error', PARTIALLY_PAID: 'warning',
};

function signedInvoice(inv: Invoice) {
  const sign = inv.type.startsWith('NOTA_CREDITO') ? -1 : 1;
  return {
    subtotal:  Number(inv.subtotal)  * sign,
    taxAmount: Number(inv.taxAmount) * sign,
    total:     Number(inv.total)     * sign,
  };
}

import { exportToExcel } from '../../utils/excelExport';

// ── Source selector ─────────────────────────────────────────────────────────
function SourceSelector({ value, onChange }: { value: DataSource; onChange: (v: DataSource) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-slate-700 rounded-xl w-fit">
      {([
        { key: 'invoices' as DataSource, icon: FileText,     label: 'Facturas'          },
        { key: 'op'       as DataSource, icon: ClipboardList, label: 'Órdenes de Pedido' },
      ] as const).map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-150 whitespace-nowrap',
            value === key
              ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────
function TabBtn({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-150 whitespace-nowrap',
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── Summary strip ──────────────────────────────────────────────────────────
function SummaryStrip({ count, countLabel, subtotal, taxAmount, total, hasMixed }: {
  count: number; countLabel: string;
  subtotal: number; taxAmount: number; total: number; hasMixed?: boolean;
}) {
  const cards = [
    { label: countLabel,    value: count,    isCurrency: false },
    { label: 'Subtotal',    value: subtotal, isCurrency: true  },
    { label: 'IVA',         value: taxAmount,isCurrency: true  },
    { label: 'Total neto',  value: total,    isCurrency: true, accent: true },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      {cards.map((c) => (
        <div key={c.label} className={clsx(
          'border rounded-xl p-4',
          c.accent
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800'
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
        )}>
          <p className={clsx(
            'text-xs font-semibold uppercase tracking-wider mb-1',
            c.accent ? 'text-indigo-400' : 'text-gray-400 dark:text-slate-500'
          )}>{c.label}</p>
          <p className={clsx(
            'text-2xl font-bold tabular-nums',
            c.accent ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'
          )}>
            {c.isCurrency ? formatCurrency(c.value as number) : (c.value as number).toLocaleString('es-AR')}
          </p>
          {c.accent && hasMixed && (
            <p className="text-xs text-amber-500 mt-0.5">Monedas mixtas</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Table shell ────────────────────────────────────────────────────────────
function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50/80 dark:bg-slate-700/50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <tr key={i}>{[...Array(cols)].map((_, j) => (
          <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded animate-pulse" /></td>
        ))}</tr>
      ))}
    </>
  );
}

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return <tr><td colSpan={cols} className="px-4 py-12 text-center text-sm text-gray-400">{message}</td></tr>;
}

const BADGE_CLASS: Record<StatusVariant | OPStatusVariant, string> = {
  default: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  error:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

// ── Main page ──────────────────────────────────────────────────────────────
export default function SalesReportPage() {
  const navigate = useNavigate();
  const [source, setSource]             = useState<DataSource>('invoices');
  const [tab, setTab]                   = useState<ViewTab>('list');

  const [invoices, setInvoices]         = useState<Invoice[]>([]);
  const [byProduct, setByProduct]       = useState<ByProductRow[]>([]);
  const [ordenPedidos, setOrdenPedidos] = useState<OrdenPedido[]>([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [isLoadingProd, setLoadingProd] = useState(false);
  const [isLoadingOP, setLoadingOP]     = useState(false);

  const [users, setUsers]               = useState<UserDTO[]>([]);
  const [customers, setCustomers]       = useState<Customer[]>([]);

  // Filters shared
  const [dateFrom,       setDateFrom]       = useState(firstDayOfMonth);
  const [dateTo,         setDateTo]         = useState(today);
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [customerId,     setCustomerId]     = useState('');
  const [userId,         setUserId]         = useState('');
  // Invoice-only filters
  const [typeFilter,    setTypeFilter]    = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  // OP-only filters
  const [opStatusFilter, setOpStatus]     = useState('');

  useEffect(() => {
    usersService.getAll().then(setUsers).catch(() => null);
    customersService.getAll({ limit: 500 }).then((r) => setCustomers(r.data)).catch(() => null);
  }, []);

  const invoiceFilters = {
    dateFrom:   dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
    dateTo:     dateTo   ? `${dateTo}T23:59:59.999Z`   : undefined,
    type:       (typeFilter || undefined) as InvoiceType | undefined,
    status:     (statusFilter || undefined) as InvoiceStatus | undefined,
    currency:   (currencyFilter || undefined) as Currency | undefined,
    customerId: customerId     || undefined,
    userId:     userId         || undefined,
  };

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const data = await invoicesService.getAll({ limit: 10000, ...invoiceFilters });
      setInvoices(data.data);
    } catch { toast.error('Error al cargar el reporte'); }
    finally   { setIsLoading(false); }
  };

  const fetchByProduct = async () => {
    setLoadingProd(true);
    try {
      const data = await reportsService.salesByProduct(invoiceFilters);
      setByProduct(data);
    } catch { toast.error('Error al cargar reporte por producto'); }
    finally   { setLoadingProd(false); }
  };

  const fetchOrdenPedidos = async () => {
    setLoadingOP(true);
    try {
      const data = await ordenPedidosService.getAll({
        limit:      10000,
        dateFrom:   dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
        dateTo:     dateTo   ? `${dateTo}T23:59:59.999Z`   : undefined,
        currency:   currencyFilter  || undefined,
        customerId: customerId      || undefined,
        status:     opStatusFilter  || undefined,
      });
      setOrdenPedidos(data.data);
    } catch { toast.error('Error al cargar órdenes de pedido'); }
    finally   { setLoadingOP(false); }
  };

  const handleSearch = () => {
    if (source === 'op') {
      fetchOrdenPedidos();
      // no separate by-product call for OPs
    } else if (tab === 'by-product') {
      fetchByProduct();
    } else {
      fetchInvoices();
    }
  };

  // Auto-load on source/tab change
  useEffect(() => {
    if (source === 'op') {
      if (ordenPedidos.length === 0) fetchOrdenPedidos();
    } else if (tab === 'by-product') {
      if (byProduct.length === 0) fetchByProduct();
    } else {
      if (invoices.length === 0) fetchInvoices();
    }
  }, [source, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount
  useEffect(() => { fetchInvoices(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Aggregations from invoices ───────────────────────────────────────────
  const activeInv = invoices.filter((i) => i.status !== 'CANCELLED');

  const invTotals = useMemo(() => activeInv.reduce(
    (acc, inv) => {
      const s = signedInvoice(inv);
      return { subtotal: acc.subtotal + s.subtotal, taxAmount: acc.taxAmount + s.taxAmount, total: acc.total + s.total };
    },
    { subtotal: 0, taxAmount: 0, total: 0 }
  ), [activeInv]);

  const hasMixed = invoices.length > 0 && new Set(invoices.map((i) => i.currency)).size > 1;

  const byCustomerInv = useMemo<ByCustomerRow[]>(() => {
    const map = new Map<string, ByCustomerRow>();
    for (const inv of activeInv) {
      const { subtotal, taxAmount, total } = signedInvoice(inv);
      const ex = map.get(inv.customerId);
      if (ex) { ex.count++; ex.subtotal += subtotal; ex.taxAmount += taxAmount; ex.total += total; }
      else map.set(inv.customerId, { customerId: inv.customerId, customerName: inv.customer?.name ?? inv.customerId, customerTaxId: inv.customer?.taxId ?? null, count: 1, subtotal, taxAmount, total });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeInv]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const bySellerInv = useMemo<BySellerRow[]>(() => {
    const map = new Map<string, BySellerRow>();
    for (const inv of activeInv) {
      const { subtotal, taxAmount, total } = signedInvoice(inv);
      const ex = map.get(inv.userId);
      if (ex) { ex.count++; ex.subtotal += subtotal; ex.taxAmount += taxAmount; ex.total += total; }
      else map.set(inv.userId, { userId: inv.userId, sellerName: userMap.get(inv.userId) ?? (inv.user?.name ?? 'Usuario'), count: 1, subtotal, taxAmount, total });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeInv, userMap]);

  const byProductTotals = useMemo(() => byProduct.reduce(
    (acc, r) => ({ subtotal: acc.subtotal + r.subtotal, taxAmount: acc.taxAmount + r.taxAmount, total: acc.total + r.total }),
    { subtotal: 0, taxAmount: 0, total: 0 }
  ), [byProduct]);

  // ── Aggregations from OPs ────────────────────────────────────────────────
  const activeOP = ordenPedidos.filter((op) => op.status !== 'CANCELLED');

  const opTotals = useMemo(() => activeOP.reduce(
    (acc, op) => ({ subtotal: acc.subtotal + Number(op.subtotal), taxAmount: acc.taxAmount + Number(op.taxAmount), total: acc.total + Number(op.total) }),
    { subtotal: 0, taxAmount: 0, total: 0 }
  ), [activeOP]);

  const byCustomerOP = useMemo<ByCustomerRow[]>(() => {
    const map = new Map<string, ByCustomerRow>();
    for (const op of activeOP) {
      if (!op.customerId) continue;
      const subtotal = Number(op.subtotal), taxAmount = Number(op.taxAmount), total = Number(op.total);
      const ex = map.get(op.customerId);
      if (ex) { ex.count++; ex.subtotal += subtotal; ex.taxAmount += taxAmount; ex.total += total; }
      else map.set(op.customerId, { customerId: op.customerId, customerName: op.customer?.name ?? op.customerId, customerTaxId: op.customer?.taxId ?? null, count: 1, subtotal, taxAmount, total });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeOP]);

  const bySellerOP = useMemo<BySellerRow[]>(() => {
    const map = new Map<string, BySellerRow>();
    for (const op of activeOP) {
      const subtotal = Number(op.subtotal), taxAmount = Number(op.taxAmount), total = Number(op.total);
      const ex = map.get(op.userId);
      if (ex) { ex.count++; ex.subtotal += subtotal; ex.taxAmount += taxAmount; ex.total += total; }
      else map.set(op.userId, { userId: op.userId, sellerName: userMap.get(op.userId) ?? (op.user?.name ?? 'Usuario'), count: 1, subtotal, taxAmount, total });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeOP, userMap]);

  // ── Resolved values based on source ─────────────────────────────────────
  const isOP     = source === 'op';
  const totals   = isOP ? opTotals   : invTotals;
  const byCustomer = isOP ? byCustomerOP : byCustomerInv;
  const bySeller   = isOP ? bySellerOP   : bySellerInv;
  const loading    = isOP ? isLoadingOP : (tab === 'by-product' ? isLoadingProd : isLoading);
  const listCount  = isOP ? ordenPedidos.length : invoices.length;

  // ── Export ────────────────────────────────────────────────────────────────
  const exportList = () => {
    if (isOP) {
      exportToExcel(`ordenes-pedido-${today}`, 'Órdenes de Pedido', [
        { header: 'Número',     key: 'number',       width: 16 },
        { header: 'Fecha',      key: 'date',         width: 12 },
        { header: 'Cliente',    key: 'customerName', width: 26 },
        { header: 'CUIT',       key: 'taxId',        width: 16 },
        { header: 'Condición',  key: 'condition',    width: 16 },
        { header: 'Subtotal',   key: 'subtotal',     width: 14, format: 'currency' as const },
        { header: 'IVA',        key: 'taxAmount',    width: 14, format: 'currency' as const },
        { header: 'Total',      key: 'total',        width: 14, format: 'currency' as const },
        { header: 'Moneda',     key: 'currency',     width: 8  },
        { header: 'Estado',     key: 'statusLabel',  width: 14 },
      ], ordenPedidos.map((op) => ({
        number:       op.number,
        date:         op.date.substring(0, 10),
        customerName: op.customer?.name ?? '',
        taxId:        op.customer?.taxId ?? '',
        condition:    op.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado',
        subtotal:     Number(op.subtotal),
        taxAmount:    Number(op.taxAmount),
        total:        Number(op.total),
        currency:     op.currency,
        statusLabel:  OP_STATUSES[op.status] ?? op.status,
      })));
    } else {
      exportToExcel(`ventas-comprobantes-${today}`, 'Ventas', [
        { header: 'Número',     key: 'number',       width: 16 },
        { header: 'Fecha',      key: 'date',         width: 12 },
        { header: 'Tipo',       key: 'typeLabel',    width: 20 },
        { header: 'Cliente',    key: 'customerName', width: 26 },
        { header: 'CUIT',       key: 'taxId',        width: 16 },
        { header: 'Condición',  key: 'condition',    width: 16 },
        { header: 'Subtotal',   key: 'subtotal',     width: 14, format: 'currency' as const },
        { header: 'IVA',        key: 'taxAmount',    width: 14, format: 'currency' as const },
        { header: 'Total',      key: 'total',        width: 14, format: 'currency' as const },
        { header: 'Moneda',     key: 'currency',     width: 8  },
        { header: 'Estado',     key: 'statusLabel',  width: 14 },
      ], invoices.map((inv) => ({
        number:       inv.number,
        date:         inv.date.substring(0, 10),
        typeLabel:    INVOICE_TYPES[inv.type] ?? inv.type,
        customerName: inv.customer?.name ?? '',
        taxId:        inv.customer?.taxId ?? '',
        condition:    inv.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado',
        subtotal:     Number(inv.subtotal),
        taxAmount:    Number(inv.taxAmount),
        total:        Number(inv.total),
        currency:     inv.currency,
        statusLabel:  INVOICE_STATUSES[inv.status] ?? inv.status,
      })));
    }
  };

  const exportByCustomerCsv = () => exportToExcel(`ventas-por-cliente-${today}`, 'Por cliente', [
    { header: 'Cliente',       key: 'customerName', width: 26 },
    { header: 'CUIT',          key: 'customerTaxId',width: 16 },
    { header: '# Documentos',  key: 'count',        width: 12 },
    { header: 'Subtotal',      key: 'subtotal',     width: 14, format: 'currency' as const },
    { header: 'IVA',           key: 'taxAmount',    width: 14, format: 'currency' as const },
    { header: 'Total',         key: 'total',        width: 14, format: 'currency' as const },
  ], byCustomer);

  const exportBySellerCsv = () => exportToExcel(`ventas-por-vendedor-${today}`, 'Por vendedor', [
    { header: 'Vendedor',      key: 'sellerName',   width: 24 },
    { header: '# Documentos',  key: 'count',        width: 12 },
    { header: 'Subtotal',      key: 'subtotal',     width: 14, format: 'currency' as const },
    { header: 'IVA',           key: 'taxAmount',    width: 14, format: 'currency' as const },
    { header: 'Total',         key: 'total',        width: 14, format: 'currency' as const },
  ], bySeller);

  const exportByProductCsv = () => exportToExcel(`ventas-por-producto-${today}`, 'Por producto', [
    { header: 'SKU',           key: 'productSku',   width: 14 },
    { header: 'Producto',      key: 'productName',  width: 28 },
    { header: '# Comp.',       key: 'invoiceCount', width: 10 },
    { header: 'Cantidad',      key: 'quantity',     width: 10, format: 'number' as const },
    { header: 'Precio Prom.',  key: 'unitPriceAvg', width: 14, format: 'currency' as const },
    { header: 'Subtotal',      key: 'subtotal',     width: 14, format: 'currency' as const },
    { header: 'IVA',           key: 'taxAmount',    width: 14, format: 'currency' as const },
    { header: 'Total',         key: 'total',        width: 14, format: 'currency' as const },
  ], byProduct);

  const handleExport = () => {
    if (tab === 'list')        exportList();
    if (tab === 'by-customer') exportByCustomerCsv();
    if (tab === 'by-seller')   exportBySellerCsv();
    if (tab === 'by-product')  exportByProductCsv();
  };

  const exportDisabled = loading || (
    tab === 'list'        ? listCount === 0 :
    tab === 'by-customer' ? byCustomer.length === 0 :
    tab === 'by-seller'   ? bySeller.length === 0 :
    byProduct.length === 0
  );

  return (
    <div>
      <PageHeader
        title="Reporte de Ventas"
        subtitle={loading ? 'Cargando…' : `${listCount} documento${listCount !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Reportes
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={exportDisabled}>
              <FileDown className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        }
      />

      {/* ── Source selector ────────────────────────────────────────────── */}
      <div className="mb-5">
        <SourceSelector value={source} onChange={(s) => { setSource(s); setTab('list'); }} />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 mb-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {!isOP && (
            <Select label="Tipo" options={[{ value: '', label: 'Todos' }, ...INVOICE_TYPE_OPTIONS]}
              value={typeFilter} onChange={setTypeFilter} />
          )}

          <Select
            label="Estado"
            options={isOP
              ? [{ value: '', label: 'Todos' }, ...OP_STATUS_OPTIONS]
              : [{ value: '', label: 'Todos' }, ...INVOICE_STATUS_OPTIONS]
            }
            value={isOP ? opStatusFilter : statusFilter}
            onChange={isOP ? setOpStatus : setStatusFilter}
          />

          <Select label="Moneda" options={[{ value: '', label: 'Todas' }, ...CURRENCY_OPTIONS]}
            value={currencyFilter} onChange={setCurrencyFilter} />

          <Button onClick={handleSearch} isLoading={loading} className="self-end">
            <RefreshCw className="w-4 h-4 mr-2" />
            Buscar
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end pt-1 border-t border-gray-100 dark:border-slate-700">
          <div className="min-w-[220px]">
            <CustomerSearchSelect
              label="Cliente"
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              clearLabel="Todos los clientes"
            />
          </div>

          {users.length > 0 && (
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Vendedor</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todos</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── View tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-5 bg-gray-100 dark:bg-slate-800 p-1.5 rounded-xl w-fit">
        <TabBtn icon={isOP ? ClipboardList : FileText} label={isOP ? 'Órdenes'  : 'Comprobantes'} active={tab === 'list'}        onClick={() => setTab('list')}        />
        <TabBtn icon={Users}                           label="Por Cliente"                         active={tab === 'by-customer'} onClick={() => setTab('by-customer')} />
        <TabBtn icon={UserCheck}                       label="Por Vendedor"                        active={tab === 'by-seller'}   onClick={() => setTab('by-seller')}   />
        {!isOP && (
          <TabBtn icon={Package} label="Por Producto" active={tab === 'by-product'} onClick={() => setTab('by-product')} />
        )}
      </div>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <SummaryStrip
          count={listCount} countLabel={isOP ? 'Órdenes' : 'Comprobantes'}
          subtotal={totals.subtotal} taxAmount={totals.taxAmount} total={totals.total}
          hasMixed={!isOP && hasMixed}
        />
      )}
      {tab === 'by-customer' && (
        <SummaryStrip count={byCustomer.length} countLabel="Clientes" {...totals} />
      )}
      {tab === 'by-seller' && (
        <SummaryStrip count={bySeller.length} countLabel="Vendedores" {...totals} />
      )}
      {tab === 'by-product' && !isOP && (
        <SummaryStrip count={byProduct.length} countLabel="Productos" {...byProductTotals} />
      )}

      {/* ── TAB: Lista de comprobantes ──────────────────────────────────── */}
      {tab === 'list' && !isOP && (
        <ReportTable headers={['Número','Fecha','Tipo','Cliente','Cond.','Subtotal','IVA','Total','Mon.','Estado']}>
          {isLoading ? <SkeletonRows cols={10} /> :
           invoices.length === 0 ? <EmptyRow cols={10} message="Sin comprobantes" /> : (
            invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-700 dark:text-slate-300 whitespace-nowrap">{inv.number}</td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(inv.date)}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{INVOICE_TYPES[inv.type] ?? inv.type}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 max-w-[160px] truncate">{inv.customer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{inv.saleCondition === 'CUENTA_CORRIENTE' ? 'Cta. Cte.' : 'Contado'}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(inv.subtotal), inv.currency)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-500 whitespace-nowrap">{formatCurrency(Number(inv.taxAmount), inv.currency)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(inv.total), inv.currency)}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-400 whitespace-nowrap">{inv.currency}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', BADGE_CLASS[STATUS_VARIANT[inv.status] ?? 'default'])}>
                    {INVOICE_STATUSES[inv.status] ?? inv.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </ReportTable>
      )}

      {/* ── TAB: Lista de Órdenes de Pedido ─────────────────────────────── */}
      {tab === 'list' && isOP && (
        <ReportTable headers={['Número','Fecha','Cliente','CUIT','Condición','Subtotal','IVA','Total','Mon.','Estado']}>
          {isLoadingOP ? <SkeletonRows cols={10} /> :
           ordenPedidos.length === 0 ? <EmptyRow cols={10} message="Sin órdenes de pedido para los filtros seleccionados" /> : (
            ordenPedidos.map((op) => (
              <tr key={op.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-700 dark:text-slate-300 whitespace-nowrap">{op.number}</td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(op.date)}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 max-w-[160px] truncate">{op.customer?.name ?? <span className="text-gray-400 italic">Sin cliente</span>}</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-400 whitespace-nowrap">{formatCuit(op.customer?.taxId) || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{op.saleCondition === 'CUENTA_CORRIENTE' ? 'Cta. Cte.' : 'Contado'}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(op.subtotal), op.currency)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-500 whitespace-nowrap">{formatCurrency(Number(op.taxAmount), op.currency)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(op.total), op.currency)}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-400 whitespace-nowrap">{op.currency}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', BADGE_CLASS[OP_STATUS_VARIANT[op.status] ?? 'default'])}>
                    {OP_STATUSES[op.status] ?? op.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </ReportTable>
      )}

      {/* ── TAB: Por Cliente ─────────────────────────────────────────────── */}
      {tab === 'by-customer' && (
        <ReportTable headers={['Cliente','CUIT','# Docs.','Subtotal','IVA','Total']}>
          {loading ? <SkeletonRows cols={6} rows={6} /> :
           byCustomer.length === 0 ? <EmptyRow cols={6} message="Sin datos" /> : (
            byCustomer.map((r) => (
              <tr key={r.customerId} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{r.customerName}</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-400 dark:text-slate-500">{r.customerTaxId ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-center tabular-nums font-semibold text-gray-700 dark:text-slate-300">{r.count}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(r.subtotal)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-500">{formatCurrency(r.taxAmount)}</td>
                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-gray-900 dark:text-white">{formatCurrency(r.total)}</td>
              </tr>
            ))
          )}
        </ReportTable>
      )}

      {/* ── TAB: Por Vendedor ────────────────────────────────────────────── */}
      {tab === 'by-seller' && (
        <ReportTable headers={['Vendedor','# Docs.','Subtotal','IVA','Total']}>
          {loading ? <SkeletonRows cols={5} rows={4} /> :
           bySeller.length === 0 ? <EmptyRow cols={5} message="Sin datos" /> : (
            bySeller.map((r) => (
              <tr key={r.userId} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{r.sellerName}</td>
                <td className="px-4 py-3 text-sm text-center tabular-nums font-semibold text-gray-700 dark:text-slate-300">{r.count}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(r.subtotal)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-500">{formatCurrency(r.taxAmount)}</td>
                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-gray-900 dark:text-white">{formatCurrency(r.total)}</td>
              </tr>
            ))
          )}
        </ReportTable>
      )}

      {/* ── TAB: Por Producto (facturas only) ────────────────────────────── */}
      {tab === 'by-product' && !isOP && (
        <ReportTable headers={['SKU','Producto','# Comp.','Cantidad','Precio prom.','Subtotal','IVA','Total']}>
          {isLoadingProd ? <SkeletonRows cols={8} /> :
           byProduct.length === 0 ? <EmptyRow cols={8} message="Sin datos para el período seleccionado" /> : (
            byProduct.map((r) => (
              <tr key={r.productId} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-4 py-3 text-xs font-mono text-gray-400 dark:text-slate-500 whitespace-nowrap">{r.productSku}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{r.productName}</td>
                <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-600 dark:text-slate-400">{r.invoiceCount}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-slate-400">{r.quantity.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-500">{formatCurrency(r.unitPriceAvg)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(r.subtotal)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-500">{formatCurrency(r.taxAmount)}</td>
                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-gray-900 dark:text-white">{formatCurrency(r.total)}</td>
              </tr>
            ))
          )}
        </ReportTable>
      )}

      {!loading && (
        <p className="text-xs text-gray-400 dark:text-slate-500 text-right mt-3">
          {tab === 'by-product' ? `${byProduct.length} producto${byProduct.length !== 1 ? 's' : ''}` :
           tab === 'list'       ? `${listCount} documento${listCount !== 1 ? 's' : ''}` :
           tab === 'by-customer'? `${byCustomer.length} cliente${byCustomer.length !== 1 ? 's' : ''}` :
                                  `${bySeller.length} vendedor${bySeller.length !== 1 ? 'es' : ''}`}
          {tab === 'list' && !isOP && invoices.length === 10000 && ' · Límite alcanzado — refiná los filtros'}
        </p>
      )}
    </div>
  );
}
