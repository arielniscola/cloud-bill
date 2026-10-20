import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';

export interface ItemDetailInputProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Detalle libre de una línea de venta, para productos no inventariados
 * (servicios): queda colapsado en un link y se despliega en un textarea.
 * Se imprime debajo del nombre del producto en el comprobante.
 */
export default function ItemDetailInput({ value, onChange, disabled }: ItemDetailInputProps) {
  const [open, setOpen] = useState(Boolean(value));
  const ref = useRef<HTMLTextAreaElement>(null);

  // Al cargar un comprobante existente el valor llega después del primer render.
  useEffect(() => {
    if (value) setOpen(true);
  }, [value]);

  if (!open) {
    if (disabled) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => ref.current?.focus(), 0);
        }}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >
        <FileText className="w-3 h-3" />
        Agregar detalle
      </button>
    );
  }

  return (
    <div className="mt-1 relative">
      <textarea
        ref={ref}
        rows={2}
        maxLength={2000}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Detalle del servicio (se imprime en el comprobante)"
        className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 pr-6 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y disabled:opacity-60"
      />
      {!disabled && (
        <button
          type="button"
          title="Quitar detalle"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
          className="absolute top-1 right-1 text-gray-400 hover:text-red-500 dark:text-slate-500"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
