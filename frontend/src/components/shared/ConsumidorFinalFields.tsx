import { clsx } from 'clsx';
import { UserRound } from 'lucide-react';
import { buyerDocumentError } from '../../utils/buyerDocument';

export interface ConsumidorFinalFieldsProps {
  name: string;
  document: string;
  onNameChange: (value: string) => void;
  onDocumentChange: (value: string) => void;
  error?: string;
  /** `compact` = dos campos en línea, sin rótulos (mostrador). */
  compact?: boolean;
  disabled?: boolean;
}

const fieldClass =
  'block w-full rounded-lg border shadow-sm text-sm px-3 py-2 bg-white dark:bg-slate-700 dark:text-slate-200 ' +
  'placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 ' +
  'disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400';

/**
 * Nombre y DNI de una venta sin cliente (Consumidor Final). Opcionales: se
 * imprimen en el comprobante y, con documento, la factura identifica al
 * comprador ante ARCA en lugar de ir "sin identificar".
 */
export default function ConsumidorFinalFields({
  name, document, onNameChange, onDocumentChange, error, compact, disabled,
}: ConsumidorFinalFieldsProps) {
  const docError = error ?? buyerDocumentError(document) ?? undefined;
  const border = (bad: boolean) => (bad ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-slate-600');

  if (compact) {
    return (
      <div className="flex flex-wrap items-start gap-2">
        <input
          aria-label="Nombre del consumidor final"
          placeholder="Nombre (opcional)"
          value={name}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => onNameChange(e.target.value)}
          className={clsx(fieldClass, border(false), 'sm:w-56')}
        />
        <div>
          <input
            aria-label="DNI o CUIL del consumidor final"
            placeholder="DNI / CUIL (opcional)"
            inputMode="numeric"
            value={document}
            maxLength={13}
            disabled={disabled}
            onChange={(e) => onDocumentChange(e.target.value.replace(/[^\d-]/g, ''))}
            className={clsx(fieldClass, border(!!docError), 'sm:w-44 font-mono')}
          />
          {docError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{docError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-600 p-3 space-y-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">
        <UserRound className="w-3.5 h-3.5" /> Consumidor final (opcional)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label htmlFor="cf-buyer-name" className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Nombre</label>
          <input
            id="cf-buyer-name"
            value={name}
            maxLength={120}
            disabled={disabled}
            placeholder="Nombre"
            onChange={(e) => onNameChange(e.target.value)}
            className={clsx(fieldClass, border(false))}
          />
        </div>
        <div>
          <label htmlFor="cf-buyer-doc" className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">DNI / CUIL</label>
          <input
            id="cf-buyer-doc"
            inputMode="numeric"
            value={document}
            maxLength={13}
            disabled={disabled}
            placeholder="Solo números"
            onChange={(e) => onDocumentChange(e.target.value.replace(/[^\d-]/g, ''))}
            className={clsx(fieldClass, border(!!docError), 'font-mono')}
          />
        </div>
      </div>
      {docError && <p className="text-xs text-red-600 dark:text-red-400">{docError}</p>}
    </div>
  );
}
