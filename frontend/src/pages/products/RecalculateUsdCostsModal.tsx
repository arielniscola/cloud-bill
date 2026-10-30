import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal } from '../../components/ui';
import { productsService } from '../../services';
import { useExchangeRate } from '../../hooks/useExchangeRate';
import { formatNumber } from '../../utils/formatters';

/**
 * Recalcula el costo en pesos de todos los productos con costo en USD:
 * costo = costo USD × cotización. Es manual a propósito — el costo en pesos no
 * se mueve solo cuando cambia el dólar. Por defecto propone la cotización del
 * día (editable) y opcionalmente arrastra el precio de venta manteniendo el margen.
 */
export default function RecalculateUsdCostsModal({
  onClose, onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { rate: todayRate, isLoading: rateLoading, isStale } = useExchangeRate();
  const [summary, setSummary] = useState<{ count: number; minRate: number | null; maxRate: number | null } | null>(null);
  const [rate, setRate] = useState('');
  const [keepMargin, setKeepMargin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    productsService.getUsdCostSummary().then(setSummary).catch(() => setSummary({ count: 0, minRate: null, maxRate: null }));
  }, []);

  // Propone la cotización del día apenas llega (sin pisar lo que haya escrito el usuario).
  useEffect(() => {
    if (todayRate != null) setRate((prev) => prev || String(todayRate));
  }, [todayRate]);

  const rateNum = Number(rate.replace(',', '.'));
  const isValid = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum > 0 && (summary?.count ?? 0) > 0;

  const appliedRate = summary?.minRate == null
    ? null
    : summary.minRate === summary.maxRate
      ? `$${formatNumber(summary.minRate, 2)}`
      : `entre $${formatNumber(summary.minRate, 2)} y $${formatNumber(summary.maxRate!, 2)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    try {
      const { updated } = await productsService.recalculateUsdCosts({ rate: rateNum, keepMargin });
      toast.success(`${updated} ${updated === 1 ? 'costo recalculado' : 'costos recalculados'} con dólar $${formatNumber(rateNum, 2)}`);
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al recalcular costos');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Recalcular costos USD" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {summary == null ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">Cargando…</p>
        ) : summary.count === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Ningún producto tiene costo en USD. Cargalo en la ficha del producto, en
            "Actualizar precios" o con la columna <span className="font-mono">costousd</span> al importar.
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {summary.count} {summary.count === 1 ? 'producto tiene' : 'productos tienen'} costo en USD.
            {appliedRate && <> Su costo en pesos está calculado con dólar {appliedRate}.</>}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Cotización (pesos por dólar)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={rateLoading ? 'Buscando cotización…' : '0,00'}
              className="block w-full h-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 shadow-sm text-sm pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            {todayRate != null
              ? <>Dólar oficial venta del día: ${formatNumber(todayRate, 2)}{isStale && ' (desactualizada)'}</>
              : !rateLoading && 'No se pudo obtener la cotización del día: ingresala a mano'}
          </p>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={keepMargin}
            onChange={(e) => setKeepMargin(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/30"
          />
          <span className="text-sm text-gray-700 dark:text-slate-300">
            Mantener el margen
            <span className="block text-xs text-gray-400 dark:text-slate-500">
              El precio de venta sube o baja en la misma proporción que el costo
            </span>
          </span>
        </label>

        <div className="flex gap-2 pt-1 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving} disabled={!isValid}>Recalcular</Button>
        </div>
      </form>
    </Modal>
  );
}
