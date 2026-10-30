import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
// Import directo a db.ts (no a catalogCache) para no crear un ciclo
// auth.store → catalogCache → api.ts → auth.store.
import { clearCache } from '../lib/offline/db';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
        }),
      logout: () => {
        // El catalogo cacheado es de una empresa concreta: no puede quedar
        // visible para quien inicie sesion despues en la misma maquina.
        // NOTA (Fase 3): la cola de ventas pendientes NO debe borrarse aca.
        void clearCache().catch(() => { /* la cache se rehace en el proximo login */ });
        // Los avisos push son de quien tenia la sesion: se dan de baja en este
        // navegador. Import dinamico por el mismo ciclo que evita clearCache.
        const token = get().token;
        void import('../lib/pwa/push').then((m) => m.unsubscribePushOnLogout(token)).catch(() => {});
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
