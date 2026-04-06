/* ============================================
   TMDB API Client
   ============================================ */

import type { CastMember, CrewMember, Episode, Genre, MediaItem, Movie, Season, Show, VideoItem } from '@/types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = '76508fc7baf10d9483564c0f7acbbc21';
const TMDB_REQUEST_TIMEOUT_MS = 10000;

function getApiKey(): string {
  const localOverride = String(process.env.TMDB_API_KEY || '').trim();
  return localOverride || TMDB_API_KEY;
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', getApiKey());
  Object.entries(params).forEach(([key, val]) => url.searchParams.set(key, val));
  return url.toString();
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = TMDB_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const { signal } = init;

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(new Error(`TMDB request timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetchWithTimeout(buildUrl(path, params));
  if (!res.ok) throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---- Transformers ----

function getCertificationFromReleaseDates(data: any): string | undefined {
  const results = data.release_dates?.results;
  if (!Array.isArray(results) || results.length === 0) return undefined;

  const entry = results.find((r: any) => r.iso_3166_1 === 'US') || results[0];
  const rating = entry?.release_dates?.find((d: any) => d.certification)?.certification;
  return rating || undefined;
}

function getRatingFromContentRatings(data: any): string | undefined {
  const results = data.content_ratings?.results;
  if (!Array.isArray(results) || results.length === 0) return undefined;

  const entry = results.find((r: any) => r.iso_3166_1 === 'US') || results[0];
  return entry?.rating;
}

function transformMovie(data: any): Movie {
  return {
    id: data.id,
    tmdbId: String(data.id),
    imdbId: data.imdb_id,
    title: data.title || data.name,
    overview: data.overview || '',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    releaseYear: new Date(data.release_date || data.first_air_date || '').getFullYear() || 0,
    rating: Math.round((data.vote_average || 0) * 10) / 10,
    genres: (data.genres || data.genre_ids?.map((id: number) => ({ id, name: '' })) || []),
    mediaType: 'movie',
    popularity: data.popularity,
    voteCount: data.vote_count,
    runtime: data.runtime || 0,
    certification: getCertificationFromReleaseDates(data),
    cast: data.credits?.cast?.slice(0, 20).map(transformCast),
    crew: data.credits?.crew?.filter((c: any) => ['Director', 'Producer', 'Writer', 'Screenplay'].includes(c.job)).map(transformCrew),
    videos: data.videos?.results?.filter((v: any) => v.site === 'YouTube').map(transformVideo),
    tagline: data.tagline || '',
    status: data.status,
    budget: data.budget || 0,
    revenue: data.revenue || 0,
    productionCompanies: data.production_companies?.map((c: any) => c.name) || [],
    spokenLanguages: data.spoken_languages?.map((l: any) => l.english_name || l.name) || [],
    originCountry: data.origin_country || data.production_countries?.map((c: any) => c.iso_3166_1) || [],
  };
}

function transformShow(data: any): Show {
  return {
    id: data.id,
    tmdbId: String(data.id),
    imdbId: data.external_ids?.imdb_id,
    title: data.name || data.title,
    overview: data.overview || '',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    releaseYear: new Date(data.first_air_date || '').getFullYear() || 0,
    rating: Math.round((data.vote_average || 0) * 10) / 10,
    genres: (data.genres || data.genre_ids?.map((id: number) => ({ id, name: '' })) || []),
    mediaType: 'show',
    popularity: data.popularity,
    voteCount: data.vote_count,
    seasons: (data.seasons || []).map(transformSeason),
    totalEpisodes: data.number_of_episodes || 0,
    certification: getRatingFromContentRatings(data),
    cast: data.credits?.cast?.slice(0, 20).map(transformCast),
    crew: data.credits?.crew?.filter((c: any) => ['Director', 'Producer', 'Writer', 'Screenplay', 'Creator'].includes(c.job)).map(transformCrew),
    videos: data.videos?.results?.filter((v: any) => v.site === 'YouTube').map(transformVideo),
    tagline: data.tagline || '',
    status: data.status,
    networks: data.networks?.map((n: any) => n.name) || [],
    createdBy: data.created_by?.map((c: any) => c.name) || [],
    originCountry: data.origin_country || [],
  };
}

function transformCast(data: any): CastMember {
  return {
    id: data.id,
    name: data.name,
    character: data.character || '',
    profilePath: data.profile_path,
    order: data.order,
  };
}

function transformCrew(data: any): CrewMember {
  return {
    id: data.id,
    name: data.name,
    job: data.job,
    department: data.department,
    profilePath: data.profile_path,
  };
}

function transformVideo(data: any): VideoItem {
  return {
    id: data.id,
    key: data.key,
    name: data.name,
    site: data.site,
    type: data.type,
  };
}

function transformSeason(data: any): Season {
  return {
    id: data.id,
    seasonNumber: data.season_number,
    name: data.name,
    episodeCount: data.episode_count,
    posterPath: data.poster_path,
    overview: data.overview || '',
    airDate: data.air_date,
    episodes: data.episodes?.map(transformEpisode),
  };
}

function transformEpisode(data: any): Episode {
  return {
    id: data.id,
    episodeNumber: data.episode_number,
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview || '',
    stillPath: data.still_path,
    airDate: data.air_date,
    runtime: data.runtime,
    rating: Math.round((data.vote_average || 0) * 10) / 10,
  };
}

function transformSearchItem(data: any, forcedType?: 'movie' | 'tv'): MediaItem {
  // If forcedType is provided, use it directly - no inference needed
  if (forcedType) {
    const type = forcedType === 'tv' ? 'show' : 'movie';
    if (type === 'show') return transformShow({ ...data, media_type: undefined, mediaType: undefined, type: undefined });
    return transformMovie({ ...data, media_type: undefined, mediaType: undefined, type: undefined });
  }

  // Try to detect type from data
  const rawType = String(data?.media_type || data?.mediaType || data?.type || '').trim().toLowerCase();

  // Check for explicit type indicators
  if (rawType === 'tv' || rawType === 'show' || rawType === 'series') {
    return transformShow({ ...data, media_type: undefined, mediaType: undefined, type: undefined });
  }
  if (rawType === 'movie' || rawType === 'film') {
    return transformMovie({ ...data, media_type: undefined, mediaType: undefined, type: undefined });
  }

  // Infer from TV-specific fields (TMDB uses these only for TV shows)
  const hasTvIndicators =
    data?.first_air_date != null ||
    data?.number_of_seasons != null ||
    data?.number_of_episodes != null ||
    data?.season_number != null ||
    data?.episode_run_time != null ||
    data?.origin_country != null ||
    (data?.name && !data?.title); // TV shows use 'name', movies use 'title'

  if (hasTvIndicators) {
    return transformShow({ ...data, media_type: undefined, mediaType: undefined, type: undefined });
  }

  // Default to movie if we can't determine
  return transformMovie({ ...data, media_type: undefined, mediaType: undefined, type: undefined });
}

// ---- Public API ----

export async function searchMedia(query: string, page = 1, mediaType: 'all' | 'movie' | 'tv' = 'all'): Promise<{
  results: MediaItem[];
  totalPages: number;
  totalResults: number;
}> {
  const path = mediaType === 'all' ? '/search/multi' : `/search/${mediaType}`;
  const data = await tmdbFetch<any>(path, {
    query,
    page: String(page),
    include_adult: 'false',
  });

  const results = mediaType === 'all'
    ? data.results
        .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
        .map((r: any) => transformSearchItem(r))
    : data.results.map((r: any) => transformSearchItem(r, mediaType));

  return {
    results,
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

export async function getTrending(
  mediaType: 'all' | 'movie' | 'tv' = 'all',
  timeWindow: 'day' | 'week' = 'week',
  page = 1
): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/trending/${mediaType}/${timeWindow}`, { page: String(page) });

  // When mediaType is specific (not 'all'), we know the type and should force it
  if (mediaType === 'movie' || mediaType === 'tv') {
    return data.results.map((r: any) => transformSearchItem(r, mediaType));
  }

  // For 'all', filter and let transformSearchItem infer from media_type field
  return data.results
    .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r: any) => transformSearchItem(r));
}

