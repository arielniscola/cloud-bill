import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MenuType = 'sidebar' | 'navbar';

interface UIState {
  sidebarOpen: boolean;
  menuType: MenuType;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMenuType: (type: MenuType) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      menuType: 'sidebar',
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setMenuType: (type) => set({ menuType: type }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        menuType: state.menuType,
      }),
    }
  )
);

export default useUIStore;
