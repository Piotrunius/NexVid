/* ============================================
   Watchlist Store (Zustand)
   ============================================ */

import { getCloudToken, saveCloudWatchlist } from '@/lib/cloudSync';
import { generateId } from '@/lib/utils';
import type { WatchlistItem, WatchlistStatus } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistStore {
  items: WatchlistItem[];
  setItems: (items: WatchlistItem[]) => void;

  addItem: (item: Omit<WatchlistItem, 'id' | 'addedAt' | 'updatedAt'>) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, partial: Partial<WatchlistItem>) => void;
  setStatus: (id: string, status: WatchlistStatus) => void;
  updateProgress: (id: string, progress: WatchlistItem['progress']) => void;
  setRating: (id: string, rating: number) => void;
  setNotes: (id: string, notes: string) => void;

  getByTmdbId: (tmdbId: string) => WatchlistItem | undefined;
  getByStatus: (status: WatchlistStatus) => WatchlistItem[];
  isInWatchlist: (tmdbId: string) => boolean;

  importItems: (items: WatchlistItem[]) => void;
  exportItems: () => WatchlistItem[];
  clearAll: () => void;
}

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      setItems: (items) => set({ items }),

      addItem: (item) => {
        const existing = get().items.find((i) => i.tmdbId === item.tmdbId);
        if (existing) return;

        const newItem: WatchlistItem = {
          ...item,
          id: generateId(),
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state: any) => {
          const next = [...state.items, newItem];
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        });
      },

      removeItem: (id) =>
        set((state: any) => {
          const next = state.items.filter((i: WatchlistItem) => i.id !== id);
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      updateItem: (id, partial) =>
        set((state: any) => {
          const next = state.items.map((i: WatchlistItem) =>
            i.id === id ? { ...i, ...partial, updatedAt: new Date().toISOString() } : i
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      setStatus: (id, status) =>
        set((state: any) => {
          const next = state.items.map((i: WatchlistItem) =>
            i.id === id ? { ...i, status, updatedAt: new Date().toISOString() } : i
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      updateProgress: (id: string, progress: WatchlistItem['progress'], mediaMeta?: { tmdbId: string; mediaType: MediaType; title: string; posterPath: string | null }) =>
    set((state: any) => {
      let found = false;
      const next = state.items.map((i: WatchlistItem) => {
        if (i.id === id || (mediaMeta && i.tmdbId === mediaMeta.tmdbId)) {
          found = true;
          return { ...i, progress, status: i.status === 'planned' ? 'watching' : i.status, updatedAt: new Date().toISOString() };
        }
        return i;
      });

      if (!found && mediaMeta) {
        const newItem: WatchlistItem = {
          id: generateId(),
          tmdbId: mediaMeta.tmdbId,
          mediaType: mediaMeta.mediaType,
          title: mediaMeta.title,
          posterPath: mediaMeta.posterPath,
          status: 'watching',
          progress,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updatedItems = [...state.items, newItem];
        if (getCloudToken()) {
          void saveCloudWatchlist(updatedItems).catch(() => {});
        }
        return { items: updatedItems };
      }

      if (found) {
        if (getCloudToken()) {
          void saveCloudWatchlist(next).catch(() => {});
        }
        return { items: next };
      }

      return state;
    }),

      setRating: (id, rating) =>
        set((state: any) => {
          const next = state.items.map((i: WatchlistItem) =>
            i.id === id ? { ...i, rating, updatedAt: new Date().toISOString() } : i
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      setNotes: (id, notes) =>
        set((state: any) => {
          const next = state.items.map((i: WatchlistItem) =>
            i.id === id ? { ...i, notes, updatedAt: new Date().toISOString() } : i
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      getByTmdbId: (tmdbId) => get().items.find((i) => i.tmdbId === tmdbId),
      getByStatus: (status) => get().items.filter((i) => i.status === status),
      isInWatchlist: (tmdbId) => get().items.some((i) => i.tmdbId === tmdbId),

      importItems: (items) =>
        set((state: any) => {
          const existing = new Set(state.items.map((i: WatchlistItem) => i.tmdbId));
          const newItems = items.filter((i) => !existing.has(i.tmdbId));
          const next = [...state.items, ...newItems];
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      exportItems: () => get().items,
      clearAll: () => {
        if (getCloudToken()) {
          void saveCloudWatchlist([]).catch(() => {});
        }
        set({ items: [] });
      },
    }),
    {
      name: 'nexvid-watchlist',
    }
  )
);
