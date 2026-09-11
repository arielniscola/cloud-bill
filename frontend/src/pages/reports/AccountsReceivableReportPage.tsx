import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, ChevronLeft, Search, ChevronRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import {
  reportsService,
  type DebtorRow, type DebtorsResponse,
} from '../../services/reports.service';
import { formatCurrency } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import { isForeign } from '../../utils/currencyConversion';

type Side = 'customers' | 'suppliers';

const SIDE_LABEL: Record<Side, { tab: string; entity: string; entities: string; total: string; empty: string }> = {
  customers: {
    tab: 'Clientes (nos deben)',
    entity: 'Cliente',
    entities: 'clientes deudores',
    total: 'Total a cobrar',
    empty: 'Ningún cliente tenía saldo pendiente en ese período',
  },
  suppliers: {
    tab: 'Proveedores (les debemos)',
    entity: 'Proveedor',
    entities: 'proveedores acreedores',
    total: 'Total a pagar',
    empty: 'No había deuda con proveedores en ese período',
  },
};

const todayISO = () => new Date().toISOString().substring(0, 10);

/** Balde de antigüedad → color. El atraso se mide contra la fecha de corte. */
const BUCKETS = [
  { key: 'notDue',  label: 'A vencer', cls: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'd0_30',   label: '0-30',     cls: 'text-amber-600 dark:text-amber-400' },
  { key: 'd31_60',  label: '31-60',    cls: 'text-orange-600 dark:text-orange-400' },
  { key: 'd61_90',  label: '61-90',    cls: 'text-red-600 dark:text-red-400' },
  { key: 'd90plus', label: '+90',      cls: 'text-red-700 dark:text-red-300 font-semibold' },
] as const;

