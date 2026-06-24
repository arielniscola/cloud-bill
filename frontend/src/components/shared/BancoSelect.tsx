import { useEffect, useState, useId } from 'react';
import { bancosService } from '../../services';
import type { Banco } from '../../types';

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Combo de banco respaldado por el catálogo (parametrización). Usa un <datalist>
// para que el usuario elija un banco configurado o escriba uno libre — el valor
// guardado sigue siendo el NOMBRE (string), compatible con los campos existentes.
let cache: Banco[] | null = null;

export function BancoSelect({ value, onChange, label, placeholder = 'Seleccionar o escribir banco…', className, disabled }: Props) {
  const listId = useId();
  const [bancos, setBancos] = useState<Banco[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    bancosService.getAll()
      .then((data) => { cache = data; setBancos(data); })
      .catch(() => { /* non-blocking: fall back to free text */ });
  }, []);

  const inputCls =
    className ??
    'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700';

  return (
    <div>
      {label && <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</label>}
      <input
        type="text"
        list={listId}
        value={value ?? ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      <datalist id={listId}>
        {bancos.filter((b) => b.isActive).map((b) => (
          <option key={b.id} value={b.name}>
            {[b.code, b.sucursal].filter(Boolean).join(' · ') || undefined}
          </option>
        ))}
      </datalist>
    </div>
  );
}

export default BancoSelect;
