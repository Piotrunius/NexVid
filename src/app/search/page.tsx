/* ============================================
   Search Page – macOS Spotlight-inspired
   ============================================ */

'use client';

import { MediaCard, MediaCardSkeleton } from '@/components/media/MediaCard';
import { searchMedia } from '@/lib/tmdb';
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
    <div className="min-h-screen py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
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
  const inputRef = useRef<HTMLInputElement>(null);

  const [results, setResults] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    if (query) doSearch(query);
    inputRef.current?.focus();
  }, [query]);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setIsLoading(true);
    setSearched(true);
    try {
      const { results } = await searchMedia(q.trim());
      setResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) router.push(`/search?q=${encodeURIComponent(localQuery.trim())}`);
  };

  return (
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Spotlight-style search bar */}
        <form onSubmit={handleSubmit} className="mb-8">
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
