/* ============================================
   Watchlist Store (Zustand)
   ============================================ */

import { getCloudToken, saveCloudWatchlist } from "@/lib/cloudSync";
import { normalizeMediaType as normalizeMediaTypeBase } from "@/lib/mediaType";
import { generateId } from "@/lib/utils";
import type { MediaType, WatchlistItem, WatchlistStatus } from "@/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WatchlistStore {
  items: WatchlistItem[];
  setItems: (items: WatchlistItem[]) => void;

  addItem: (item: Omit<WatchlistItem, "id" | "addedAt" | "updatedAt">) => void;
  removeItem: (id: string) => void;
  clearProgress: (id: string) => void; // New: Clears progress but keeps in My List
  updateItem: (id: string, partial: Partial<WatchlistItem>) => void;
  setStatus: (id: string, status: WatchlistStatus) => void;
  updateProgress: (
    id: string,
    progress: WatchlistItem["progress"],
    mediaMeta?: {
      tmdbId: string;
      mediaType: MediaType;
      title: string;
      posterPath: string | null;
    },
  ) => void;
  setRating: (id: string, rating: number) => void;
  setNotes: (id: string, notes: string) => void;

  getByTmdbId: (tmdbId: string) => WatchlistItem | undefined;
  getByStatus: (status: WatchlistStatus) => WatchlistItem[];
  isInWatchlist: (tmdbId: string) => boolean;

  importItems: (items: WatchlistItem[]) => void;
  exportItems: () => WatchlistItem[];
  clearAll: () => void;
}

function normalizeMediaType(raw: unknown): MediaType {
  return normalizeMediaTypeBase(raw);
}

function normalizeWatchlistStatus(raw: unknown): WatchlistStatus {
  const value = String(raw || "").trim();
  if (
    value === "Planned" ||
    value === "Watching" ||
    value === "Completed" ||
    value === "Dropped" ||
    value === "On-Hold" ||
    value === "none"
  ) {
    return value;
  }
  return "Planned";
}

