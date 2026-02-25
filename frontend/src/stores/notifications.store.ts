import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationsState {
  readIds: string[];
  markAsRead: (id: string) => void;
  markAllAsRead: (ids: string[]) => void;
  isRead: (id: string) => boolean;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      readIds: [],
      markAsRead: (id: string) =>
        set((state) => ({ readIds: [...new Set([...state.readIds, id])] })),
      markAllAsRead: (ids: string[]) =>
        set((state) => ({ readIds: [...new Set([...state.readIds, ...ids])] })),
      isRead: (id: string) => get().readIds.includes(id),
    }),
    {
      name: 'notifications-storage',
      partialize: (state) => ({ readIds: state.readIds }),
    }
  )
);
