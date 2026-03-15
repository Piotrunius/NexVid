'use client';

import { MediaRow } from '@/components/media/MediaCard';
import { RecommendationRows } from '@/components/media/RecommendationRows';
import { useWatchlistStore } from '@/stores/watchlist';
import { useRef } from 'react';

export function HomePageClient() {
  const { items } = useWatchlistStore();
  const continueRowRef = useRef<HTMLDivElement>(null);

  const continueWatching = items
    .filter((item) => (item.progress?.percentage || 0) > 1)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20);

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
