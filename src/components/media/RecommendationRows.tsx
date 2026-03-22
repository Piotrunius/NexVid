'use client';

import { getRecommendations } from '@/lib/tmdb';
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
  const [isLoading, setIsLoading] = useState(false);
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
        const apiType = selectedItem.mediaType === 'show' ? 'tv' : 'movie';
        const recs = await getRecommendations(apiType, selectedItem.tmdbId);
        const filteredRecs = recs.filter(
          (rec) =>
            !items.some((i) => String(i.tmdbId) === String(rec.tmdbId)) &&
            !isBlocked(rec.tmdbId, rec.mediaType)
        );
        setRecommendations(filteredRecs.slice(0, 20));
      } catch (err) {
        console.error(`Failed to load recommendations for ${selectedItem?.title}:`, err);
        setRecommendations([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadRecommendations();
  }, [selectedItem, items, blockedItems]);

  if (eligibleItems.length === 0) return null;

  const header = (
    <div className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold text-white tracking-tight">
        Because you watched <span className="text-accent">{selectedItem?.title}</span>
      </h2>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {eligibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={cn(
              "whitespace-nowrap px-4 py-1.5 rounded-full text-[12px] font-bold transition-all duration-300 border backdrop-blur-md",
              selectedId === item.id
                ? "bg-accent/20 border-accent/40 text-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]"
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
      {isLoading ? (
        <MediaRowSkeleton title={header} />
      ) : recommendations.length > 0 ? (
        <MediaRow
          title={header}
          items={recommendations}
          enableControls
          showType
          noPadding
          href={`/${selectedItem?.mediaType === 'show' ? 'show' : 'movie'}/${selectedItem?.tmdbId}`}
          seeAllAsButton
          seeAllLabel="View Title"
        />
      ) : selectedItem ? (
        <div className="space-y-4 py-4">
          <div className="px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">{header}</div>
          <div className="px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto h-32 flex items-center justify-center rounded-[24px] bg-white/[0.02] border border-white/5 border-dashed">
            <p className="text-white/30 text-[13px]">No recommendations found for this title</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
