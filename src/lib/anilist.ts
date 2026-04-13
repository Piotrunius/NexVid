/* ============================================
   AniList GraphQL Client
   Used for anime detection, search, and Browse/Anime tab.
   ============================================ */

import type { MediaItem, Show } from "@/types";

const ANILIST_URL = "https://graphql.anilist.co";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}
function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  retries = 2,
): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NexVid/1.0",
        },
        body: JSON.stringify({ query, variables }),
        next: { revalidate: 300 },
      });

      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`AniList error: ${res.status}`);
          if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
          continue;
        }
        throw new Error(`AniList query failed: ${res.status}`);
      }

      const json = await res.json();
      if (json.errors) {
        const msg = json.errors[0]?.message ?? "AniList error";
        if (msg.includes("Not Found")) throw new Error("Anime not found");
        lastError = new Error(msg);
        if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return json.data as T;
    } catch (err) {
      lastError = err;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}

// ---- Shared fragment types ----

interface AniListMedia {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  description: string | null;
  coverImage: { large: string; extraLarge: string };
  bannerImage: string | null;
  startDate: { year: number | null };
  averageScore: number | null;
  popularity: number;
  episodes: number | null;
  genres: string[];
  status: string;
  season: string | null;
  format: string | null;
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  description
  coverImage { large extraLarge }
  bannerImage
  startDate { year }
  averageScore
  popularity
  episodes
  genres
  status
  season
  format
`;

/**
 * Map AniList media object to NexVid MediaItem (Show with isAnime: true).
 * TMDB ID lookup is not done here — we use AniList ID prefixed with 'al-'.
 */
export function mapAniListToMediaItem(media: AniListMedia): MediaItem {
  const title =
    media.title.english || media.title.romaji || media.title.native || "";
  const year = media.startDate?.year ?? 0;
  const rating = media.averageScore ? media.averageScore / 10 : 0;

  const item: Show = {
    id: media.id,
    tmdbId: `al-${media.id}`,
    title,
    overview: media.description?.replace(/<[^>]+>/g, "") ?? "",
    posterPath: null,
    backdropPath: media.bannerImage ?? null,
    logoPath: null,
    releaseYear: year,
    rating: Math.round(rating * 10) / 10,
    genres: media.genres.map((g, i) => ({ id: i, name: g })),
    mediaType: "show",
    popularity: media.popularity,
    voteCount: 0,
    seasons: [],
    totalEpisodes: media.episodes ?? 0,
    isAnime: true,
    // Extra: store poster in a way MediaCard can use
    ...({ _aniPoster: media.coverImage.extraLarge || media.coverImage.large } as any),
  };

  // MediaCard reads posterPath — store AniList poster there
  (item as any).posterPath = media.coverImage.extraLarge || media.coverImage.large;

  return item;
}

// ---- Public API ----

/**
 * Check if a title matches any AniList entry (for anime detection).
 * Returns true if a strong match is found.
 */
export async function checkIsAnime(
  title: string,
  year?: number,
): Promise<boolean> {
  const key = `isanime:${title.toLowerCase()}:${year ?? ""}`;
  const cached = getCached<boolean>(key);
  if (cached !== null) return cached;

  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english native }
        startDate { year }
      }
    }
  `;

  try {
    const data = await anilistQuery<{ Media: { title: any; startDate: any } | null }>(
      query,
      { search: title },
    );

    if (!data.Media) {
      setCached(key, false);
      return false;
    }

    const { title: t, startDate } = data.Media;
    const candidates = [t.romaji, t.english, t.native].filter(Boolean) as string[];
    const titleLower = title.toLowerCase();
    const matches = candidates.some(
      (c) =>
        c.toLowerCase() === titleLower ||
        c.toLowerCase().includes(titleLower) ||
        titleLower.includes(c.toLowerCase().slice(0, 6)),
    );

    const yearOk =
      !year ||
      !startDate?.year ||
      Math.abs((startDate.year as number) - year) <= 1;

    const result = matches && yearOk;
    setCached(key, result);
    return result;
  } catch {
    return false;
  }
}

/**
 * Search anime on AniList by keyword.
 */
