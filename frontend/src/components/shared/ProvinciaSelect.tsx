import { useMemo } from 'react';
import { useProvincias, findProvinciaByName } from './provinciasCatalog';

interface Props extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

/**
 * Desplegable de provincias del catálogo (parametrización). Guarda el NOMBRE,
 * compatible con los campos de texto existentes. "BUENOS AIRES" se muestra como
 * la "Buenos Aires" del catálogo; un valor viejo que no está en el catálogo
 * (cargado a mano antes) se sigue mostrando para no perderlo.
 */
export default function ProvinciaSelect({ value, onChange, placeholder = 'Seleccionar provincia…', ...rest }: Props) {
  const provincias = useProvincias();
  const match = useMemo(() => findProvinciaByName(provincias, value), [provincias, value]);
  const legacy = value && !match ? value : null;

  return (
    <select {...rest} value={match?.name ?? value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {legacy && <option value={legacy}>{provincias.length > 0 ? `${legacy} (fuera del catálogo)` : legacy}</option>}
      {provincias.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
    </select>
  );
}
