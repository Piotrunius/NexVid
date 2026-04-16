/* ============================================
   TMDB API Client
   ============================================ */

import type {
  CastMember,
  CrewMember,
  Episode,
  Genre,
  MediaItem,
  Movie,
  Season,
  Show,
  VideoItem,
} from "@/types";

// ---- Raw TMDB API response types ----

interface TmdbRawReleaseDateEntry {
  certification: string;
  type: number;
  release_date: string;
}

interface TmdbRawReleaseDateResult {
  iso_3166_1: string;
  release_dates: TmdbRawReleaseDateEntry[];
}

interface TmdbRawContentRating {
  iso_3166_1: string;
  rating: string;
}

interface TmdbRawCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

interface TmdbRawCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TmdbRawVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

interface TmdbRawGenre {
  id: number;
  name: string;
}

interface TmdbRawProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

interface TmdbRawSpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

interface TmdbRawEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
}

interface TmdbRawSeason {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  poster_path: string | null;
  overview: string;
  air_date: string | null;
  episodes?: TmdbRawEpisode[];
}

interface TmdbRawCredits {
  cast?: TmdbRawCastMember[];
  crew?: TmdbRawCrewMember[];
}

interface TmdbRawMovie {
  id: number;
  title: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  first_air_date?: string;
  vote_average: number;
  genres?: TmdbRawGenre[];
  genre_ids?: number[];
  popularity: number;
  vote_count: number;
  runtime: number | null;
  imdb_id?: string;
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  production_companies?: TmdbRawProductionCompany[];
  spoken_languages?: TmdbRawSpokenLanguage[];
  origin_country?: string[];
  production_countries?: { iso_3166_1: string; name: string }[];
  credits?: TmdbRawCredits;
  videos?: { results?: TmdbRawVideo[] };
  release_dates?: { results?: TmdbRawReleaseDateResult[] };
}

interface TmdbRawShow {
  id: number;
  name: string;
  title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  genres?: TmdbRawGenre[];
  genre_ids?: number[];
  popularity: number;
  vote_count: number;
  seasons?: TmdbRawSeason[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  episode_run_time?: number[];
  tagline?: string;
  status?: string;
  networks?: { id: number; name: string }[];
  created_by?: { id: number; name: string }[];
  origin_country?: string[];
  external_ids?: { imdb_id?: string; tvdb_id?: number };
  credits?: TmdbRawCredits;
  videos?: { results?: TmdbRawVideo[] };
  content_ratings?: { results?: TmdbRawContentRating[] };
}

interface TmdbRawSearchItem
  extends Partial<TmdbRawMovie>, Partial<TmdbRawShow> {
  media_type?: string;
  mediaType?: string;
  type?: string;
}

// ---- In-memory cache ----
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const movieCache = new Map<string, CacheEntry<Movie>>();
const showCache = new Map<string, CacheEntry<Show>>();
const seasonCache = new Map<string, CacheEntry<Season>>();

function getCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  data: T,
): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "76508fc7baf10d9483564c0f7acbbc21";
const TMDB_REQUEST_TIMEOUT_MS = 10000;

