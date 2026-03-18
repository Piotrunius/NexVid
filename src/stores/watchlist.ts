/* ============================================
   Watchlist Store (Zustand)
   ============================================ */

import { getCloudToken, saveCloudWatchlist } from '@/lib/cloudSync';
import { generateId } from '@/lib/utils';
import type { WatchlistItem, WatchlistStatus, MediaType } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistStore {
  items: WatchlistItem[];
  setItems: (items: WatchlistItem[]) => void;

  addItem: (item: Omit<WatchlistItem, 'id' | 'addedAt' | 'updatedAt'>) => void;
  removeItem: (id: string) => void;
  clearProgress: (id: string) => void; // New: Clears progress but keeps in My List
  updateItem: (id: string, partial: Partial<WatchlistItem>) => void;
  setStatus: (id: string, status: WatchlistStatus) => void;
  updateProgress: (id: string, progress: WatchlistItem['progress'], mediaMeta?: { tmdbId: string; mediaType: MediaType; title: string; posterPath: string | null }) => void;
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
        if (existing) {
          // If already in list but hidden (only in continue watching), unhide it
          if (existing.status === 'none' || existing.hidden) {
             get().updateItem(existing.id, { status: item.status || 'planned', hidden: false });
          }
          return;
        }

        const newItem: WatchlistItem = {
          ...item,
          id: generateId(),
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: item.status || 'planned',
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
          // Instead of total removal, we check if it has progress
          // If it has progress, we keep it but set status to 'none' and mark as hidden
          // If it has NO progress, we remove it completely
          const item = state.items.find((i: WatchlistItem) => i.id === id);
          if (!item) return state;

          let next;
          const hasSignificantProgress = (item.progress?.percentage || 0) > 0.1;

          if (hasSignificantProgress) {
            next = state.items.map((i: WatchlistItem) => 
              i.id === id ? { ...i, status: 'none', hidden: true, updatedAt: new Date().toISOString() } : i
            );
          } else {
            next = state.items.filter((i: WatchlistItem) => i.id !== id);
          }

          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      clearProgress: (id) =>
        set((state: any) => {
          // Completely remove from "Continue Watching" by resetting progress
          // If status is 'none', it means it was only in Continue Watching, so we remove it
          const item = state.items.find((i: WatchlistItem) => i.id === id);
          if (!item) return state;

          let next;
          if (item.status === 'none') {
            next = state.items.filter((i: WatchlistItem) => i.id !== id);
          } else {
            next = state.items.map((i: WatchlistItem) => 
              i.id === id ? { ...i, progress: undefined, updatedAt: new Date().toISOString() } : i
            );
          }

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
            i.id === id ? { ...i, status, hidden: status === 'none', updatedAt: new Date().toISOString() } : i
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
            if (i.id === id || (mediaMeta && String(i.tmdbId) === String(mediaMeta.tmdbId))) {
              found = true;
              // Do NOT auto-change status to 'watching' anymore. 
              // Keep existing status (could be 'none', 'planned', etc.)
              return { ...i, progress, updatedAt: new Date().toISOString() };
            }
            return i;
          });

          if (!found && mediaMeta) {
            const newItem: WatchlistItem = {
              id: generateId(),
              tmdbId: String(mediaMeta.tmdbId),
              mediaType: mediaMeta.mediaType,
              title: mediaMeta.title,
              posterPath: mediaMeta.posterPath,
              status: 'none', // Default to none so it only shows in Continue Watching
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
      isInWatchlist: (tmdbId) => get().items.some((i) => i.tmdbId === tmdbId && i.status !== 'none'),

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
      name: 'nexvid-settings',
    }
  )
);
