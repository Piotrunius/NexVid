'use client';

import { MediaRow } from '@/components/media/MediaCard';
import { RecommendationRows } from '@/components/media/RecommendationRows';
import { useWatchlistStore } from '@/stores/watchlist';
import { useBlockedContentStore } from '@/stores/blockedContent';
import { useRef, useMemo } from 'react';

export function HomePageClient() {
  const { items } = useWatchlistStore();
  const { isBlocked } = useBlockedContentStore();
  const continueRowRef = useRef<HTMLDivElement>(null);

  const continueWatching = useMemo(
    () => items
      .filter((item) => (item.progress?.percentage || 0) > 1 && !isBlocked(item.tmdbId, item.mediaType))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 12),
    [items, isBlocked]
  );

  return (
    <>
      {continueWatching.length > 0 && (
        <MediaRow
          title="Continue Watching"
          items={continueWatching}
          enableControls
          ref={continueRowRef}
        />
      )}
      <RecommendationRows />
    </>
  );
}