function getApiKey(): string {
  const localOverride = String(process.env.TMDB_API_KEY || "").trim();
  return localOverride || TMDB_API_KEY;
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey());
  Object.entries(params).forEach(([key, val]) =>
    url.searchParams.set(key, val),
  );
  return url.toString();
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = TMDB_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = init;

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(
    () =>
      controller.abort(
        new Error(`TMDB request timed out after ${timeoutMs}ms`),
      ),
    timeoutMs,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const res = await fetchWithTimeout(buildUrl(path, params));
  if (!res.ok)
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---- Transformers ----

function getCertificationFromReleaseDates(
  data: TmdbRawMovie,
): string | undefined {
  const results = data.release_dates?.results;
  if (!Array.isArray(results) || results.length === 0) return undefined;

  const entry = results.find((r) => r.iso_3166_1 === "US") || results[0];
  const rating = entry?.release_dates?.find(
    (d) => d.certification,
  )?.certification;
  return rating || undefined;
}

function getRatingFromContentRatings(data: TmdbRawShow): string | undefined {
  const results = data.content_ratings?.results;
  if (!Array.isArray(results) || results.length === 0) return undefined;

  const entry = results.find((r) => r.iso_3166_1 === "US") || results[0];
  return entry?.rating;
}

function transformMovie(data: TmdbRawMovie): Movie {
  return {
    id: data.id,
    tmdbId: String(data.id),
    imdbId: data.imdb_id,
    title: data.title || data.name || "",
    overview: data.overview || "",
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    releaseYear:
      new Date(data.release_date || data.first_air_date || "").getFullYear() ||
      0,
    rating: Math.round((data.vote_average || 0) * 10) / 10,
    genres:
      data.genres || data.genre_ids?.map((id) => ({ id, name: "" })) || [],
    mediaType: "movie",
    popularity: data.popularity,
    voteCount: data.vote_count,
    runtime: data.runtime || 0,
    certification: getCertificationFromReleaseDates(data),
    cast: data.credits?.cast?.slice(0, 20).map(transformCast),
    crew: data.credits?.crew
      ?.filter((c) =>
        ["Director", "Producer", "Writer", "Screenplay"].includes(c.job),
      )
      .map(transformCrew),
    videos: data.videos?.results
      ?.filter((v) => v.site === "YouTube")
      .map(transformVideo),
    tagline: data.tagline || "",
    status: data.status,
    budget: data.budget || 0,
    revenue: data.revenue || 0,
    productionCompanies: data.production_companies?.map((c) => c.name) || [],
    spokenLanguages:
      data.spoken_languages?.map((l) => l.english_name || l.name) || [],
    originCountry:
      data.origin_country ||
      data.production_countries?.map((c) => c.iso_3166_1) ||
      [],
  };
}

function transformShow(data: TmdbRawShow): Show {
  return {
    id: data.id,
    tmdbId: String(data.id),
    imdbId: data.external_ids?.imdb_id,
    title: data.name || data.title || "",
    overview: data.overview || "",
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    releaseYear: new Date(data.first_air_date || "").getFullYear() || 0,
    rating: Math.round((data.vote_average || 0) * 10) / 10,
    genres:
      data.genres || data.genre_ids?.map((id) => ({ id, name: "" })) || [],
    mediaType: "show",
    popularity: data.popularity,
    voteCount: data.vote_count,
    seasons: (data.seasons || []).map(transformSeason),
    totalEpisodes: data.number_of_episodes || 0,
    certification: getRatingFromContentRatings(data),
    cast: data.credits?.cast?.slice(0, 20).map(transformCast),
    crew: data.credits?.crew
      ?.filter((c) =>
        ["Director", "Producer", "Writer", "Screenplay", "Creator"].includes(
          c.job,
        ),
      )
      .map(transformCrew),
    videos: data.videos?.results
      ?.filter((v) => v.site === "YouTube")
      .map(transformVideo),
    tagline: data.tagline || "",
    status: data.status,
    networks: data.networks?.map((n) => n.name) || [],
    createdBy: data.created_by?.map((c) => c.name) || [],
    originCountry: data.origin_country || [],
  };
}

function transformCast(data: TmdbRawCastMember): CastMember {
  return {
    id: data.id,
    name: data.name,
    character: data.character || "",
    profilePath: data.profile_path,
    order: data.order,
  };
}

function transformCrew(data: TmdbRawCrewMember): CrewMember {
  return {
    id: data.id,
    name: data.name,
    job: data.job,
    department: data.department,
    profilePath: data.profile_path,
  };
}

function transformVideo(data: TmdbRawVideo): VideoItem {
  return {
    id: data.id,
    key: data.key,
    name: data.name,
    site: data.site,
    type: data.type,
  };
}

function transformSeason(data: TmdbRawSeason): Season {
  return {
    id: data.id,
    seasonNumber: data.season_number,
    name: data.name,
    episodeCount: data.episode_count,
    posterPath: data.poster_path,
    overview: data.overview || "",
    airDate: data.air_date,
    episodes: data.episodes?.map(transformEpisode),
  };
}

function transformEpisode(data: TmdbRawEpisode): Episode {
  return {
    id: data.id,
    episodeNumber: data.episode_number,
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview || "",
    stillPath: data.still_path,
    airDate: data.air_date,
    runtime: data.runtime,
    rating: Math.round((data.vote_average || 0) * 10) / 10,
  };
}

function transformSearchItem(
  data: TmdbRawSearchItem,
  forcedType?: "movie" | "tv",
): MediaItem {
  // If forcedType is provided, use it directly - no inference needed
  if (forcedType) {
    const type = forcedType === "tv" ? "show" : "movie";
    if (type === "show")
      return transformShow({
        ...data,
        media_type: undefined,
        mediaType: undefined,
        type: undefined,
      } as unknown as TmdbRawShow);
    return transformMovie({
      ...data,
      media_type: undefined,
      mediaType: undefined,
      type: undefined,
    } as unknown as TmdbRawMovie);
  }

  // Try to detect type from data
  const rawType = String(
    data?.media_type || data?.mediaType || data?.type || "",
  )
    .trim()
    .toLowerCase();

  // Check for explicit type indicators
  if (rawType === "tv" || rawType === "show" || rawType === "series") {
    return transformShow({
      ...data,
      media_type: undefined,
      mediaType: undefined,
      type: undefined,
    } as unknown as TmdbRawShow);
  }
  if (rawType === "movie" || rawType === "film") {
    return transformMovie({
      ...data,
      media_type: undefined,
      mediaType: undefined,
      type: undefined,
    } as unknown as TmdbRawMovie);
  }

  // Infer from TV-specific fields (TMDB uses these only for TV shows)
  const hasTvIndicators =
    data?.first_air_date != null ||
    data?.number_of_seasons != null ||
    data?.number_of_episodes != null ||
    (data as any)?.season_number != null ||
    data?.episode_run_time != null ||
    data?.origin_country != null ||
    (data?.name && !data?.title); // TV shows use 'name', movies use 'title'

  if (hasTvIndicators) {
    return transformShow({
      ...data,
      media_type: undefined,
      mediaType: undefined,
      type: undefined,
    } as unknown as TmdbRawShow);
  }

  // Default to movie if we can't determine
  return transformMovie({
    ...data,
    media_type: undefined,
    mediaType: undefined,
    type: undefined,
  } as unknown as TmdbRawMovie);
}

// ---- Search Results Scoring ----

function calculateRelevanceScore(item: MediaItem, query: string): number {
  let score = 0;
  const title = item.title.toLowerCase().trim();
  const q = query.toLowerCase().trim();

  // 1. RELEVANCE (Max ~300)
  if (title === q) {
    score += 300; // Exact match is king
  } else if (title.startsWith(q)) {
    score += 200; // Starts with query
  } else if (title.includes(q)) {
    score += 100; // Contains query
  }

  // Word-based match (bonus for matching whole words)
  const queryWords = q.split(/\s+/).filter((w) => w.length > 1);
  const titleWords = title.split(/\s+/).filter(Boolean);
  let matchedWords = 0;
  for (const qw of queryWords) {
    if (titleWords.includes(qw)) matchedWords++;
  }
  if (queryWords.length > 0) {
    score += (matchedWords / queryWords.length) * 50;
  }

  // 2. POPULARITY & VISIBILITY (Max ~150)
  // Popularity can vary wildly (from < 1 to > 5000)
  score += Math.min((item.popularity || 0) / 10, 150);

  // 3. RATING QUALITY (Max ~100)
  // We weight the rating by vote count to avoid "1 vote = 10 stars" junk
  const votes = item.voteCount || 0;
  if (votes > 5) {
    const ratingWeight = Math.min(votes / 100, 1); // 0.05 to 1.0 multiplier
    score += (item.rating || 0) * ratingWeight * 10;
  }

  // Logarithmic bonus for very high vote counts
  score += Math.log10(votes + 1) * 15;

  // 4. RECENCY (Max ~20)
  const currentYear = new Date().getFullYear();
  if (item.releaseYear > 0) {
    const age = currentYear - item.releaseYear;
    if (age <= 2) score += 20;
    else if (age <= 5) score += 10;
    else if (age > 30) score -= 10; // Slight penalty for very old/niche content unless relevant
  }

  // 5. JUNK PENALTIES
  if (!item.posterPath) score -= 80; // High penalty for items without posters (often junk entries)
  if (votes < 2) score -= 50; // High penalty for items with essentially 0 visibility

  return score;
}

// ---- Public API ----

export async function searchMedia(
  query: string,
  page = 1,
  mediaType: "all" | "movie" | "tv" = "all",
): Promise<{
  results: MediaItem[];
  totalPages: number;
  totalResults: number;
}> {
  const path = mediaType === "all" ? "/search/multi" : `/search/${mediaType}`;
  const data = await tmdbFetch<{
    results: TmdbRawSearchItem[];
    total_pages: number;
    total_results: number;
  }>(path, {
    query,
    page: String(page),
    include_adult: "false",
  });

  const results =
    mediaType === "all"
      ? data.results
          .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
          .map((r: any) => transformSearchItem(r))
      : data.results.map((r: any) => transformSearchItem(r, mediaType));

  // Apply custom scoring to prioritize relevant/popular/high-quality results
  const scoredResults = results.sort((a, b) => {
    const scoreA = calculateRelevanceScore(a, query);
    const scoreB = calculateRelevanceScore(b, query);
    return scoreB - scoreA;
  });

  return {
    results: scoredResults,
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

export async function getTrending(
  mediaType: "all" | "movie" | "tv" = "all",
  timeWindow: "day" | "week" = "week",
  page = 1,
): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: TmdbRawSearchItem[] }>(
    `/trending/${mediaType}/${timeWindow}`,
    { page: String(page) },
  );

  // When mediaType is specific (not 'all'), we know the type and should force it
  if (mediaType === "movie" || mediaType === "tv") {
    return data.results.map((r: any) => transformSearchItem(r, mediaType));
  }

  // For 'all', filter and let transformSearchItem infer from media_type field
  return data.results
    .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
    .map((r: any) => transformSearchItem(r));
}

export async function getPopular(
  type: "movie" | "tv",
  page = 1,
): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: (TmdbRawMovie | TmdbRawShow)[] }>(
    `/${type}/popular`,
    { page: String(page) },
  );
  return data.results.map((r: any) =>
    type === "movie" ? transformMovie(r) : transformShow(r),
  );
}

