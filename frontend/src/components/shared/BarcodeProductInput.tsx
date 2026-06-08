import { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Barcode, CheckCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { Product } from '../../types';

export interface BarcodeProductInputProps {
  products: Product[];
  onAdd: (product: Product, quantity?: number) => void;
  soundEnabled?: boolean;
}

export interface BarcodeProductInputHandle {
  focus: () => void;
}

type Status = 'idle' | 'found' | 'notfound';

// Web Audio API beep: corto agudo en éxito, doble grave en error.
// Se crea/recrea el AudioContext bajo demanda; algunos browsers exigen gesto del usuario,
// pero un scan termina en "Enter" que cuenta como interacción.
let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx) return sharedAudioCtx;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedAudioCtx = new Ctor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
};

const beep = (freq: number, durationMs: number, when = 0) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const start = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
};

const playSuccess = () => beep(880, 80);
const playError = () => {
  beep(220, 120, 0);
  beep(220, 120, 0.15);
};

// Parsea "N*CODIGO" → { qty: N, code: CODIGO }. Acepta también "N*" sin código (no useable).
// Si no matchea el patrón, retorna qty=1 y el código completo.
const parseQuantityPrefix = (raw: string): { qty: number; code: string } => {
  const m = raw.match(/^(\d+)\s*\*\s*(.+)$/);
  if (!m) return { qty: 1, code: raw };
  const qty = Math.max(1, parseInt(m[1], 10) || 1);
  return { qty, code: m[2].trim() };
};

/**
 * Input para lectores de código de barras USB/Bluetooth.
 * El lector escribe el código y envía Enter. Este componente intercepta
 * ese Enter, busca el producto por `barcode` (o `sku` como fallback),
 * y llama a onAdd() si lo encuentra.
 *
 * Features:
 * - Prefijo de cantidad: "5*123456" agrega 5 unidades en una pasada.
 * - Beep de feedback (success/error) — desactivable con soundEnabled={false}.
 * - Anti-doble-scan: ignora el mismo código si llega <250ms del anterior.
 *
 * Expone `focus()` vía ref para activar desde atajos de teclado (Ctrl+B).
 */
const BarcodeProductInput = forwardRef<BarcodeProductInputHandle, BarcodeProductInputProps>(
  ({ products, onAdd, soundEnabled = true }, ref) => {
    const [value, setValue] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [lastFound, setLastFound] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const raw = value.trim();
      if (!raw) return;

      const { qty, code } = parseQuantityPrefix(raw);
      if (!code) return;

      // Anti-doble-scan: mismo código en <250ms → ignorar (lectores defectuosos
      // pueden disparar Enter dos veces).
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.ts < 250) {
        setValue('');
        setTimeout(() => inputRef.current?.focus(), 30);
        return;
      }
      lastScanRef.current = { code, ts: now };

      const product = products.find(
        (p) =>
          (p.barcode && p.barcode === code) ||
          p.sku.toLowerCase() === code.toLowerCase()
      );

      if (product) {
        onAdd(product, qty);
        setLastFound(qty > 1 ? `${qty}× ${product.name}` : product.name);
        setStatus('found');
        if (soundEnabled) playSuccess();
      } else {
        setStatus('notfound');
        if (soundEnabled) playError();
      }

      setValue('');
      setTimeout(() => setStatus('idle'), 2000);
      setTimeout(() => inputRef.current?.focus(), 30);
    };

    return (
      <div className="flex items-start gap-4 p-3 bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg">
        <Barcode className="w-5 h-5 text-indigo-400 mt-2 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide mb-1.5">
            Lector de código de barras
            <kbd className="ml-2 text-[10px] font-mono normal-case font-normal text-indigo-400 dark:text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 px-1 py-0.5 rounded border border-indigo-200 dark:border-indigo-700 leading-none">
              Ctrl+B
            </kbd>
            <span className="ml-2 text-[10px] font-mono normal-case font-normal text-indigo-400 dark:text-indigo-500">
              Tip: <span className="font-semibold">N*código</span> agrega N unidades
            </span>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escanear código, escribir SKU, o 5*CÓDIGO y Enter…"
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
);

BarcodeProductInput.displayName = 'BarcodeProductInput';

export default BarcodeProductInput;
