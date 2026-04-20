import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FiscalMode = 'FORMAL' | 'INFORMAL';
export type FiscalModeView = FiscalMode | 'ALL';

interface FiscalModeState {
  /** Active mode sent to API via X-Fiscal-Mode header */
  mode: FiscalMode;
  /** View mode for UI — ALL shows both with indicators */
  viewMode: FiscalModeView;
  setMode: (mode: FiscalMode) => void;
  setViewMode: (viewMode: FiscalModeView) => void;
}

export const useFiscalModeStore = create<FiscalModeState>()(
  persist(
    (set) => ({
      mode: 'FORMAL',
      viewMode: 'FORMAL',
      setMode: (mode) => set({ mode, viewMode: mode }),
      setViewMode: (viewMode) => {
        if (viewMode === 'ALL') {
          set({ viewMode: 'ALL' });
        } else {
          set({ mode: viewMode, viewMode });
        }
      },
    }),
    { name: 'cloud-bill-fiscal-mode' }
  )
);
