import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nexvid.online').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Prevent search engines from indexing media pages that are more likely to trigger copyright takedowns.
      disallow: ['/admin', '/api/', '/movie/', '/show/', '/watch/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
