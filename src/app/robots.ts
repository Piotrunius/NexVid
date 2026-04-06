import { SITE_URL } from '@/lib/public-config';
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          'facebookexternalhit',
          'Facebot',
          'meta-externalagent',
          'Twitterbot',
          'LinkedInBot',
          'Discordbot',
          'Slackbot-LinkExpanding',
          'WhatsApp',
          'TelegramBot',
          'Applebot',
          'Applebot-Extended',
          'SkypeUriPreview',
        ],
        allow: '/',
      },
      {
        userAgent: '*',
        allow: '/',
        // Keep non-social crawlers away from sensitive or legally risky routes.
        disallow: ['/admin', '/api/', '/movie/', '/show/', '/watch/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