export async function getPopular(type: 'movie' | 'tv', page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/${type}/popular`, { page: String(page) });
  return data.results.map((r: any) =>
    type === 'movie' ? transformMovie(r) : transformShow(r)
  );
}

export async function getTopRated(type: 'movie' | 'tv', page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/${type}/top_rated`, { page: String(page) });
  return data.results.map((r: any) =>
    type === 'movie' ? transformMovie(r) : transformShow(r)
  );
}

export async function getMovieDetails(id: string): Promise<Movie> {
  const data = await tmdbFetch<any>(`/movie/${id}`, { append_to_response: 'external_ids,credits,similar,recommendations,videos,release_dates' });
  return transformMovie(data);
}

export async function getShowDetails(id: string): Promise<Show> {
  const data = await tmdbFetch<any>(`/tv/${id}`, { append_to_response: 'external_ids,credits,similar,recommendations,videos,content_ratings' });
  return transformShow(data);
}

export async function getSeasonDetails(showId: string, seasonNumber: number): Promise<Season> {
  const data = await tmdbFetch<any>(`/tv/${showId}/season/${seasonNumber}`);
  return transformSeason(data);
}

export async function getRecommendations(type: 'movie' | 'tv', id: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/${type}/${id}/recommendations`);
  return data.results.map((r: any) =>
    type === 'movie' ? transformMovie(r) : transformShow(r)
  );
}

export async function getSimilar(type: 'movie' | 'tv', id: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/${type}/${id}/similar`);
  return data.results.map((r: any) =>
    type === 'movie' ? transformMovie(r) : transformShow(r)
  );
}