export async function searchAnime(
  query: string,
  page = 1,
): Promise<{ results: MediaItem[]; totalPages: number }> {
  const key = `search:${query.toLowerCase()}:${page}`;
  const cached = getCached<{ results: MediaItem[]; totalPages: number }>(key);
  if (cached) return cached;

  const gql = `
    query ($search: String, $page: Int) {
      Page(page: $page, perPage: 24) {
        pageInfo { lastPage }
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery<{
    Page: { pageInfo: { lastPage: number }; media: AniListMedia[] };
  }>(gql, { search: query, page });

  const result = {
    results: data.Page.media.map(mapAniListToMediaItem),
    totalPages: data.Page.pageInfo.lastPage,
  };
  setCached(key, result);
  return result;
}

/**
 * Get trending anime from AniList.
 */
export async function getAniListTrending(page = 1): Promise<MediaItem[]> {
  const key = `trending:${page}`;
  const cached = getCached<MediaItem[]>(key);
  if (cached) return cached;

  const gql = `
    query ($page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, sort: TRENDING_DESC, status_not: NOT_YET_RELEASED) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery<{ Page: { media: AniListMedia[] } }>(gql, {
    page,
  });
  const result = data.Page.media.map(mapAniListToMediaItem);
  setCached(key, result);
  return result;
}

/**
 * Get popular anime from AniList.
 */
export async function getAniListPopular(page = 1): Promise<MediaItem[]> {
  const key = `popular:${page}`;
  const cached = getCached<MediaItem[]>(key);
  if (cached) return cached;

  const gql = `
    query ($page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, sort: POPULARITY_DESC, status_not: NOT_YET_RELEASED) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery<{ Page: { media: AniListMedia[] } }>(gql, {
    page,
  });
  const result = data.Page.media.map(mapAniListToMediaItem);
  setCached(key, result);
  return result;
}

/**
 * Get top-rated anime from AniList.
 */
export async function getAniListTopRated(page = 1): Promise<MediaItem[]> {
  const key = `toprated:${page}`;
  const cached = getCached<MediaItem[]>(key);
  if (cached) return cached;

  const gql = `
    query ($page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 70) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery<{ Page: { media: AniListMedia[] } }>(gql, {
    page,
  });
  const result = data.Page.media.map(mapAniListToMediaItem);
  setCached(key, result);
  return result;
}

/**
 * Get currently airing anime from AniList.
 */
export async function getAniListAiring(page = 1): Promise<MediaItem[]> {
  const key = `airing:${page}`;
  const cached = getCached<MediaItem[]>(key);
  if (cached) return cached;

  const gql = `
    query ($page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery<{ Page: { media: AniListMedia[] } }>(gql, {
    page,
  });
  const result = data.Page.media.map(mapAniListToMediaItem);
  setCached(key, result);
  return result;
}

/**
 * Browse anime by genre via AniList.
 */
export async function getAniListByGenre(
  genre: string,
  page = 1,
): Promise<MediaItem[]> {
  const key = `genre:${genre.toLowerCase()}:${page}`;
  const cached = getCached<MediaItem[]>(key);
  if (cached) return cached;

  const gql = `
    query ($genre: String, $page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, genre: $genre, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery<{ Page: { media: AniListMedia[] } }>(gql, {
    genre,
    page,
  });
  const result = data.Page.media.map(mapAniListToMediaItem);
  setCached(key, result);
  return result;
}

/**
 * Get full details for an anime from AniList (used for the detail page).
 */
export async function getAnimeFullDetails(id: number) {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title { romaji english native }
        description
        coverImage { large extraLarge }
        bannerImage
        startDate { year month day }
        endDate { year }
        averageScore
        episodes
        genres
        status
        format
        trailer { id site thumbnail }
        studios(isMain: true) { nodes { name } }
        characters(perPage: 20, sort: ROLE) {
          edges {
            role
            node { id name { full } image { medium } }
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
          site
        }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english }
              coverImage { large extraLarge }
              episodes
              startDate { year }
              type
              format
            }
          }
        }
        externalLinks {
          site
          url
          id
        }
        recommendations(sort: RATING_DESC, perPage: 12) {
          edges {
            node {
              mediaRecommendation {
                id
                title { romaji english }
                coverImage { large extraLarge }
                bannerImage
                averageScore
                startDate { year }
                format
              }
            }
          }
        }
      }
    }
  `;

  const data = await anilistQuery<{ Media: any }>(gql, { id });
  return data.Media;
}
