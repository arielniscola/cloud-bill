import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { bancosService } from '../../services';
import type { Banco } from '../../types';

/* ── Catálogo cacheado a nivel módulo (un solo fetch por sesión) ──────── */
let cache: Banco[] | null = null;
let inflight: Promise<Banco[]> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

function loadBancos() {
  if (cache || inflight) return;
  inflight = bancosService.getAll()
    .then((data) => { cache = data; emit(); return data; })
    .catch(() => { cache = []; emit(); return []; })
    .finally(() => { inflight = null; });
}

/** Catálogo de bancos activos (compartido y cacheado). */
export function useBancos(): Banco[] {
  const bancos = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => cache,
    () => cache,
  );
  useEffect(() => { loadBancos(); }, []);
  return useMemo(() => (bancos ?? []).filter((b) => b.isActive), [bancos]);
}

/** Busca un banco del catálogo por nombre (case-insensitive). */
export function findBancoByName(bancos: Banco[], name: string | null | undefined): Banco | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return bancos.find((b) => b.name.trim().toLowerCase() === n) ?? null;
}

/** Invalida el catálogo cacheado (usar tras crear/editar bancos). */
export function refreshBancos() { cache = null; loadBancos(); }
