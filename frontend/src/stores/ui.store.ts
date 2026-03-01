import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MenuType = 'sidebar' | 'navbar';

interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  menuType: MenuType;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMenuType: (type: MenuType) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileMenuOpen: false,
      menuType: 'sidebar',
      toggleSidebar:    () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen:   (open) => set({ sidebarOpen: open }),
      setMenuType:      (type) => set({ menuType: type }),
      toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
      closeMobileMenu:  () => set({ mobileMenuOpen: false }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ menuType: state.menuType }),
    }
  )
);

export default useUIStore;