export default function AccountsReceivableReportPage() {
  const navigate = useNavigate();

  const [side, setSide]             = useState<Side>('customers');
  const [asOf, setAsOf]             = useState(todayISO());
  const [from, setFrom]             = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [result, setResult]         = useState<DebtorsResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  const L = SIDE_LABEL[side];
  const data = result?.data ?? [];

  const generate = async (forSide: Side = side) => {
    if (!asOf) { toast.error('Elegí una fecha de corte'); return; }
    if (from && from > asOf) { toast.error('La fecha desde no puede ser posterior al corte'); return; }
    setLoading(true);
    try {
      const res = await reportsService.debtors({
        asOf,
        side: forSide,
        ...(from ? { from } : {}),
        ...(minBalance ? { minBalance: parseFloat(minBalance) } : {}),
      });
      setResult(res);
      setExpanded(new Set());
      if (res.data.length === 0) toast('Sin deuda a esa fecha', { icon: 'ℹ️' });
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  // Cambiar de solapa regenera: cada lado es una consulta distinta.
  const switchSide = (next: Side) => {
    setSide(next);
    setResult(null);
    if (result) generate(next);
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleExport = () => {
    // Una fila por comprobante, con el deudor repetido: así el Excel se puede
    // filtrar y tabular sin perder el detalle que compone cada saldo.
    const rows = data.flatMap((d) =>
      d.documents.map((doc) => ({
        entidad:     d.entityName,
        taxId:       d.taxId ?? '',
        comprobante: doc.number,
        tipo:        doc.type,
        fecha:       new Date(doc.date).toLocaleDateString('es-AR'),
        vencimiento: doc.dueDate ? new Date(doc.dueDate).toLocaleDateString('es-AR') : '',
        atraso:      doc.overdueDays,
        saldoArs:    doc.balanceArs,
        monedaOrig:  isForeign(doc.currency) ? doc.currency : '',
        saldoOrig:   isForeign(doc.currency) ? doc.balance : '',
      }))
    );
    if (rows.length === 0) { toast.error('No hay filas para exportar'); return; }

    exportToExcel(
      `deudores_${side}_${from ? `${from}_a_${asOf}` : asOf}`,
      side === 'customers' ? 'Deudores' : 'Acreedores',
      [
        { header: L.entity,        key: 'entidad',     width: 28 },
        { header: 'CUIT / CUIL',   key: 'taxId',       width: 16 },
        { header: 'Comprobante',   key: 'comprobante', width: 18 },
        { header: 'Tipo',          key: 'tipo',        width: 16 },
        { header: 'Fecha',         key: 'fecha',       width: 12 },
        { header: 'Vencimiento',   key: 'vencimiento', width: 12 },
        { header: 'Días atraso',   key: 'atraso',      width: 12 },
        { header: 'Saldo ARS',     key: 'saldoArs',    width: 15, format: 'currency' },
        { header: 'Moneda orig.',  key: 'monedaOrig',  width: 12 },
        { header: 'Saldo orig.',   key: 'saldoOrig',   width: 15, format: 'currency' },
      ],
      rows,
      { entidad: `TOTAL ${from ? `del ${from} al ${asOf}` : `al ${asOf}`}`, saldoArs: result?.totalBalance ?? 0 },
    );
  };

  const rate = result?.exchangeRate;
  // El período que se consultó, tal como se rotula en el encabezado y el Excel.
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR');
  const periodLabel = from
    ? `del ${fmtDate(from)} al ${fmtDate(asOf)}`
    : `al ${fmtDate(asOf)}`;

  return (
    <div>
      <PageHeader
        title="Deudores"
        subtitle={
          result
            ? `${data.length} ${L.entities} ${periodLabel} · ${formatCurrency(result.totalBalance, 'ARS')}`
            : 'Deuda pendiente a una fecha de corte'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Reportes
            </Button>
            {data.length > 0 && (
              <Button variant="outline" onClick={handleExport}>
                <FileDown className="w-4 h-4 mr-2" /> Exportar Excel
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Fecha desde (opcional)</label>
            <input
              type="date"
              value={from}
              max={asOf || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-gray-400 dark:text-slate-500">Vacío = todo el historial</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Fecha de corte</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-gray-400 dark:text-slate-500">Saldo a esta fecha</span>
          </div>
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Ocultar saldos menores a (ARS)</label>
            <input
              type="number" min="0" placeholder="0,01"
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-gray-400 dark:text-slate-500">Filtra deudas chicas · vacío = todas</span>
          </div>
          <Button onClick={() => generate()} isLoading={loading}>
            <Search className="w-4 h-4 mr-2" /> Generar
          </Button>
          <p className="text-xs text-gray-400 dark:text-slate-500 max-w-md">
            Muestra la deuda tal como estaba en la fecha de corte: un comprobante cobrado
            después del corte sigue contando, y la antigüedad se mide contra el corte, no
            contra hoy. La <span className="font-medium">fecha desde</span> deja solo los
            comprobantes emitidos dentro del período (lo cobrado se sigue contando hasta el
            corte); sin ella entra también el saldo arrastrado de antes.
          </p>
        </div>
      </Card>

      {/* Solapas: clientes / proveedores */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-700/50 p-1 rounded-lg w-fit mb-4">
        {(Object.keys(SIDE_LABEL) as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => switchSide(s)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              side === s
                ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white'
            }`}
          >
            {SIDE_LABEL[s].tab}
          </button>
        ))}
      </div>

      {result && (
        <>
          {data.length > 0 && (
            <div className="flex gap-3 mb-4 flex-wrap items-stretch">
              <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl">
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{L.total}</p>
                <p className="text-lg font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                  {formatCurrency(result.totalBalance, 'ARS')}
                </p>
              </div>
              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-700/40 border border-gray-100 dark:border-slate-700 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{L.entities}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{data.length}</p>
              </div>
              {/* Composición por antigüedad de toda la cartera */}
              <div className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl flex gap-4">
                {BUCKETS.map((b) => (
                  <div key={b.key}>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500">{b.label}</p>
                    <p className={`text-sm font-semibold tabular-nums ${b.cls}`}>
                      {formatCurrency(result.totals[b.key], 'ARS')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Con qué cotización se convirtió lo que está en moneda extranjera */}
          {rate ? (
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">
              Importes en pesos · cotización USD ${rate.rate.toLocaleString('es-AR')}
              {rate.stale && ' (última conocida)'}
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Sin cotización: los saldos en moneda extranjera no están sumados al total en pesos.
            </p>
          )}

          <Card padding="none">
            {data.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">{L.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                    <tr className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">{L.entity}</th>
                      <th className="px-4 py-3 text-left">CUIT / CUIL</th>
                      <th className="px-4 py-3 text-right">Comp.</th>
                      <th className="px-4 py-3 text-right">Atraso</th>
                      {BUCKETS.map((b) => (
                        <th key={b.key} className="px-3 py-3 text-right whitespace-nowrap">{b.label}</th>
                      ))}
                      <th className="px-4 py-3 text-right">Saldo ARS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {data.map((d: DebtorRow) => {
                      const isOpen = expanded.has(d.entityId);
                      const foreign = Object.entries(d.byCurrency).filter(([c, v]) => isForeign(c) && Math.abs(v) > 0.005);
                      return (
                        <Fragment key={d.entityId}>
                          <tr
                            onClick={() => toggle(d.entityId)}
                            className="hover:bg-gray-50 dark:hover:bg-slate-700/20 cursor-pointer"
                          >
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                              <span className="flex items-center gap-1.5">
                                <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                {d.entityName}
                              </span>
                              {foreign.length > 0 && (
                                <span className="ml-5 text-[10px] text-gray-400 dark:text-slate-500 tabular-nums">
                                  incluye {foreign.map(([c, v]) => formatCurrency(v, c)).join(' · ')}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{d.taxId || '—'}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-slate-400 tabular-nums">{d.docCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {d.oldestDays > 0
                                ? <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{d.oldestDays} d</span>
                                : <span className="text-gray-300 dark:text-slate-600">—</span>}
                            </td>
                            {BUCKETS.map((b) => (
                              <td key={b.key} className={`px-3 py-3 text-right tabular-nums text-xs ${d[b.key] > 0 ? b.cls : 'text-gray-300 dark:text-slate-600'}`}>
                                {d[b.key] > 0 ? formatCurrency(d[b.key], 'ARS') : '—'}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                              {formatCurrency(d.balanceArs, 'ARS')}
                              {d.creditsArs > 0 && (
                                <span className="block text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                                  neto de {formatCurrency(d.creditsArs, 'ARS')} en NC
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Detalle: los comprobantes que componen el saldo */}
                          {isOpen && (
                            <tr className="bg-gray-50/60 dark:bg-slate-800/40">
                              <td colSpan={9} className="px-4 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[11px] text-gray-400 dark:text-slate-500 uppercase">
                                      <th className="py-1 text-left font-medium">Comprobante</th>
                                      <th className="py-1 text-left font-medium">Fecha</th>
                                      <th className="py-1 text-left font-medium">Vencimiento</th>
                                      <th className="py-1 text-right font-medium">Atraso</th>
                                      <th className="py-1 text-right font-medium">Total</th>
                                      <th className="py-1 text-right font-medium">Cobrado al corte</th>
                                      <th className="py-1 text-right font-medium">Saldo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.documents.map((doc) => (
                                      <tr key={doc.documentId} className="text-gray-600 dark:text-slate-300">
                                        <td className="py-1 font-mono">{doc.number}</td>
                                        <td className="py-1">{new Date(doc.date).toLocaleDateString('es-AR')}</td>
                                        <td className="py-1">{doc.dueDate ? new Date(doc.dueDate).toLocaleDateString('es-AR') : '—'}</td>
                                        <td className="py-1 text-right tabular-nums">
                                          {doc.overdueDays > 0 ? `${doc.overdueDays} d` : '—'}
                                        </td>
                                        <td className="py-1 text-right tabular-nums">{formatCurrency(doc.total, doc.currency)}</td>
                                        <td className="py-1 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                          {doc.paid > 0 ? formatCurrency(doc.paid, doc.currency) : '—'}
                                        </td>
                                        <td className="py-1 text-right tabular-nums font-semibold">
                                          {formatCurrency(doc.balanceArs || doc.balance, doc.balanceArs ? 'ARS' : doc.currency)}
                                          {isForeign(doc.currency) && doc.balanceArs > 0 && (
                                            <span className="ml-1 text-[10px] font-normal text-gray-400">
                                              {formatCurrency(doc.balance, doc.currency)}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-slate-700/30 border-t-2 border-gray-200 dark:border-slate-600">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                        Total al {new Date(asOf).toLocaleDateString('es-AR')}
                      </td>
                      {BUCKETS.map((b) => (
                        <td key={b.key} className={`px-3 py-3 text-right text-xs font-semibold tabular-nums ${b.cls}`}>
                          {formatCurrency(result.totals[b.key], 'ARS')}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {formatCurrency(result.totalBalance, 'ARS')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
