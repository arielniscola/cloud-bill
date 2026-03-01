import { useRef, useState } from 'react';
import { Barcode, CheckCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { Product } from '../../types';

export interface BarcodeProductInputProps {
  products: Product[];
  onAdd: (product: Product) => void;
}

type Status = 'idle' | 'found' | 'notfound';

/**
 * Input para lectores de código de barras USB/Bluetooth.
 * El lector escribe el código y envía Enter. Este componente intercepta
 * ese Enter, busca el producto por `barcode` (o `sku` como fallback),
 * y llama a onAdd() si lo encuentra.
 */
export default function BarcodeProductInput({ products, onAdd }: BarcodeProductInputProps) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [lastFound, setLastFound] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const code = value.trim();
    if (!code) return;

    const product = products.find(
      (p) =>
        (p.barcode && p.barcode === code) ||
        p.sku.toLowerCase() === code.toLowerCase()
    );

    if (product) {
      onAdd(product);
      setLastFound(product.name);
      setStatus('found');
    } else {
      setStatus('notfound');
    }

    setValue('');
    setTimeout(() => setStatus('idle'), 2000);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  return (
    <div className="flex items-start gap-4 p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
      <Barcode className="w-5 h-5 text-indigo-400 mt-2 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <label className="block text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1.5">
          Lector de código de barras
        </label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escanear código o escribir SKU y presionar Enter…"
          autoComplete="off"
          className={clsx(
            'block w-full rounded-lg border shadow-sm text-sm transition-all duration-150',
            'focus:ring-2 focus:ring-offset-0 focus:outline-none px-3 py-2',
            status === 'found'
              ? 'border-green-400 bg-green-50 focus:border-green-500 focus:ring-green-500/20'
              : status === 'notfound'
              ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500/20'
              : 'border-indigo-200 bg-white focus:border-indigo-400 focus:ring-indigo-400/20'
          )}
        />

        <div className="mt-1 h-4">
          {status === 'found' && (
            <p className="text-xs text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Agregado: <span className="font-medium">{lastFound}</span>
            </p>
          )}
          {status === 'notfound' && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              No se encontró ningún producto con ese código
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
