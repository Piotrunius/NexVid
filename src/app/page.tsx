/* ============================================
   Homepage – Apple Sequoia Pitch Black
   ============================================ */

'use client';

import { MediaRow, MediaRowSkeleton } from '@/components/media/MediaCard';
import { getPopular, getTopRated, getTrending } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/utils';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function HomePage() {
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [topMovies, setTopMovies] = useState<MediaItem[]>([]);
  const [topShows, setTopShows] = useState<MediaItem[]>([]);
  const [featured, setFeatured] = useState<MediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const continueRowRef = useRef<HTMLDivElement>(null);
  const { items } = useWatchlistStore();

  const continueWatching = items
    .filter((item) => (item.progress?.percentage || 0) > 1)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20);

  useEffect(() => {
    async function load() {
      try {
        const [t, p, m, s] = await Promise.all([
          getTrending('all', 'week'),
          getPopular('movie'),
          getTopRated('movie'),
          getTopRated('tv'),
        ]);
        setTrending(t);
        setPopular(p);
        setTopMovies(m);
        setTopShows(s);
        if (t.length > 0) setFeatured(t[Math.floor(Math.random() * Math.min(5, t.length))]);
      } catch (err) {
        console.error('Failed to load homepage data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  useLayoutEffect(() => {
    if (!continueRowRef.current) return;
    continueRowRef.current.scrollTo({ left: 0, behavior: 'auto' });
  }, [continueWatching.length]);

  useEffect(() => {
    const resetRows = () => {
      document.querySelectorAll<HTMLElement>('.scroll-row').forEach((row) => { row.scrollLeft = 0; });
    };
    resetRows();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { resetRows(); raf2 = requestAnimationFrame(resetRows); });
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, [isLoading, trending.length, popular.length, topMovies.length, topShows.length, continueWatching.length]);

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.home-scroll-row'));
    if (rows.length === 0) return;
    let userInteracted = false;
    let rafId = 0;
    const markInteracted = () => { userInteracted = true; if (rafId) cancelAnimationFrame(rafId); };
    const handleRowScroll = (event: Event) => { const row = event.currentTarget as HTMLElement | null; if (row && row.scrollLeft > 2) markInteracted(); };
    const lockToStart = () => { if (userInteracted) return; for (const row of rows) { if (row.scrollLeft !== 0) row.scrollLeft = 0; } rafId = requestAnimationFrame(lockToStart); };
    for (const row of rows) row.addEventListener('scroll', handleRowScroll, { passive: true });
    lockToStart();
    return () => { if (rafId) cancelAnimationFrame(rafId); for (const row of rows) row.removeEventListener('scroll', handleRowScroll); };
  }, [isLoading, trending.length, popular.length, topMovies.length, topShows.length, continueWatching.length]);

  return (
    <div className="min-h-screen">
      {/* ── Hero Section ── */}
      {featured && (
        <section className="relative h-[90vh] min-h-[640px]">
          {/* Background image */}
          <div className="absolute inset-0">
            {featured.backdropPath && (
              <Image
                src={tmdbImage(featured.backdropPath, 'original')}
                alt={featured.title}
                fill
                sizes="100vw"
                className="object-cover object-top"
                priority
              />
            )}
            {/* Pitch black vignette fades */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-black to-transparent" />
            <div className="absolute inset-0 bg-black/15" />
          </div>

          {/* Hero content – centered, minimal */}
          <div className="relative flex h-full items-end pb-32">
            <div className="mx-auto w-full max-w-5xl px-6 sm:px-8">
              <div className="max-w-xl animate-slide-up">
                {/* Glass pill tags */}
                <div className="mb-5 flex items-center gap-3 flex-wrap">
                  <span className="rounded-full bg-accent px-4 py-1.5 text-[11px] font-bold uppercase text-white tracking-[0.15em] shadow-[0_0_24px_var(--accent-glow)]">
                    {featured.mediaType === 'movie' ? 'Movie' : 'TV Show'}
                  </span>
                  {featured.rating > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] backdrop-blur-[20px] px-3 py-1.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span className="text-[12px] font-semibold text-white">{featured.rating}</span>
                    </span>
                  )}
                  <span className="text-[13px] text-white/30 font-medium">{featured.releaseYear}</span>
                </div>

                <h1 className="mb-5 text-5xl font-bold text-white sm:text-6xl lg:text-[68px] leading-[1] tracking-tight">
                  {featured.title}
                </h1>

                <p className="mb-10 text-[15px] text-white/35 line-clamp-3 leading-relaxed max-w-md">
                  {featured.overview}
                </p>

                <div className="flex items-center gap-4">
                  <Link
                    href={featured.mediaType === 'movie' ? `/watch/movie/${featured.tmdbId}` : `/show/${featured.tmdbId}`}
                    className="flex items-center gap-3 rounded-full bg-accent px-8 py-4 text-[15px] font-semibold text-white shadow-[0_0_40px_var(--accent-glow)] hover:bg-accent-hover hover:shadow-[0_0_60px_var(--accent-glow)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-500 ease-[var(--spring)]"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                    Watch Now
                  </Link>
                  <Link
                    href={featured.mediaType === 'movie' ? `/movie/${featured.tmdbId}` : `/show/${featured.tmdbId}`}
                    className="flex items-center gap-2 rounded-full bg-white/[0.06] backdrop-blur-[20px] px-7 py-4 text-[15px] font-medium text-white/60 hover:bg-white/[0.12] hover:text-white hover:border-white/[0.18] active:scale-[0.97] transition-all duration-500 ease-[var(--spring)]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                    </svg>
                    More Info
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Content Rows */}
      <div className="relative z-10 -mt-24 space-y-2">
        {isLoading ? (
          <>
            <MediaRowSkeleton />
            <MediaRowSkeleton />
            <MediaRowSkeleton />
          </>
        ) : (
          <>
            {/* Continue Watching */}
            {continueWatching.length > 0 && (
              <section className="py-8">
                <div className="mb-5 flex items-center justify-between px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
                  <h2 className="text-[20px] font-semibold text-white tracking-tight">Continue Watching</h2>
                  <Link href="/list" className="text-[13px] font-medium text-accent/70 hover:text-accent transition-colors duration-300 flex items-center gap-1">
                    My List
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                  </Link>
                </div>
                <div ref={continueRowRef} className="scroll-row home-scroll-row px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
                  {continueWatching.map((item) => {
                    const href = item.mediaType === 'movie'
                      ? `/watch/movie/${item.tmdbId}${item.progress?.timestamp ? `?t=${item.progress.timestamp}` : ''}`
                      : `/watch/show/${item.tmdbId}?s=${item.progress?.season || 1}&e=${item.progress?.episode || 1}${item.progress?.timestamp ? `&t=${item.progress.timestamp}` : ''}`;

                    return (
                      <Link key={item.id} href={href} className="media-card group media-grid-item w-[220px]">
                        <div className="relative overflow-hidden rounded-[24px] aspect-[2/3]">
                          {item.posterPath ? (
                            <Image src={tmdbImage(item.posterPath, 'w342')} alt={item.title} fill className="object-cover transition-transform duration-700 ease-[var(--spring)] group-hover:scale-[1.08]" sizes="220px" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-black" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-4">
                            <p className="text-[13px] font-semibold text-white line-clamp-1">{item.title}</p>
                            <p className="text-[11px] text-white/40 mt-0.5">
                              {item.mediaType === 'show' && item.progress?.season && item.progress?.episode
                                ? `S${item.progress.season} E${item.progress.episode}`
                                : 'Movie'}
                            </p>
                            <div className="mt-3 h-[3px] rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full bg-accent rounded-full shadow-[0_0_12px_var(--accent-glow)]" style={{ width: `${item.progress?.percentage || 0}%` }} />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
            <MediaRow title="Trending This Week" items={trending} showType href="/browse?tab=trending" />
            <MediaRow title="Popular Movies" items={popular} href="/browse?tab=movies" />
            <MediaRow title="Top Rated Movies" items={topMovies} href="/browse?tab=movies" />
            <MediaRow title="Top Rated TV Shows" items={topShows} href="/browse?tab=shows" />
          </>
        )}
      </div>
    </div>
  );
}
