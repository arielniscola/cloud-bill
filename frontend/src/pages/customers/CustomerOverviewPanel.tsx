import { Link } from 'react-router-dom';
import { AlertTriangle, Wallet, TrendingUp } from 'lucide-react';
import { MonthlyBarChart } from '../../components/shared';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import type { CustomerOverview } from '../../types';

// Antigüedad de lo impago: escala de un solo tono, de lo que no venció (neutro)
// a lo más viejo (más oscuro). Cada tramo lleva su etiqueta e importe.
const BUCKETS = [
  { key: 'notDue',  label: 'A vencer',   cls: 'bg-slate-300 dark:bg-slate-500' },
  { key: 'd0_30',   label: '1-30 días',  cls: 'bg-rose-200 dark:bg-rose-300' },
  { key: 'd31_60',  label: '31-60 días', cls: 'bg-rose-300 dark:bg-rose-400' },
  { key: 'd61_90',  label: '61-90 días', cls: 'bg-rose-500 dark:bg-rose-500' },
  { key: 'd90plus', label: '+90 días',   cls: 'bg-rose-700 dark:bg-rose-600' },
] as const;

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-semibold tabular-nums truncate ${tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{hint}</p>}
    </div>
  );
}

/**
 * Cabecera de la ficha del cliente: cuánto debe y desde cuándo, cómo paga, y
 * cuánto y qué compra. Las deudas en dólares se ven en pesos al dólar del día
 * (criterio de deudores); las ventas, a la cotización de cada comprobante.
 */
export default function CustomerOverviewPanel({ customerId, overview }: { customerId: string; overview: CustomerOverview }) {
  const { debt, sales } = overview;
  const aging = debt.aging;
  const overdue = aging ? aging.total - aging.notDue : 0;
  const ars = debt.balances.find((b) => b.currency === 'ARS');
  const overLimit = ars?.creditLimit != null && ars.creditLimit > 0 && ars.balance > ars.creditLimit;
  const hasCc = debt.balances.some((b) => Math.abs(b.balance) > 0.009) || !!aging;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
      {/* Cuenta corriente */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Wallet className="w-4 h-4 text-gray-400" /> Cuenta corriente
          </h2>
          <Link to={`/current-accounts/${customerId}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Ver movimientos</Link>
        </div>

        {!hasCc ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">Sin saldo ni comprobantes pendientes.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-slate-400">Saldo</p>
                {debt.balances.length === 0 ? <p className="text-lg font-semibold text-gray-900 dark:text-white">—</p> : debt.balances.map((b) => (
                  <p key={b.currency} className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white truncate">
                    {formatCurrency(Math.abs(b.balance), b.currency)}
                    {b.balance < -0.009 && <span className="ml-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">a favor</span>}
                  </p>
                ))}
                {ars?.creditLimit != null && ars.creditLimit > 0 && (
                  <p className={`text-xs ${overLimit ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-gray-400 dark:text-slate-500'}`}>
                    {overLimit && <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" />}
                    Límite {formatCurrency(ars.creditLimit, 'ARS')}{overLimit ? ' — excedido' : ''}
                  </p>
                )}
              </div>
              <Kpi
                label="Vencido"
                value={formatCurrency(overdue, 'ARS')}
                tone={overdue > 0.009 ? 'danger' : undefined}
                hint={aging && aging.oldestDays > 0 ? `El más viejo, hace ${aging.oldestDays} días` : 'Nada vencido'}
              />
            </div>

            {aging && aging.total > 0 && (
              <div className="mt-5">
                <div className="flex h-2.5 gap-[2px] rounded-full overflow-hidden" role="img"
                     aria-label={BUCKETS.map((b) => `${b.label}: ${formatCurrency(aging[b.key], 'ARS')}`).join(', ')}>
                  {BUCKETS.filter((b) => aging[b.key] > 0).map((b) => (
                    <div key={b.key} className={b.cls} style={{ width: `${(aging[b.key] / aging.total) * 100}%` }}
                         title={`${b.label}: ${formatCurrency(aging[b.key], 'ARS')}`} />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
                  {BUCKETS.filter((b) => aging[b.key] > 0).map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                        <span className={`w-2 h-2 rounded-sm ${b.cls}`} />{b.label}
                      </span>
                      <span className="tabular-nums text-gray-700 dark:text-slate-300">{formatCurrency(aging[b.key], 'ARS')}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
                  {aging.docCount} comprobante{aging.docCount === 1 ? '' : 's'} impago{aging.docCount === 1 ? '' : 's'}
                  {debt.exchangeRate && debt.balances.some((b) => b.currency !== 'ARS') ? ` · USD al dólar del día ($${formatNumber(debt.exchangeRate, 2)})` : ''}
                </p>
              </div>
            )}

            <p className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400">
              Demora promedio de pago (12 meses):{' '}
              <span className="font-medium text-gray-800 dark:text-slate-200">
                {debt.avgPaymentDelayDays == null ? 'sin cobros' : debt.avgPaymentDelayDays === 0 ? 'paga a término' : `${debt.avgPaymentDelayDays} días después del vencimiento`}
              </span>
            </p>
          </>
        )}
      </div>

      {/* Ventas */}
      <div className="lg:col-span-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-4">
          <TrendingUp className="w-4 h-4 text-gray-400" /> Compras de los últimos 12 meses
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <Kpi label="Total comprado" value={formatCurrency(sales.net, 'ARS')} hint="Neto de IVA" />
          <Kpi label="Ticket promedio" value={sales.avgTicket != null ? formatCurrency(sales.avgTicket, 'ARS') : '—'}
               hint={`${sales.docCount} comprobante${sales.docCount === 1 ? '' : 's'}`} />
          <Kpi label="Última compra" value={sales.lastSaleDate ? formatDate(sales.lastSaleDate) : '—'}
               hint={sales.daysSinceLastSale != null ? (sales.daysSinceLastSale === 0 ? 'hoy' : `hace ${sales.daysSinceLastSale} días`) : undefined} />
        </div>
        <MonthlyBarChart
          months={sales.months.map((m) => m.month)}
          emptyText="Sin compras en los últimos 12 meses"
          measures={[
            { key: 'net', label: 'Importe', caption: 'Importe neto por mes (pesos)', values: sales.months.map((m) => m.net), format: (v) => formatCurrency(v, 'ARS') },
            { key: 'docs', label: 'Comprobantes', caption: 'Comprobantes por mes', values: sales.months.map((m) => m.docs), format: (v) => `${v}` },
          ]}
        />
      </div>
    </div>
  );
}
