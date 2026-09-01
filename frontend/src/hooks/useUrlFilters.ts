import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Estado de filtros guardado en la query string en vez de en `useState`.
 *
 * El motivo es la navegabilidad: al entrar al detalle de un comprobante y
 * volver, los filtros, la búsqueda y la página seguían en memoria del
 * componente y se perdían. En la URL sobreviven al ida y vuelta, hacen que el
 * botón Atrás del navegador haga lo esperado, y dejan el listado filtrado
 * compartible por link.
 *
 * Los valores iguales al default no se escriben, para que la URL quede corta.
 * Los cambios usan `replace` a propósito: si no, cada tecla tipeada dejaría
 * una entrada en el historial y el botón Atrás tardaría veinte clics en salir.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Los defaults se congelan en el primer render: llegan como objeto literal
  // desde el componente y cambiarían de identidad en cada pasada.
  const [initialDefaults] = useState(defaults);

  // `setSearchParams(fn)` de react-router 6 le pasa a `fn` el `searchParams`
  // capturado en el closure del render, no el último valor escrito. Dos
  // llamadas en el mismo handler ("poné el filtro" + "volvé a la página 1")
  // parten entonces del MISMO estado viejo y la segunda pisa a la primera: el
  // filtro se escribía y se borraba en el mismo tick. Este ref guarda lo último
  // escrito para que las llamadas encadenadas compongan.
  const latestRef = useRef<URLSearchParams | null>(null);
  latestRef.current = searchParams;

  const values = useMemo(() => {
    const out = { ...initialDefaults };
    for (const key of Object.keys(initialDefaults) as (keyof T)[]) {
      const raw = searchParams.get(key as string);
      if (raw !== null) out[key] = raw as T[keyof T];
    }
    return out;
  }, [searchParams, initialDefaults]);

  const setValues = useCallback(
    (patch: Partial<T>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(latestRef.current ?? prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) continue;
            if (value === '' || value === initialDefaults[key]) next.delete(key);
            else next.set(key, value);
          }
          latestRef.current = next;
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, initialDefaults]
  );

  /** Borra todos los filtros. `keep` deja intactos los que no son filtros (límite de página, pestaña). */
  const reset = useCallback(
    (keep?: (keyof T)[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(latestRef.current ?? prev);
          for (const key of Object.keys(initialDefaults)) {
            if (keep?.includes(key as keyof T)) continue;
            next.delete(key);
          }
          latestRef.current = next;
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, initialDefaults]
  );

  return { values, setValues, reset };
}

export default useUrlFilters;