export async function getGenres(type: 'movie' | 'tv'): Promise<Genre[]> {
  const data = await tmdbFetch<any>(`/genre/${type}/list`);
  return data.genres;
}

export async function discover(
  type: 'movie' | 'tv',
  params: Record<string, string> = {}
): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/discover/${type}`, {
    ...params,
    include_adult: 'false',
    'vote_count.gte': '50', // Filter out obscure titles
  });
  return data.results.map((r: any) =>
    type === 'movie' ? transformMovie(r) : transformShow(r)
  );
}

export async function discoverByGenre(
  type: 'movie' | 'tv',
  genreId: number,
  page = 1
): Promise<MediaItem[]> {
  return discover(type, {
    with_genres: String(genreId),
    page: String(page),
    sort_by: 'popularity.desc',
  });
}

export async function getNowPlaying(type: 'movie' | 'tv', page = 1): Promise<MediaItem[]> {
  const path = type === 'movie' ? '/movie/now_playing' : '/tv/on_the_air';
  const data = await tmdbFetch<any>(path, { page: String(page) });
  return data.results.map((r: any) =>
    type === 'movie' ? transformMovie(r) : transformShow(r)
  );
}

export async function getExternalIds(type: 'movie' | 'tv', id: string): Promise<{
  imdbId?: string;
  tvdbId?: number;
}> {
  const data = await tmdbFetch<any>(`/${type}/${id}/external_ids`);
  return { imdbId: data.imdb_id, tvdbId: data.tvdb_id };
}

export async function getTitleLogoSvgPath(
  mediaType: 'movie' | 'show',
  id: string,
  preferredLanguages: string[] = ['en', 'pl']
): Promise<string | null> {
  const endpointType = mediaType === 'show' ? 'tv' : 'movie';
  const normalizedLangs = preferredLanguages
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);

  const includeImageLanguage = ['null', ...normalizedLangs].join(',');
  const data = await tmdbFetch<any>(`/${endpointType}/${id}/images`, {
    include_image_language: includeImageLanguage,
  });

  const logos = Array.isArray(data?.logos)
    ? data.logos.filter((logo: any) => typeof logo?.file_path === 'string')
    : [];

  if (logos.length === 0) return null;

  const languageRank = new Map<string, number>();
  normalizedLangs.forEach((lang, index) => {
    languageRank.set(lang, index);
  });

  const ranked = [...logos].sort((a: any, b: any) => {
    const langA = typeof a?.iso_639_1 === 'string' ? a.iso_639_1.toLowerCase() : 'null';
    const langB = typeof b?.iso_639_1 === 'string' ? b.iso_639_1.toLowerCase() : 'null';

    const svgA = String(a?.file_path || '').toLowerCase().endsWith('.svg') ? 0 : 1;
    const svgB = String(b?.file_path || '').toLowerCase().endsWith('.svg') ? 0 : 1;
    if (svgA !== svgB) return svgA - svgB;

    const rankA = languageRank.has(langA) ? languageRank.get(langA)! : Number.MAX_SAFE_INTEGER;
    const rankB = languageRank.has(langB) ? languageRank.get(langB)! : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;

    const voteA = typeof a?.vote_average === 'number' ? a.vote_average : 0;
    const voteB = typeof b?.vote_average === 'number' ? b.vote_average : 0;
    if (voteA !== voteB) return voteB - voteA;

    const widthA = typeof a?.width === 'number' ? a.width : 0;
    const widthB = typeof b?.width === 'number' ? b.width : 0;
    return widthB - widthA;
  });

  return ranked[0]?.file_path || null;
}
