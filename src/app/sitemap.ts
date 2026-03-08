import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nexvid.online').replace(/\/$/, '');
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const staticRoutes = [
  '/',
  '/browse',
  '/list',
  '/settings',
  '/login',
  '/credits',
  '/privacy',
  '/terms',
  '/dmca',
  '/contact',
];

async function fetchPopularIds(type: 'movie' | 'tv', pages = 2): Promise<string[]> {
  if (!TMDB_KEY) return [];

  const ids = new Set<string>();

  for (let page = 1; page <= pages; page += 1) {
    try {
      const url = new URL(`${TMDB_BASE}/${type}/popular`);
      url.searchParams.set('api_key', TMDB_KEY);
      url.searchParams.set('page', String(page));

      const res = await fetch(url.toString(), {
        next: { revalidate: 60 * 60 * 6 },
      });
      if (!res.ok) continue;

      const data = await res.json() as { results?: Array<{ id?: number | string }> };
      for (const item of data.results || []) {
        const id = String(item?.id || '').trim();
        if (id) ids.add(id);
      }
    } catch {
      // ignore partial failures, keep sitemap generation resilient
    }
  }

  return Array.from(ids);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route, index) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    priority: index === 0 ? 1 : route === '/browse' || route === '/list' || route === '/settings' || route === '/login' ? 0.8 : 0.64,
  }));

  const [movieIds, showIds] = await Promise.all([
    fetchPopularIds('movie', 2),
    fetchPopularIds('tv', 2),
  ]);

  const movieEntries: MetadataRoute.Sitemap = movieIds.map((id) => ({
    url: `${SITE_URL}/movie/${id}`,
    lastModified: now,
    priority: 0.7,
  }));

  const showEntries: MetadataRoute.Sitemap = showIds.map((id) => ({
    url: `${SITE_URL}/show/${id}`,
    lastModified: now,
    priority: 0.7,
  }));

  return [...staticEntries, ...movieEntries, ...showEntries];
}
