'use client';

import { getRecommendations } from '@/lib/tmdb';
import { normalizeMediaType, toTmdbMediaType } from '@/lib/mediaType';
import { cn } from '@/lib/utils';
import { useBlockedContentStore } from '@/stores/blockedContent';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { MediaRow, MediaRowSkeleton } from './MediaCard';

export function RecommendationRows() {
  const { items } = useWatchlistStore();

  const eligibleItems = useMemo(() => {
    return items
      .filter((i) => (i.progress?.percentage || 0) > 10 || i.status === 'Completed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [items]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [activeRecommendations, setActiveRecommendations] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { blockedItems, isBlocked } = useBlockedContentStore();

  useEffect(() => {
    if (eligibleItems.length > 0) {
      if (!selectedId || !eligibleItems.some(i => i.id === selectedId)) {
        setSelectedId(eligibleItems[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [eligibleItems, selectedId]);

  const selectedItem = useMemo(() =>
    eligibleItems.find(i => i.id === selectedId),
    [eligibleItems, selectedId]
  );

  useEffect(() => {
    async function loadRecommendations() {
      if (!selectedItem) {
        setRecommendations([]);
        return;
      }

      setIsLoading(true);
      try {
        const apiType = toTmdbMediaType(selectedItem.mediaType);
        const recs = await getRecommendations(apiType, selectedItem.tmdbId);
        const filteredRecs = recs.filter(
          (rec) =>
            !items.some((i) => String(i.tmdbId) === String(rec.tmdbId)) &&
            !isBlocked(rec.tmdbId, rec.mediaType)
        );
        setRecommendations(filteredRecs.slice(0, 20));
      } catch (err) {
        console.error(`Failed to load recommendations for ${selectedItem?.title}:`, err);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    }

    loadRecommendations();
  }, [selectedItem, items, blockedItems]);

  if (eligibleItems.length === 0) return null;

  const header = (
    <div className="flex flex-col gap-3 overflow-hidden">
      <h2 className="text-[20px] font-semibold text-white tracking-tight break-words break-all">
        Because you watched <span className="text-accent">{selectedItem?.title}</span>
      </h2>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none touch-pan-x overscroll-x-contain">
        {eligibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={cn(
              "whitespace-nowrap px-4 py-1.5 rounded-full text-[12px] font-bold transition-all duration-300 border-2",
              selectedId === item.id
                ? "bg-accent/20 border-accent text-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]"
                : "bg-white/[0.03] border-white/10 text-white/40 hover:text-white/70 hover:bg-white/10"
            )}
          >
            {item.title}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative">
      {isLoading && isInitialLoad ? (
        <MediaRowSkeleton title={header} />
      ) : recommendations.length > 0 ? (
        <MediaRow
          title={header}
          items={recommendations}
          enableControls
          showType
          noPadding
          href={`/${normalizeMediaType(selectedItem?.mediaType)}/${selectedItem?.tmdbId}`}
          seeAllAsButton
          seeAllLabel="View Title"
        />
      ) : selectedItem ? (
        <div className="space-y-4 py-4">
          <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">{header}</div>
          <div className="mx-4 sm:mx-6 lg:mx-10 xl:mx-14 2xl:mx-16 h-32 flex items-center justify-center rounded-[24px] bg-white/[0.02] border border-white/5 border-dashed">
            <p className="text-white/30 text-[13px]">No recommendations found for this title</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
