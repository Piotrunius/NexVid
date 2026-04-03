/* ============================================
   Homepage – Apple Sequoia Pitch Black
   ============================================ */

import { MediaRow } from '@/components/media/MediaCard';
import { HomePageClient } from '@/components/pages/HomePageClient';
import { loadPublicBlockedMedia } from '@/lib/cloudSync';
import { getPopular, getTitleLogoSvgPath, getTopRated, getTrending } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/utils';
import type { MediaItem } from '@/types';
import { Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export const runtime = 'edge';
export const revalidate = 3600; // Revalidate every hour

export default async function HomePage() {
  let trending: MediaItem[] = [];
  let popular: MediaItem[] = [];
  let topMovies: MediaItem[] = [];
  let topShows: MediaItem[] = [];
  let featured: MediaItem | null = null;
  let featuredLogoSvgPath: string | null = null;

  try {
    const [t, p, m, s, blockedRes] = await Promise.all([
      getTrending('all', 'week'),
      getPopular('movie'),
      getTopRated('movie'),
      getTopRated('tv'),
      loadPublicBlockedMedia().catch(() => ({ items: [] })),
    ]);

    const blocked = blockedRes.items || [];
    const filterBlocked = (items: MediaItem[]) =>
      items.filter(item => !blocked.some((b: any) => String(b.tmdbId) === String(item.tmdbId) && b.mediaType === (item.mediaType === 'show' ? 'tv' : 'movie')));

    trending = filterBlocked(t);
    popular = filterBlocked(p);
    topMovies = filterBlocked(m);
    topShows = filterBlocked(s);

    if (trending.length > 0) {
      const candidatePool = trending.slice(0, Math.min(8, trending.length));
      const shuffledCandidates = [...candidatePool].sort(() => Math.random() - 0.5);

      for (const candidate of shuffledCandidates) {
        try {
          const logoPath = await getTitleLogoSvgPath(candidate.mediaType, candidate.tmdbId, ['en', 'pl']);
          if (logoPath) {
            featured = candidate;
            featuredLogoSvgPath = logoPath;
            break;
          }
        } catch (logoError) {
          console.warn('Failed to load featured title SVG logo:', logoError);
        }
      }

      if (!featured) {
        featured = candidatePool[0] || trending[0];
      }
    }
  } catch (err) {
    console.error('Failed to load homepage data:', err);
  }

  return (
    <div className="min-h-screen">
      {/* ── Hero Section ── */}
      {featured ? (
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
          <div className="absolute inset-0 flex items-center justify-start pt-20">
            <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
              <div className="max-w-[40rem] space-y-6">
                <div className="flex flex-wrap items-center gap-3 animate-fade-in opacity-90">
                  <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-[10px] shadow-[0_0_12px_rgba(0,0,0,0.35)]">
                    {featured.mediaType === 'movie' ? 'Movie' : 'TV'}
                  </span>
                  <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-[10px] shadow-[0_0_12px_rgba(0,0,0,0.35)]">
                    {featured.releaseYear || 'N/A'}
                  </span>
                  {featured.voteAverage > 0 && (
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-[10px] shadow-[0_0_12px_rgba(0,0,0,0.35)]">
                      {(featured.voteAverage * 10).toFixed(0)}% Match
                    </span>
                  )}
                </div>

                {featuredLogoSvgPath ? (
                  <div className="animate-slide-up">
                    <img
                      src={tmdbImage(featuredLogoSvgPath, 'original')}
                      alt={featured.title}
                      className="h-auto w-auto max-h-[140px] max-w-[min(86vw,34rem)] object-contain object-left drop-shadow-[0_10px_24px_rgba(0,0,0,0.62)] sm:max-h-[170px] lg:max-h-[190px]"
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                    />
                  </div>
                ) : (
                  <h1 className="animate-slide-up text-[48px] font-black leading-[1.1] tracking-tight text-white sm:text-[64px] lg:text-[72px]">
                    {featured.title}
                  </h1>
                )}

                <p className="animate-slide-up line-clamp-3 text-[16px] leading-relaxed text-white/60 [animation-delay:100ms] sm:text-[18px]">
                  {featured.overview}
                </p>

                <div className="flex animate-slide-up flex-wrap items-center gap-4 pt-4 [animation-delay:200ms]">
                  <Link
                    href={`/watch/${featured.mediaType}/${featured.tmdbId}`}
                    className="btn-accent group relative overflow-hidden !px-10 !py-4 text-[15px] font-bold"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <Play className="h-5 w-5 fill-current stroke-[1.85] transition-transform group-hover:scale-110" />
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
      ) : (
        <section className="relative h-[90vh] min-h-[640px] bg-black animate-pulse" />
      )}

      {/* ── Content Rows ── */}
      <div className="relative z-10 -mt-32 space-y-4 pb-24 sm:-mt-36">
        <HomePageClient />

        <MediaRow title="Trending This Week" items={trending} showType href="/browse?tab=trending" enableControls seeAllAsButton />
        <MediaRow title="Popular Movies" items={popular} href="/browse?tab=movies" enableControls seeAllAsButton />
        <MediaRow title="Top Rated Movies" items={topMovies} href="/browse?tab=movies" enableControls seeAllAsButton />
        <MediaRow title="Top Rated TV Shows" items={topShows} href="/browse?tab=shows" enableControls seeAllAsButton />
      </div>
    </div>
  );
}
