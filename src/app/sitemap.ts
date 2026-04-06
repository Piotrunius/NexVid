import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.APP_BASE_URL || 'https://nexvid.online').replace(/\/$/, '');

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route, index) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    priority: index === 0 ? 1 : route === '/browse' || route === '/list' || route === '/settings' || route === '/login' ? 0.8 : 0.64,
  }));

  return staticEntries;
}
