/* ============================================
   Homepage – Apple Sequoia Pitch Black
   ============================================ */

import { MediaRow } from '@/components/media/MediaCard';
import { FeaturedHeroClient } from '@/components/pages/FeaturedHeroClient';
import { HomePageClient } from '@/components/pages/HomePageClient';
import { loadPublicBlockedMedia } from '@/lib/cloudSync';
import { toTmdbMediaType } from '@/lib/mediaType';
import { getPopular, getTopRated, getTrending, getTitleLogoSvgPath } from '@/lib/tmdb';
import type { MediaItem } from '@/types';

export const runtime = 'edge';
export const revalidate = 3600; // Revalidate every hour

export default async function HomePage() {
  let trending: MediaItem[] = [];
  let popular: MediaItem[] = [];
  let topMovies: MediaItem[] = [];
  let topShows: MediaItem[] = [];

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
      items.filter((item) => {
        const normalizedType = toTmdbMediaType(item.mediaType);
        return !blocked.some(
          (b: any) => String(b.tmdbId) === String(item.tmdbId) && b.mediaType === normalizedType,
        );
      });

    trending = filterBlocked(t);
    popular = filterBlocked(p);
    topMovies = filterBlocked(m);
    topShows = filterBlocked(s);
  } catch (err) {
    console.error('Failed to load homepage data:', err);
  }

  return (
    <div className="min-h-screen">
      {/* ── Hero Section ── */}
      <FeaturedHeroClient items={trending.slice(0, 20)} />

      {/* ── Content Rows ── */}
      <div className="relative z-10 -mt-32 space-y-4 pb-24 sm:-mt-36">
        <HomePageClient />

        <MediaRow
          title="Trending This Week"
          items={trending}
          showType
          href="/browse?tab=trending"
          enableControls
          seeAllAsButton
        />
        <MediaRow
          title="Popular Movies"
          items={popular}
          href="/browse?tab=movies"
          enableControls
          seeAllAsButton
        />
        <MediaRow
          title="Top Rated Movies"
          items={topMovies}
          href="/browse?tab=movies"
          enableControls
          seeAllAsButton
        />
        <MediaRow
          title="Top Rated TV Shows"
          items={topShows}
          href="/browse?tab=shows"
          enableControls
          seeAllAsButton
        />
      </div>
    </div>
  );
}