export async function getTopRated(
  type: "movie" | "tv",
  page = 1,
): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: (TmdbRawMovie | TmdbRawShow)[] }>(
    `/${type}/top_rated`,
    { page: String(page) },
  );
  return data.results.map((r: any) =>
    type === "movie" ? transformMovie(r) : transformShow(r),
  );
}

export async function getMovieDetails(id: string): Promise<Movie> {
  const cached = getCached(movieCache, id);
  if (cached) return cached;
  const data = await tmdbFetch<TmdbRawMovie>(`/movie/${id}`, {
    append_to_response:
      "external_ids,credits,similar,recommendations,videos,release_dates",
  });
  const result = transformMovie(data);
  setCached(movieCache, id, result);
  return result;
}

export async function getShowDetails(id: string): Promise<Show> {
  const cached = getCached(showCache, id);
  if (cached) return cached;
  const data = await tmdbFetch<TmdbRawShow>(`/tv/${id}`, {
    append_to_response:
      "external_ids,credits,similar,recommendations,videos,content_ratings",
  });
  const result = transformShow(data);
  setCached(showCache, id, result);
  return result;
}

export async function getSeasonDetails(
  showId: string,
  seasonNumber: number,
): Promise<Season> {
  const key = `${showId}:${seasonNumber}`;
  const cached = getCached(seasonCache, key);
  if (cached) return cached;
  const data = await tmdbFetch<TmdbRawSeason>(
    `/tv/${showId}/season/${seasonNumber}`,
  );
  const result = transformSeason(data);
  setCached(seasonCache, key, result);
  return result;
}

