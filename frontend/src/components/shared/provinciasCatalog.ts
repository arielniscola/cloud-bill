import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { provinciasService } from '../../services';
import type { Provincia } from '../../types';

/* ── Catálogo cacheado a nivel módulo (un solo fetch por sesión) ──────── */
let cache: Provincia[] | null = null;
let inflight: Promise<Provincia[]> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

function loadProvincias() {
  if (cache || inflight) return;
  inflight = provinciasService.getAll()
    .then((data) => { cache = data; emit(); return data; })
    .catch(() => { cache = []; emit(); return []; })
    .finally(() => { inflight = null; });
}

/** Catálogo de provincias activas (compartido y cacheado). */
export function useProvincias(): Provincia[] {
  const provincias = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => cache,
    () => cache,
  );
  useEffect(() => { loadProvincias(); }, []);
  return useMemo(() => (provincias ?? []).filter((p) => p.isActive), [provincias]);
}

/** Minúsculas, sin acentos ni signos: "CORDOBA" = "Córdoba". */
export const normalizeProvincia = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Busca una provincia del catálogo por nombre, sin importar acentos ni mayúsculas. */
export function findProvinciaByName(provincias: Provincia[], name: string | null | undefined): Provincia | null {
  if (!name) return null;
  const n = normalizeProvincia(name);
  return provincias.find((p) => normalizeProvincia(p.name) === n) ?? null;
}

/**
 * Provincia del catálogo que corresponde a un domicilio del padrón de ARCA:
 * primero por código (`idProvincia`), después por nombre.
 */
export function matchPadronProvincia(
  provincias: Provincia[], code: number | null | undefined, name: string | null | undefined,
): Provincia | null {
  if (code != null) {
    const byCode = provincias.find((p) => p.afipCode === code);
    if (byCode) return byCode;
  }
  return findProvinciaByName(provincias, name);
}

/** Invalida el catálogo cacheado (usar tras crear/editar provincias). */
export function refreshProvincias() { cache = null; loadProvincias(); }
