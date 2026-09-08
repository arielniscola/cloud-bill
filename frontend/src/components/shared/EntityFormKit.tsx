import { ReactNode, useState } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { AlertCircle, AlertTriangle, Power, Check, CloudDownload } from 'lucide-react';
import { Button } from '../ui';
import CuitInput from './CuitInput';
import { afipService } from '../../services';
import type { PadronData } from '../../services/afip.service';
import { fieldClass } from './entityForm';
import type { OptionCard, PadronState } from './entityForm';

/**
 * Piezas compartidas por los formularios de alta de entidades fiscales
 * (clientes y proveedores): mismo lenguaje visual, un solo acento `primary-*`
 * y variantes `dark:` en todos los estados.
 */

// ── Campos ───────────────────────────────────────────────────────
export function FieldLabel({
  children,
  required,
  hint,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="flex items-baseline gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
      <span>
        {children}
        {required && <span className="text-red-600 dark:text-red-400 font-semibold ml-0.5">*</span>}
      </span>
      {hint && <span className="text-xs font-normal text-gray-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
      {message}
    </p>
  );
}

// ── Encabezado de sección ────────────────────────────────────────
export function SectionHeader({
  icon,
  label,
  suffix,
}: {
  icon: ReactNode;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
      {icon}
      {label}
      {suffix && (
        <span className="normal-case tracking-normal font-normal text-gray-400 dark:text-slate-500">
          · {suffix}
        </span>
      )}
    </div>
  );
}

// ── Selector de tarjetas (un solo acento) ────────────────────────
export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: OptionCard<T>[];
  value: T;
  onChange: (v: T) => void;
  columns: 2 | 4;
}) {
  return (
    <div className={clsx('grid gap-2', columns === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isSelected}
            className={clsx(
              'flex items-start gap-2 p-2.5 rounded-xl border text-left transition-colors duration-150',
              isSelected
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/20 dark:border-primary-500'
                : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-primary-300 dark:hover:border-primary-500'
            )}
          >
            <span
              className={clsx(
                'mt-0.5 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center flex-shrink-0 text-white transition-colors duration-150',
                isSelected ? 'border-primary-600 bg-primary-600' : 'border-gray-300 dark:border-slate-500'
              )}
            >
              {isSelected && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
            </span>
            <span className="min-w-0">
              <span
                className={clsx(
                  'block text-xs font-semibold leading-4',
                  isSelected
                    ? 'text-primary-800 dark:text-primary-100'
                    : 'text-gray-700 dark:text-slate-200'
                )}
              >
                {opt.label}
              </span>
              <span
                className={clsx(
                  'block text-[11px] leading-[15px] mt-0.5',
                  isSelected
                    ? 'text-primary-600 dark:text-primary-300'
                    : 'text-gray-500 dark:text-slate-400'
                )}
              >
                {opt.desc}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle de estado ─────────────────────────────────────────────
export function ActiveToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={clsx(
        'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors duration-150 select-none',
        checked
          ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-800'
          : 'bg-gray-50 dark:bg-slate-900/50 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
      )}
    >
      <span className="flex-1">
        <span
          className={clsx(
            'flex items-center gap-1.5 text-sm font-medium',
            checked ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-600 dark:text-slate-300'
          )}
        >
          <Power className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className="block text-xs text-gray-500 dark:text-slate-400 mt-1 leading-4">{hint}</span>
      </span>
      <span
        className={clsx(
          'relative flex-shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
        )}
        style={{ width: 40, height: 22 }}
      >
        <span
          className={clsx(
            'absolute top-[3px] w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[21px]' : 'translate-x-[3px]'
          )}
        />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}

// ── Búsqueda en el padrón de ARCA ────────────────────────────────
/**
 * Bloque de CUIT + consulta al padrón. Es el punto de partida del alta:
 * el consumidor decide qué campos completa con lo que devuelve `onResult`.
 */
export function PadronLookup({
  value,
  onChange,
  required,
  error,
  onResult,
  onStateChange,
}: {
  value?: string | null;
  onChange: (rawDigits: string) => void;
  required: boolean;
  error?: string;
  onResult: (data: PadronData) => void;
  onStateChange?: (state: PadronState) => void;
}) {
  const [state, setState] = useState<PadronState>('idle');
  const [result, setResult] = useState<{ name: string; estado?: string } | null>(null);

  const digits = (value ?? '').replace(/\D/g, '');
  const isComplete = digits.length === 11;
  const isLoading = state === 'loading';

  const move = (next: PadronState) => {
    setState(next);
    onStateChange?.(next);
  };

  const lookup = async () => {
    if (!isComplete || isLoading) return;
    move('loading');
    try {
      const p = await afipService.getPadron(digits);
      onResult(p);
      setResult({ name: p.name, estado: p.estado ?? undefined });
      move('done');
      toast.success(`Datos de "${p.name}" cargados desde ARCA`);
      if (p.estado && p.estado !== 'ACTIVO') {
        toast(`Atención: el CUIT figura como ${p.estado} en ARCA`, { icon: '⚠️' });
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setResult(null);
      move('error');
      toast.error(e.response?.data?.message || 'No se pudo consultar el padrón de ARCA');
    }
  };

  return (
    <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-500/10 p-3.5">
      <div className="flex items-end gap-2.5">
        <div className="flex-1 min-w-0">
          <FieldLabel required={required} hint={required ? undefined : '(opcional)'}>
            <span className="text-primary-800 dark:text-primary-200">CUIT / CUIL</span>
          </FieldLabel>
          <CuitInput value={value} onChange={onChange} className={fieldClass(!!error, 'font-mono')} />
        </div>
        <Button
          type="button"
          variant={state === 'done' ? 'outline' : 'primary'}
          onClick={lookup}
          disabled={!isComplete}
          isLoading={isLoading}
          className="h-[38px] whitespace-nowrap"
        >
          {!isLoading && <CloudDownload className="w-3.5 h-3.5" />}
          {isLoading ? 'Consultando…' : state === 'done' ? 'Actualizar' : 'Buscar en ARCA'}
        </Button>
      </div>

      <FieldError message={error} />

      {state === 'idle' && !error && (
        <p className="mt-2 text-xs leading-[17px] text-primary-700 dark:text-primary-300">
          Ingresá el CUIT y traemos nombre, domicilio y condición de IVA del padrón. Es la vía más
          rápida y evita errores de tipeo.
        </p>
      )}

      {state === 'done' && result && (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5">
          <Check
            className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400"
            strokeWidth={3}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {result.name}
              {result.estado && ` · ${result.estado}`}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              Datos traídos de ARCA. Podés editarlos antes de guardar.
            </p>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              No se pudo consultar el padrón
            </p>
            <p className="text-xs leading-[17px] text-amber-700 dark:text-amber-400 mt-0.5">
              Podés cargar los datos a mano y guardar igual.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