export async function getRecommendations(
  type: "movie" | "tv",
  id: string,
): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: (TmdbRawMovie | TmdbRawShow)[] }>(
    `/${type}/${id}/recommendations`,
  );
  return data.results.map((r: any) =>
    type === "movie" ? transformMovie(r) : transformShow(r),
  );
}

export async function getSimilar(
  type: "movie" | "tv",
  id: string,
): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: (TmdbRawMovie | TmdbRawShow)[] }>(
    `/${type}/${id}/similar`,
  );
  return data.results.map((r: any) =>
    type === "movie" ? transformMovie(r) : transformShow(r),
  );
}

export async function getGenres(type: "movie" | "tv"): Promise<Genre[]> {
  const data = await tmdbFetch<{ genres: Genre[] }>(`/genre/${type}/list`);
  return data.genres;
}

export async function discover(
  type: "movie" | "tv",
  params: Record<string, string> = {},
): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: (TmdbRawMovie | TmdbRawShow)[] }>(
    `/discover/${type}`,
    {
      ...params,
      include_adult: "false",
      "vote_count.gte": "50", // Filter out obscure titles
    },
  );
  return data.results.map((r: any) =>
    type === "movie" ? transformMovie(r) : transformShow(r),
  );
}

export async function discoverByGenre(
  type: "movie" | "tv",
  genreId: number,
  page = 1,
): Promise<MediaItem[]> {
  return discover(type, {
    with_genres: String(genreId),
    page: String(page),
    sort_by: "popularity.desc",
  });
}

