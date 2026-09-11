import { formatCurrency } from '../../utils/formatters';
import { isForeign, toArs } from '../../utils/currencyConversion';

interface Props {
  amount: number;
  currency: string | null | undefined;
  /** Cotización del día USD → ARS (de useExchangeRate). */
  rate: number | null;
  /** Clases del importe principal en pesos. */
  className?: string;
  /** Clases de la referencia en moneda original. */
  refClassName?: string;
  /** 'block' apila la referencia debajo; 'inline' la deja al lado. */
  layout?: 'block' | 'inline';
  /** Antepone el signo (+ débito / − crédito). */
  sign?: '+' | '−' | '';
}

/**
 * Importe expresado en pesos con el original en moneda extranjera como
 * referencia. Si no hay cotización disponible cae a mostrar el importe en su
 * moneda original (no inventa un valor en pesos).
 */
export function ArsAmount({
  amount, currency, rate, className = '', refClassName = '', layout = 'block', sign = '',
}: Props) {
  const foreign = isForeign(currency);
  const converted = toArs(amount, currency, rate);

  if (!foreign) {
    return <span className={className}>{sign}{formatCurrency(amount, 'ARS')}</span>;
  }

  if (converted === null) {
    // Sin cotización: se muestra el original y se avisa que no se pudo convertir.
    return (
      <span className={className} title="Sin cotización disponible para convertir a pesos">
        {sign}{formatCurrency(amount, currency!)} <span className={refClassName}>(s/cotiz.)</span>
      </span>
    );
  }

  const reference = (
    <span
      className={refClassName || 'text-[10px] text-gray-400 dark:text-slate-500 tabular-nums'}
      title={`Importe original: ${formatCurrency(amount, currency!)}`}
    >
      {formatCurrency(amount, currency!)}
    </span>
  );

  return layout === 'inline' ? (
    <span className="whitespace-nowrap">
      <span className={className}>{sign}{formatCurrency(converted, 'ARS')}</span>{' '}
      {reference}
    </span>
  ) : (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={className}>{sign}{formatCurrency(converted, 'ARS')}</span>
      {reference}
    </span>
  );
}

export default ArsAmount;
