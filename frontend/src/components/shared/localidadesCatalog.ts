import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { localidadesService } from '../../services';
import type { Localidad } from '../../types';
import { normalizeProvincia } from './provinciasCatalog';

/* ── Catálogo cacheado a nivel módulo (un solo fetch por sesión) ──────── */
let cache: Localidad[] | null = null;
let inflight: Promise<Localidad[]> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

function loadLocalidades() {
  if (cache || inflight) return;
  inflight = localidadesService.getAll()
    .then((data) => { cache = data; emit(); return data; })
    .catch(() => { cache = []; emit(); return []; })
    .finally(() => { inflight = null; });
}

/** Catálogo de localidades activas (compartido y cacheado). */
export function useLocalidades(): Localidad[] {
  const localidades = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => cache,
    () => cache,
  );
  useEffect(() => { loadLocalidades(); }, []);
  return useMemo(() => (localidades ?? []).filter((l) => l.isActive), [localidades]);
}

/**
 * Localidad del catálogo por nombre (sin acentos ni mayúsculas). Si se pasa la
 * provincia, prefiere la de esa provincia ("San Martín" existe en varias).
 */
export function findLocalidadByName(
  localidades: Localidad[], name: string | null | undefined, provincia?: string | null,
): Localidad | null {
  if (!name) return null;
  const n = normalizeProvincia(name);
  const matches = localidades.filter((l) => normalizeProvincia(l.name) === n);
  if (matches.length <= 1 || !provincia) return matches[0] ?? null;
  const p = normalizeProvincia(provincia);
  return matches.find((l) => l.provinciaName && normalizeProvincia(l.provinciaName) === p) ?? matches[0];
}

/** Invalida el catálogo cacheado (usar tras crear/editar localidades). */
export function refreshLocalidades() { cache = null; loadLocalidades(); }