export async function getNowPlaying(
  type: "movie" | "tv",
  page = 1,
): Promise<MediaItem[]> {
  const path = type === "movie" ? "/movie/now_playing" : "/tv/on_the_air";
  const data = await tmdbFetch<{ results: (TmdbRawMovie | TmdbRawShow)[] }>(
    path,
    { page: String(page) },
  );
  return data.results.map((r: any) =>
    type === "movie" ? transformMovie(r) : transformShow(r),
  );
}

export async function getExternalIds(
  type: "movie" | "tv",
  id: string,
): Promise<{
  imdbId?: string;
  tvdbId?: number;
}> {
  const data = await tmdbFetch<{ imdb_id?: string; tvdb_id?: number }>(
    `/${type}/${id}/external_ids`,
  );
  return { imdbId: data.imdb_id, tvdbId: data.tvdb_id };
}

export async function getTitleLogoSvgPath(
  mediaType: "movie" | "show",
  id: string,
  preferredLanguages: string[] = ["en", "pl"],
): Promise<string | null> {
  const endpointType = mediaType === "show" ? "tv" : "movie";
  const normalizedLangs = preferredLanguages
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);

  const includeImageLanguage = ["null", ...normalizedLangs].join(",");
  const data = await tmdbFetch<any>(`/${endpointType}/${id}/images`, {
    include_image_language: includeImageLanguage,
  });

  const logos = Array.isArray(data?.logos)
    ? data.logos.filter((logo: any) => typeof logo?.file_path === "string")
    : [];

  if (logos.length === 0) return null;

  const languageRank = new Map<string, number>();
  normalizedLangs.forEach((lang, index) => {
    languageRank.set(lang, index);
  });

  const ranked = [...logos].sort((a: any, b: any) => {
    const langA =
      typeof a?.iso_639_1 === "string" ? a.iso_639_1.toLowerCase() : "null";
    const langB =
      typeof b?.iso_639_1 === "string" ? b.iso_639_1.toLowerCase() : "null";

    const svgA = String(a?.file_path || "")
      .toLowerCase()
      .endsWith(".svg")
      ? 0
      : 1;
    const svgB = String(b?.file_path || "")
      .toLowerCase()
      .endsWith(".svg")
      ? 0
      : 1;
    if (svgA !== svgB) return svgA - svgB;

    const rankA = languageRank.has(langA)
      ? languageRank.get(langA)!
      : Number.MAX_SAFE_INTEGER;
    const rankB = languageRank.has(langB)
      ? languageRank.get(langB)!
      : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;

    const voteA = typeof a?.vote_average === "number" ? a.vote_average : 0;
    const voteB = typeof b?.vote_average === "number" ? b.vote_average : 0;
    if (voteA !== voteB) return voteB - voteA;

    const widthA = typeof a?.width === "number" ? a.width : 0;
    const widthB = typeof b?.width === "number" ? b.width : 0;
    return widthB - widthA;
  });

  return ranked[0]?.file_path || null;
}
