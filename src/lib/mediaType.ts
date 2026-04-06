import type { MediaType } from '@/types';

export function normalizeMediaType(value: unknown): MediaType {
  const raw = String(value || '').trim().toLowerCase();
  // Handle various TV show indicators
  if (raw === 'show' || raw === 'tv' || raw === 'series' || raw === 'tvshow' || raw === 'tv_show' || raw === 'tv-show') {
    return 'show';
  }
  return 'movie';
}

export function toTmdbMediaType(value: unknown): 'movie' | 'tv' {
  return normalizeMediaType(value) === 'show' ? 'tv' : 'movie';
}
