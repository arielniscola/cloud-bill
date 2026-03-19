import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NavThemeKey } from '../utils/navThemes';

type MenuType = 'sidebar' | 'navbar';

interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  menuType: MenuType;
  isDarkMode: boolean;
  navTheme: NavThemeKey;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMenuType: (type: MenuType) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  toggleDarkMode: () => void;
  setNavTheme: (theme: NavThemeKey) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileMenuOpen: false,
      menuType: 'sidebar',
      isDarkMode: false,
      navTheme: 'slate',
      toggleSidebar:    () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen:   (open) => set({ sidebarOpen: open }),
      setMenuType:      (type) => set({ menuType: type }),
      toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
      closeMobileMenu:  () => set({ mobileMenuOpen: false }),
      toggleDarkMode:   () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      setNavTheme:      (theme) => set({ navTheme: theme }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        menuType: state.menuType,
        isDarkMode: state.isDarkMode,
        navTheme: state.navTheme,
      }),
    }
  )
);

export default useUIStore;
