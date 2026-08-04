import { X, Truck, Calendar, Hash, CreditCard, FileText, Package, Receipt, ArrowUpRight } from 'lucide-react';
import { formatCurrency, formatDate, formatCuit } from '../../utils/formatters';
import { INVOICE_TYPES, SALE_CONDITIONS } from '../../utils/constants';
import type { PurchaseInvoice } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  PENDING:        'Pendiente',
  PARTIALLY_PAID: 'Pago parcial',
  PAID:           'Pagada',
};

const STATUS_DOT: Record<string, string> = {
  PENDING:        'bg-amber-500',
  PARTIALLY_PAID: 'bg-blue-500',
  PAID:           'bg-emerald-500',
};

const STATUS_CLASS: Record<string, string> = {
  PENDING:        'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  PARTIALLY_PAID: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  PAID:           'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Transferencia bancaria',
  CASH:          'Efectivo',
  CHECK:         'Cheque',
  CARD:          'Tarjeta',
  OTHER:         'Otro',
};

const TRIBUTO_LABELS: Record<string, string> = {
  PERCEPCION_IVA:     'Percepción IVA',
  PERCEPCION_IIBB:    'Percepción IIBB',
  IMPUESTOS_INTERNOS: 'Imp. internos',
  OTRO:               'Otro tributo',
};

interface Props {
  invoice: PurchaseInvoice;
  onClose: () => void;
  onGenerateRemito?: (invoice: PurchaseInvoice) => void;
}

