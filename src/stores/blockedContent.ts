/* ============================================
   Blocked Content Store (Zustand)
   ============================================ */

import { loadPublicBlockedMedia } from '@/lib/cloudSync';
import { toTmdbMediaType } from '@/lib/mediaType';
import { create } from 'zustand';

interface BlockedItem {
  tmdbId: string;
  mediaType: string;
}

interface BlockedContentStore {
  blockedItems: BlockedItem[];
  isLoaded: boolean;
  isLoading: boolean;
  fetchBlockedItems: () => Promise<void>;
  isBlocked: (tmdbId: string, mediaType: string) => boolean;
}

export const useBlockedContentStore = create<BlockedContentStore>((set, get) => ({
  blockedItems: [],
  isLoaded: false,
  isLoading: false,

  fetchBlockedItems: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const { items } = await loadPublicBlockedMedia();
      set({ blockedItems: items || [], isLoaded: true });
    } catch (err) {
      console.error('Failed to load blocked media list:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  isBlocked: (tmdbId: string, mediaType: string) => {
    const normalizedType = toTmdbMediaType(mediaType);
    return get().blockedItems.some(
      (item) => String(item.tmdbId) === String(tmdbId) && item.mediaType === normalizedType
    );
  },
}));
