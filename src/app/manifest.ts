import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nexvid.online').replace(/\/$/, '');

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NexVid — Watch Movies & TV Shows Online',
    short_name: 'NexVid',
    description:
      'Watch trending movies and TV shows online in one fast, modern streaming hub with smart search, watchlists, and seamless playback.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait',
    categories: ['entertainment', 'movies', 'tv'],
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