function normalizeWatchlistItem(item: any): WatchlistItem {
  const tmdbId = String(item?.tmdbId ?? item?.tmdb_id ?? item?.id ?? "").trim();
  const now = new Date().toISOString();
  const rawType = item?.mediaType ?? item?.media_type ?? item?.type;
  const normalizedFromRaw = normalizeMediaType(rawType);
  const hasEpisodeProgress =
    Number(item?.progress?.season || 0) > 0 ||
    Number(item?.progress?.episode || 0) > 0;
  const normalizedMediaType: MediaType = hasEpisodeProgress
    ? "show"
    : normalizedFromRaw;

  return {
    ...item,
    tmdbId,
    mediaType: normalizedMediaType,
    title: String(item?.title ?? item?.name ?? ""),
    posterPath: item?.posterPath ?? item?.poster_path ?? null,
    status: normalizeWatchlistStatus(item?.status),
    addedAt: item?.addedAt || now,
    updatedAt: item?.updatedAt || now,
  };
}

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      setItems: (items) => {
        const normalized = (items || [])
          .map(normalizeWatchlistItem)
          .filter((item) => Boolean(item.tmdbId));
        set({ items: normalized });
      },

      addItem: (item) => {
        const existing = get().items.find((i) => i.tmdbId === item.tmdbId);
        if (existing) {
          // If already in list but hidden (only in continue Watching), unhide it
          if (existing.status === "none" || existing.hidden) {
            get().updateItem(existing.id, {
              status: item.status || "Planned",
              hidden: false,
            });
          }
          return;
        }

        const newItem: WatchlistItem = {
          ...item,
          mediaType: normalizeMediaType(item.mediaType),
          id: generateId(),
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: item.status || "Planned",
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
              i.id === id
                ? {
                    ...i,
                    status: "none",
                    hidden: true,
                    updatedAt: new Date().toISOString(),
                  }
                : i,
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
          if (item.status === "none") {
            next = state.items.filter((i: WatchlistItem) => i.id !== id);
          } else {
            next = state.items.map((i: WatchlistItem) =>
              i.id === id
                ? {
                    ...i,
                    progress: undefined,
                    updatedAt: new Date().toISOString(),
                  }
                : i,
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
            i.id === id
              ? { ...i, ...partial, updatedAt: new Date().toISOString() }
              : i,
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      setStatus: (id, status) =>
        set((state: any) => {
          const next = state.items.map((i: WatchlistItem) =>
            i.id === id
              ? {
                  ...i,
                  status,
                  hidden: status === "none",
                  updatedAt: new Date().toISOString(),
                }
              : i,
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      updateProgress: (
        id: string,
        progress: WatchlistItem["progress"],
        mediaMeta?: {
          tmdbId: string;
          mediaType: MediaType;
          title: string;
          posterPath: string | null;
        },
      ) =>
        set((state: any) => {
          let found = false;
          const next = state.items.map((i: WatchlistItem) => {
            if (
              i.id === id ||
              (mediaMeta && String(i.tmdbId) === String(mediaMeta.tmdbId))
            ) {
              found = true;
              // Accumulate forward playback delta into totalWatchedMinutes.
              // We only count small forward steps (≤120 s) so that seeking
              // and episode transitions (which produce a large negative delta)
              // don't inflate or deflate the counter.
              const prevTimestamp = i.progress?.timestamp ?? 0;
              const newTimestamp = progress?.timestamp ?? 0;
              const delta = newTimestamp - prevTimestamp;
              const addedMinutes = delta > 0 && delta <= 120 ? delta / 60 : 0;
              const totalWatchedMinutes =
                (i.totalWatchedMinutes ?? 0) + addedMinutes;

              // Do NOT auto-change status to 'Watching' anymore.
              // Keep existing status (could be 'none', 'Planned', etc.)
              return {
                ...i,
                progress,
                totalWatchedMinutes,
                updatedAt: new Date().toISOString(),
              };
            }
            return i;
          });

          if (!found && mediaMeta) {
            const newItem: WatchlistItem = {
              id: generateId(),
              tmdbId: String(mediaMeta.tmdbId),
              mediaType: normalizeMediaType(mediaMeta.mediaType),
              title: mediaMeta.title,
              posterPath: mediaMeta.posterPath,
              status: "none", // Default to none so it only shows in Continue Watching
              progress,
              totalWatchedMinutes: 0,
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
            i.id === id
              ? { ...i, rating, updatedAt: new Date().toISOString() }
              : i,
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      setNotes: (id, notes) =>
        set((state: any) => {
          const next = state.items.map((i: WatchlistItem) =>
            i.id === id
              ? { ...i, notes, updatedAt: new Date().toISOString() }
              : i,
          );
          if (getCloudToken()) {
            void saveCloudWatchlist(next).catch(() => {});
          }
          return { items: next };
        }),

      getByTmdbId: (tmdbId) => get().items.find((i) => i.tmdbId === tmdbId),
      getByStatus: (status) => get().items.filter((i) => i.status === status),
      isInWatchlist: (tmdbId) =>
        get().items.some((i) => i.tmdbId === tmdbId && i.status !== "none"),

      importItems: (items) =>
        set((state: any) => {
          const existing = new Set(
            state.items.map((i: WatchlistItem) => i.tmdbId),
          );
          const newItems = (items || [])
            .map(normalizeWatchlistItem)
            .filter((i) => i.tmdbId && !existing.has(i.tmdbId));
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
      name: "nexvid-watchlist",
      merge: (persistedState, currentState) => {
        const typedPersisted = (persistedState ||
          {}) as Partial<WatchlistStore>;
        const rawItems = Array.isArray(typedPersisted.items)
          ? typedPersisted.items
          : [];
        const normalizedItems = rawItems
          .map(normalizeWatchlistItem)
          .filter((item) => Boolean(item.tmdbId));

        return {
          ...currentState,
          ...typedPersisted,
          items: normalizedItems,
        };
      },
    },
  ),
);
