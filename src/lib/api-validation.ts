/**
 * Input validation utilities for API security
 * Validates and sanitizes user inputs
 */

export interface StreamRequestParams {
  tmdbId: string;
  type: 'movie' | 'show';
  season?: number;
  episode?: number;
  sourceId: string;
  title?: string;
  year?: number;
}

/**
 * Validate stream request parameters
 * Returns validation result with errors
 */
export function validateStreamParams(searchParams: URLSearchParams): {
  valid: boolean;
  errors: string[];
  data?: StreamRequestParams;
} {
  const errors: string[] = [];

  // Validate tmdbId
  const tmdbId = (searchParams.get('tmdbId') || searchParams.get('id') || '').trim();
  if (!tmdbId) {
    errors.push('Missing required parameter: tmdbId');
  } else if (!/^\d+$/.test(tmdbId)) {
    errors.push('Invalid tmdbId: must be numeric');
  }

  // Validate type
  const rawType = searchParams.get('type') || searchParams.get('mediaType') || '';
  const type = normalizeType(rawType);
  if (!type) {
    errors.push('Invalid type: must be movie/show');
  }

  // Validate season/episode (must be positive integers if provided)
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  if (season && !/^\d+$/.test(season)) {
    errors.push('Invalid season: must be numeric');
  }
  if (episode && !/^\d+$/.test(episode)) {
    errors.push('Invalid episode: must be numeric');
  }

  // Validate source (allowlist)
  const sourceId = (searchParams.get('source') || 'febbox').trim().toLowerCase();
  const validSources = ['febbox', 'pobreflix', 'beta', 'alpha'];
  if (!validSources.includes(sourceId)) {
    errors.push(`Invalid source: must be one of ${validSources.join(', ')}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      tmdbId: tmdbId!,
      type: type!,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
      sourceId,
      title: (searchParams.get('title') || searchParams.get('name') || '').trim() || undefined,
      year: searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined,
    },
  };
}

/**
 * Normalize media type string
 */
function normalizeType(rawType: string): 'movie' | 'show' | null {
  const value = String(rawType || '').trim().toLowerCase();
  if (value === 'movie' || value === 'film') return 'movie';
  if (value === 'show' || value === 'tv' || value === 'series' || value === 'serial') return 'show';
  return null;
}
