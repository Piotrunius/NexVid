/* ============================================
   Browse Page – macOS-style segmented tabs
   ============================================ */

'use client';

import { MediaCard, MediaCardSkeleton } from '@/components/media/MediaCard';
import { discoverByGenre, getGenres, getPopular, getTopRated, getTrending } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import type { Genre, MediaItem } from '@/types';
import { useCallback, useEffect, useState } from 'react';

type Tab = 'trending' | 'movies' | 'shows';
type Filter = 'popular' | 'top_rated' | string;

export default function BrowsePage() {
  const [tab, setTab] = useState<Tab>('trending');
  const [filter, setFilter] = useState<Filter>('popular');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [movieG, tvG] = await Promise.all([getGenres('movie'), getGenres('tv')]);
        setMovieGenres(movieG);
        setTvGenres(tvG);
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    if (tab === 'movies') setGenres(movieGenres);
    else if (tab === 'shows') setGenres(tvGenres);
    else setGenres([]);
  }, [tab, movieGenres, tvGenres]);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    loadItems(1, true);
  }, [tab, filter]);

  const loadItems = useCallback(
    async (p: number, reset = false) => {
      setIsLoading(true);
      try {
        let results: MediaItem[] = [];
        const mediaType = tab === 'movies' ? 'movie' : tab === 'shows' ? 'tv' : 'all';
        if (tab === 'trending') results = await getTrending(mediaType, 'week', p);
        else if (filter === 'popular') results = await getPopular(mediaType as 'movie' | 'tv', p);
        else if (filter === 'top_rated') results = await getTopRated(mediaType as 'movie' | 'tv', p);
        else results = await discoverByGenre(mediaType as 'movie' | 'tv', parseInt(filter), p);
        if (results.length < 20) setHasMore(false);
        setItems((prev) => (reset ? results : [...prev, ...results]));
      } catch (err) {
        console.error('Failed to load browse items:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [tab, filter]
  );

  const loadMore = () => {
    if (!isLoading && hasMore) {
      const next = page + 1;
      setPage(next);
      loadItems(next);
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'trending', label: 'Trending', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
    { key: 'movies', label: 'Movies', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg> },
    { key: 'shows', label: 'TV Shows', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg> },
  ];

  const filters: { key: Filter; label: string }[] = [
    { key: 'popular', label: 'Popular' },
    { key: 'top_rated', label: 'Top Rated' },
  ];

  return (
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight mb-6">Browse</h1>

        {/* macOS segmented control */}
        <div className="inline-flex rounded-full bg-white/[0.04] backdrop-blur-2xl p-1 mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setFilter('popular'); }}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-medium transition-all duration-200',
                tab === t.key
                  ? 'bg-accent text-white shadow-[0_2px_12px_var(--accent-glow)]'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.06]',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Sub-filters */}
        {tab !== 'trending' && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all duration-200',
                  filter === f.key
                    ? 'bg-accent/10 text-accent shadow-[0_0_0_1px_var(--accent-muted)]'
                    : 'border-white/6 text-text-muted hover:text-text-secondary hover:bg-white/[0.06]',
                )}
              >
                {f.label}
              </button>
            ))}
            <div className="w-px h-5 bg-[var(--border)] self-center mx-1" />
            {genres.map((g) => (
              <button
                key={g.id}
                onClick={() => setFilter(String(g.id))}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all duration-200',
                  filter === String(g.id)
                    ? 'bg-accent/10 text-accent shadow-[0_0_0_1px_var(--accent-muted)]'
                    : 'border-white/6 text-text-muted hover:text-text-secondary hover:bg-white/[0.06]',
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="media-grid">
          {items.map((item) => (
            <MediaCard key={`${item.id}-${item.mediaType}`} item={item} />
          ))}
          {isLoading &&
            Array.from({ length: 12 }).map((_, i) => <MediaCardSkeleton key={`skel-${i}`} />)}
        </div>

        {/* Load More */}
        {hasMore && !isLoading && items.length > 0 && (
          <div className="mt-8 flex justify-center">
            <button onClick={loadMore} className="btn-glass px-8">
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
