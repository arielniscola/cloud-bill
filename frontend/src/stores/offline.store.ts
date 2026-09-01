import { create } from 'zustand';

export type ConnectionState = 'online' | 'offline' | 'checking';

interface OfflineState {
  connection: ConnectionState;
  /** Ultima vez que el ping al backend respondio bien. */
  lastOnlineAt: string | null;
  /** Cursor del ultimo sync de catalogo aplicado. */
  lastSyncAt: string | null;
  /** Edad de la cache en minutos (null = nunca se sincronizo). */
  cacheAgeMinutes: number | null;
  syncing: boolean;
  lastSyncError: string | null;
  /** Ventas guardadas sin conexion que todavia no llegaron al servidor. */
  pendingSales: number;

  setConnection: (c: ConnectionState) => void;
  setPendingSales: (n: number) => void;
  setSyncing: (v: boolean) => void;
  setSyncResult: (r: { lastSyncAt: string | null; error?: string | null }) => void;
  setCacheAge: (m: number | null) => void;
}

export const useOfflineStore = create<OfflineState>()((set) => ({
  // Arranca optimista: si de entrada dijeramos 'offline', la UI parpadearia
  // en rojo en cada carga antes del primer ping.
  connection: 'online',
  lastOnlineAt: null,
  lastSyncAt: null,
  cacheAgeMinutes: null,
  syncing: false,
  lastSyncError: null,
  pendingSales: 0,

  setPendingSales: (pendingSales) => set({ pendingSales }),
  setConnection: (connection) =>
    set((s) => ({
      connection,
      lastOnlineAt: connection === 'online' ? new Date().toISOString() : s.lastOnlineAt,
    })),
  setSyncing: (syncing) => set({ syncing }),
  setSyncResult: ({ lastSyncAt, error }) =>
    set({ lastSyncAt, lastSyncError: error ?? null, syncing: false }),
  setCacheAge: (cacheAgeMinutes) => set({ cacheAgeMinutes }),
}));

/** Lectura sincronica para modulos que no son componentes (ej. api.ts). */
export const isOffline = () => useOfflineStore.getState().connection === 'offline';

export default useOfflineStore;
