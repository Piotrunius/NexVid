/* ============================================
   Search Page – macOS Spotlight-inspired
   ============================================ */

'use client';

import { MediaCard, MediaCardSkeleton } from '@/components/media/MediaCard';
import { searchMedia } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { useBlockedContentStore } from '@/stores/blockedContent';
import type { MediaItem } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchContent />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
      <div>
        <div className="mb-8 max-w-xl mx-auto">
          <div className="skeleton h-14 rounded-[14px]" />
        </div>
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams?.get('q') || '';
  const typeParam = (searchParams?.get('type') || 'all') as 'all' | 'movie' | 'tv';
  const inputRef = useRef<HTMLInputElement>(null);

  const [results, setResults] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);
  const [searchType, setSearchType] = useState<'all' | 'movie' | 'tv'>(typeParam);
  const { blockedItems, isBlocked } = useBlockedContentStore();

  useEffect(() => {
    setLocalQuery(query);
    setSearchType(typeParam === 'movie' || typeParam === 'tv' ? typeParam : 'all');
  }, [query, typeParam]);

  useEffect(() => {
    if (query) doSearch(query, searchType);
    inputRef.current?.focus();
  }, [query, searchType]);

  async function doSearch(q: string, type: 'all' | 'movie' | 'tv') {
    if (!q.trim()) return;
    setIsLoading(true);
    setSearched(true);
    try {
      const { results } = await searchMedia(q.trim(), 1, type);
      // Filter out blocked items
      const filtered = results.filter(item => !isBlocked(item.tmdbId, item.mediaType));

      // Sort by relevance score: prioritize highly-rated content with good vote count
      const sorted = filtered.sort((a, b) => {
        // Calculate relevance score for each item
        // Factor in: rating (0-10), popularity, and vote count
        const scoreA = (a.rating || 0) * 0.5 + Math.min((a.voteCount || 0) / 1000, 5) * 0.3 + (a.popularity || 0) * 0.2;
        const scoreB = (b.rating || 0) * 0.5 + Math.min((b.voteCount || 0) / 1000, 5) * 0.3 + (b.popularity || 0) * 0.2;
        return scoreB - scoreA; // Higher score first
      });

      setResults(sorted);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localQuery.trim()) return;
    const encoded = encodeURIComponent(localQuery.trim());
    router.push(searchType === 'all' ? `/search?q=${encoded}` : `/search?q=${encoded}&type=${searchType}`);
  };

  const applyType = (type: 'all' | 'movie' | 'tv') => {
    setSearchType(type);
    if (!localQuery.trim()) return;
    const encoded = encodeURIComponent(localQuery.trim());
    router.push(type === 'all' ? `/search?q=${encoded}` : `/search?q=${encoded}&type=${type}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-8 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(255,255,255,0.09),transparent_70%)]" />
      <div className="relative">
        {/* Header section */}
        <div className="mb-8 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:p-6">
          <h1 className="text-[30px] font-bold text-white tracking-tight">Search</h1>
          <p className="mt-1 text-[13px] text-white/50">Find your next favorite movie or show</p>
        </div>

        {/* Search & Filter Section */}
        <div className="mb-12 max-w-2xl mx-auto">
          {/* Search bar */}
          <form onSubmit={handleSubmit} className="mb-4">
            <div className="relative">
              <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                placeholder="Search movies & TV shows..."
                className="w-full rounded-[24px] bg-white/[0.06] backdrop-blur-[40px] shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)] pl-14 pr-12 py-4 text-[15px] text-white placeholder:text-white/25 outline-none focus:shadow-[0_0_40px_var(--accent-muted),0_0_0_1px_var(--accent-muted)] transition-all duration-500"
              />
              {localQuery && (
                <button
                  type="button"
                  onClick={() => { setLocalQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/60 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </form>

          {/* Filter buttons */}
          <div className="flex items-center justify-center">
            <div className="inline-flex rounded-full bg-white/[0.04] backdrop-blur-2xl p-1">
              {([
                { key: 'all', label: 'All' },
                { key: 'movie', label: 'Movies' },
                { key: 'tv', label: 'TV Shows' },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => applyType(item.key)}
                  className={cn(
                    'rounded-full px-5 py-2 text-[13px] font-medium transition-all duration-200',
                    searchType === item.key
                      ? 'bg-accent text-white shadow-[0_2px_12px_var(--accent-glow)]'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]',
                  )}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="media-grid">
            {Array.from({ length: 12 }).map((_, i) => <MediaCardSkeleton key={i} />)}
          </div>
        ) : results.length > 0 ? (
          <>
            <p className="text-[13px] text-white/50 mb-4">
              Found <span className="text-white font-medium">{results.length}</span> results for{' '}
              <span className="text-accent font-medium">&quot;{query}&quot;</span>
              {searchType !== 'all' && (
                <>
                  {' '}in{' '}
                  <span className="text-white font-medium">{searchType === 'movie' ? 'Movies' : 'TV Shows'}</span>
                </>
              )}
            </p>
            <div className="media-grid">
              {results.map((item) => (
                <MediaCard key={`${item.id}-${item.mediaType}`} item={item} showType />
              ))}
            </div>
          </>
        ) : searched ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.02] mb-4">
              <svg className="text-white/20" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <p className="text-[15px] font-medium text-white/70">No results found for &quot;{query}&quot;</p>
            <p className="text-[13px] text-white/40 mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.02] mb-4">
              <svg className="text-white/20" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <p className="text-[15px] font-medium text-white/70">Search for movies & TV shows</p>
            <p className="text-[13px] text-white/40 mt-1">Type a title, actor, or keyword</p>
          </div>
        )}
      </div>
    </div>
  );
}
