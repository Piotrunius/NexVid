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
      setResults(filtered);
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
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
      <div>
        {/* Spotlight-style search bar */}
        <form onSubmit={handleSubmit} className="mb-7">
          <div className="relative max-w-xl mx-auto">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Search movies & TV shows..."
              className="w-full rounded-full bg-white/[0.04] px-5 pl-12 py-4 text-[15px] text-text-primary placeholder:text-text-muted backdrop-blur-[80px] backdrop-saturate-[200%] shadow-[0_8px_40px_rgba(0,0,0,0.4)] outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-muted),0_8px_40px_rgba(0,0,0,0.4)] transition-all duration-200"
            />
            {localQuery && (
              <button
                type="button"
                onClick={() => { setLocalQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted hover:text-text-primary hover:bg-[var(--bg-glass-light)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </form>

        <div className="mb-6 flex items-center justify-center">
          <div className="inline-flex rounded-full bg-white/[0.04] p-1 backdrop-blur-2xl">
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
                    : 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary',
                )}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="media-grid">
            {Array.from({ length: 12 }).map((_, i) => <MediaCardSkeleton key={i} />)}
          </div>
        ) : results.length > 0 ? (
          <>
            <p className="text-[13px] text-text-secondary mb-4">
              Found <span className="text-text-primary font-medium">{results.length}</span> results for{' '}
              <span className="text-accent font-medium">&quot;{query}&quot;</span>
              {searchType !== 'all' && (
                <>
                  {' '}in{' '}
                  <span className="text-text-primary font-medium">{searchType === 'movie' ? 'Movies' : 'TV Shows'}</span>
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
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-glass-light)] mb-4">
              <svg className="text-text-muted" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <p className="text-[15px] font-medium text-text-secondary">No results found for &quot;{query}&quot;</p>
            <p className="text-[13px] text-text-muted mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-glass-light)] mb-4">
              <svg className="text-text-muted" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <p className="text-[15px] font-medium text-text-secondary">Search for movies & TV shows</p>
            <p className="text-[13px] text-text-muted mt-1">Type a title, actor, or keyword</p>
          </div>
        )}
      </div>
    </div>
  );
}
