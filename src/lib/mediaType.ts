import type { MediaType } from '@/types';

export function normalizeMediaType(value: unknown): MediaType {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'show' || raw === 'tv' || raw === 'series' ? 'show' : 'movie';
}

export function toTmdbMediaType(value: unknown): 'movie' | 'tv' {
  return normalizeMediaType(value) === 'show' ? 'tv' : 'movie';
}