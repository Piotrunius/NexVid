/* ============================================
   TMDB API Client
   ============================================ */

import type { CastMember, CrewMember, Episode, Genre, MediaItem, Movie, Season, Show, VideoItem } from '@/types';

const TMDB_BASE = 'https://api.themoviedb.org/3';

function getApiKey(): string {
  return process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', getApiKey());
  Object.entries(params).forEach(([key, val]) => url.searchParams.set(key, val));
  return url.toString();
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(buildUrl(path, params));
  if (!res.ok) throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---- Transformers ----

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
    runtime: data.runtime || 0,
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
    seasons: (data.seasons || []).map(transformSeason),
    totalEpisodes: data.number_of_episodes || 0,
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

function transformSearchItem(data: any): MediaItem {
  const type = data.media_type === 'tv' ? 'show' : 'movie';
  if (type === 'show') return transformShow({ ...data, media_type: undefined });
  return transformMovie({ ...data, media_type: undefined });
}

// ---- Public API ----

export async function searchMedia(query: string, page = 1): Promise<{
  results: MediaItem[];
  totalPages: number;
  totalResults: number;
}> {
  const data = await tmdbFetch<any>('/search/multi', {
    query,
    page: String(page),
    include_adult: 'false',
  });

  const results = data.results
    .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
    .map(transformSearchItem);

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
  return data.results
    .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
    .map(transformSearchItem);
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
  const data = await tmdbFetch<any>(`/movie/${id}`, { append_to_response: 'external_ids,credits,similar,recommendations,videos' });
  return transformMovie(data);
}

export async function getShowDetails(id: string): Promise<Show> {
  const data = await tmdbFetch<any>(`/tv/${id}`, { append_to_response: 'external_ids,credits,similar,recommendations,videos' });
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

export async function discoverByGenre(
  type: 'movie' | 'tv',
  genreId: number,
  page = 1
): Promise<MediaItem[]> {
  const data = await tmdbFetch<any>(`/discover/${type}`, {
    with_genres: String(genreId),
    page: String(page),
    sort_by: 'popularity.desc',
  });
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