export function PurchaseInvoiceDetailModal({ invoice, onClose, onGenerateRemito }: Props) {
  const currency = invoice.currency || 'ARS';
  const items = invoice.items ?? [];
  const tributos = invoice.tributos ?? [];
  const remitos = invoice.remitos ?? [];

  const totalTributos    = tributos.reduce((s, t) => s + Number(t.amount), 0);
  const paid             = Number(invoice.paidAmount ?? 0);
  const hasPaid          = invoice.paidAmount !== undefined;
  const saldo            = Number(invoice.amount) - paid;

  const isForeign = currency !== 'ARS' && Number(invoice.exchangeRate) > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden
          bg-white dark:bg-slate-800 rounded-2xl
          border border-slate-200/60 dark:border-slate-700/60
          shadow-[0_25px_50px_-12px_rgba(15,23,42,0.15)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]
          animate-[modalIn_0.25s_ease-out]"
        style={{ animationFillMode: 'both' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-700/50">
          <div className="px-7 py-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                <Receipt className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
                  Detalle de factura de compra
                </h3>
                <p className="text-sm text-zinc-500 dark:text-slate-400 mt-0.5 font-mono tracking-wide">
                  {invoice.number}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-1 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-200
                hover:bg-zinc-100 dark:hover:bg-slate-700/50 transition-all duration-200 active:scale-95"
            >
              <X className="w-4.5 h-4.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto max-h-[calc(88vh-80px)] overscroll-contain">
          <div className="px-7 py-6 space-y-6">

            {/* Status + type strip */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_CLASS[invoice.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[invoice.status] ?? 'bg-zinc-400'}`} />
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                {INVOICE_TYPES[invoice.type as keyof typeof INVOICE_TYPES] || invoice.type}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                {SALE_CONDITIONS[invoice.saleCondition as keyof typeof SALE_CONDITIONS] ?? invoice.saleCondition}
              </span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <InfoField icon={<Truck className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Proveedor" value={invoice.supplier?.name ?? '—'} />
              <InfoField label="CUIT" value={formatCuit(invoice.supplier?.cuit ?? '') || '—'} mono />
              <InfoField icon={<Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Fecha" value={formatDate(invoice.date)} />
              {invoice.dueDate && (
                <InfoField icon={<Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Vencimiento" value={formatDate(invoice.dueDate)} />
              )}
              {invoice.imputationDate && (
                <InfoField label="Fecha imputación" value={formatDate(invoice.imputationDate)} />
              )}
              <InfoField icon={<CreditCard className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Método de pago" value={PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod} />
              <InfoField label="Moneda" value={currency} />
              {isForeign && (
                <InfoField label="Cotización" value={Number(invoice.exchangeRate).toLocaleString('es-AR')} mono />
              )}
              {invoice.originInvoice && (
                <InfoField icon={<Hash className="w-3.5 h-3.5" strokeWidth={1.5} />} label="Comprobante origen" value={invoice.originInvoice.number} mono />
              )}
            </div>

            {/* Items */}
            {items.length > 0 && (
              <>
                <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-3">Ítems del comprobante</p>
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-700/30">
                          <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Descripción</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Cant.</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">P. Unit.</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">IVA</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                        {items.map((item) => (
                          <tr key={item.id} className="group">
                            <td className="px-4 py-2.5 text-zinc-800 dark:text-slate-200">{item.description}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-zinc-500 dark:text-slate-400 tabular-nums">{Number(item.quantity)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-zinc-500 dark:text-slate-400 tabular-nums">{formatCurrency(Number(item.unitPrice), currency)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-zinc-400 dark:text-slate-500 tabular-nums">{Number(item.taxRate)}%</td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium text-zinc-800 dark:text-slate-200 tabular-nums">{formatCurrency(Number(item.total), currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Otros tributos */}
            {tributos.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-2">Otros tributos</p>
                <div className="space-y-1.5">
                  {tributos.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-slate-400">
                        {TRIBUTO_LABELS[t.type] ?? t.type}
                        {t.jurisdiction ? ` (${t.jurisdiction})` : ''}
                        {t.description ? ` — ${t.description}` : ''}
                      </span>
                      <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(Number(t.amount), currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remitos vinculados */}
            {remitos.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-2">Remitos vinculados</p>
                <div className="flex flex-wrap gap-2">
                  {remitos.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                      <Package className="w-3 h-3" strokeWidth={1.5} />
                      {r.number}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="rounded-xl bg-slate-50/70 dark:bg-slate-700/20 border border-slate-200/60 dark:border-slate-700/40 p-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-slate-400">Neto Gravado</span>
                  <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(Number(invoice.subtotal), currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-slate-400">IVA</span>
                  <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(Number(invoice.taxAmount), currency)}</span>
                </div>
                {totalTributos > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-slate-400">Otros tributos</span>
                    <span className="font-mono tabular-nums text-zinc-700 dark:text-slate-300">{formatCurrency(totalTributos, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-600/50">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-slate-200">Total comprobante</span>
                  <span className="text-lg font-bold font-mono tabular-nums tracking-tight text-zinc-900 dark:text-white">{formatCurrency(Number(invoice.amount), currency)}</span>
                </div>
                {hasPaid && (
                  <div className="flex justify-between text-sm pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-600/50">
                    <span className="text-zinc-500 dark:text-slate-400">Pagado</span>
                    <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(paid, currency)}</span>
                  </div>
                )}
                {hasPaid && saldo > 0.005 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-slate-400">Saldo pendiente</span>
                    <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(saldo, currency)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="flex items-start gap-2 text-sm text-zinc-600 dark:text-slate-400">
                <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-400" strokeWidth={1.5} />
                <p className="leading-relaxed">{invoice.notes}</p>
              </div>
            )}

            {/* CTA — registrar mercadería */}
            {onGenerateRemito && (
              <button
                onClick={() => onGenerateRemito(invoice)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                  rounded-xl text-sm font-medium
                  text-indigo-600 dark:text-indigo-400
                  bg-indigo-50/60 dark:bg-indigo-500/10
                  border border-indigo-200/60 dark:border-indigo-500/20
                  hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20
                  active:scale-[0.98] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                Registrar mercadería (remito de compra)
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal entrance animation */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function InfoField({ label, value, mono, icon }: { label: string; value: React.ReactNode; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-slate-500 mb-1">
        {icon}
        {label}
      </p>
      <p className={`text-sm text-zinc-800 dark:text-slate-200 truncate ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</p>
    </div>
  );
}
