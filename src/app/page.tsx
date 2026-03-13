/* ============================================
   Homepage – Apple Sequoia Pitch Black
   ============================================ */

'use client';

import { MediaRow, MediaRowSkeleton } from '@/components/media/MediaCard';
import { RecommendationRows } from '@/components/media/RecommendationRows';
import { getPopular, getTopRated, getTrending } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/utils';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function HomePage() {
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [topMovies, setTopMovies] = useState<MediaItem[]>([]);
  const [topShows, setTopShows] = useState<MediaItem[]>([]);
  const [featured, setFeatured] = useState<MediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
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
    if (isLoading) return;
    const rows = document.querySelectorAll('.media-row-viewport');
    let rafId: number;

    const handleRowScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      const scrollLeft = target.scrollLeft;
      const maxScroll = target.scrollWidth - target.clientWidth;
      const progress = scrollLeft / maxScroll;
      
      const container = target.closest('.media-row-container');
      if (container) {
        const bg = container.querySelector('.media-row-bg') as HTMLDivElement;
        if (bg) {
          bg.style.transform = `translateX(${progress * 20}px) scale(1.05)`;
        }
      }
    };

    const update = () => {
      for (const row of rows) {
        row.addEventListener('scroll', handleRowScroll, { passive: true });
      }
    };

    rafId = requestAnimationFrame(update);
    return () => { if (rafId) cancelAnimationFrame(rafId); for (const row of rows) row.removeEventListener('scroll', handleRowScroll); };
  }, [isLoading, trending.length, popular.length, topMovies.length, topShows.length, continueWatching.length]);

  return (
    <div className="min-h-screen">
      {/* ── Hero Section ── */}
      {featured && (
        <section className="relative h-[90vh] min-h-[640px]">
          {/* Background image */}
          <div className="absolute inset-0">
            <Image
              src={tmdbImage(featured.backdropPath, 'original')}
              alt={featured.title}
              fill
              priority
              className="object-cover transition-opacity duration-1000"
              sizes="100vw"
            />
            {/* Apple Sequoia Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/20 to-transparent" />
          </div>

          {/* Hero Content */}
          <div className="absolute inset-0 flex items-center pt-20">
            <div className="mx-auto w-full max-w-7xl px-6 sm:px-8">
              <div className="max-w-2xl space-y-6">
                <div className="flex flex-wrap items-center gap-3 animate-fade-in opacity-80">
                  <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-black uppercase tracking-widest text-white backdrop-blur-md shadow-[0_0_0_0.5px_rgba(255,255,255,0.1)]">
                    {featured.mediaType === 'movie' ? 'Movie' : 'TV Series'}
                  </span>
                  <span className="text-[13px] font-bold text-white/60">
                    {featured.releaseDate?.split('-')[0]}
                  </span>
                  {featured.voteAverage > 0 && (
                    <div className="flex items-center gap-1 text-emerald-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                      <span className="text-[13px] font-black tracking-tighter">{(featured.voteAverage * 10).toFixed(0)}% Match</span>
                    </div>
                  )}
                </div>

                <h1 className="animate-slide-up text-[48px] font-black leading-[1.1] tracking-tight text-white sm:text-[64px] lg:text-[72px]">
                  {featured.title}
                </h1>

                <p className="animate-slide-up line-clamp-3 text-[16px] leading-relaxed text-white/60 [animation-delay:100ms] sm:text-[18px]">
                  {featured.overview}
                </p>

                <div className="flex animate-slide-up flex-wrap items-center gap-4 pt-4 [animation-delay:200ms]">
                  <Link
                    href={`/watch/${featured.mediaType}/${featured.tmdbId}`}
                    className="btn-accent group relative overflow-hidden !px-10 !py-4 text-[15px] font-bold"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="transition-transform group-hover:scale-110">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                    Watch Now
                  </Link>
                  <Link
                    href={`/${featured.mediaType}/${featured.tmdbId}`}
                    className="btn-glass !px-8 !py-4 text-[15px] font-bold"
                  >
                    More Info
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Content Rows ── */}
      <div className="relative z-10 -mt-32 space-y-4 pb-24 sm:-mt-48">
        {isLoading ? (
          <div className="space-y-4 px-6 sm:px-8">
            <MediaRowSkeleton title="Trending Now" />
            <MediaRowSkeleton title="Continue Watching" />
            <MediaRowSkeleton title="Popular Movies" />
          </div>
        ) : (
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

            <MediaRow title="Trending This Week" items={trending} showType href="/browse?tab=trending" enableControls seeAllAsButton />
            <MediaRow title="Popular Movies" items={popular} href="/browse?tab=movies" enableControls seeAllAsButton />
            <MediaRow title="Top Rated Movies" items={topMovies} href="/browse?tab=movies" enableControls seeAllAsButton />
            <MediaRow title="Top Rated TV Shows" items={topShows} href="/browse?tab=shows" enableControls seeAllAsButton />
          </>
        )}
      </div>

    </div>
  );
}
