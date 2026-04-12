/* ============================================
   Anime Detection Utility
   Determines if a TMDB show is anime using AniList.
   ============================================ */

import { checkIsAnime } from "./anilist";

const SESSION_KEY_PREFIX = "nexvid-animecheck-";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface StoredCheck {
  result: boolean;
  expiresAt: number;
}

function readFromSession(tmdbId: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${tmdbId}`);
    if (!raw) return null;
    const parsed: StoredCheck = JSON.parse(raw);
    if (Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${tmdbId}`);
      return null;
    }
    return parsed.result;
  } catch {
    return null;
  }
}

function writeToSession(tmdbId: string, result: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const entry: StoredCheck = {
      result,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessionStorage.setItem(
      `${SESSION_KEY_PREFIX}${tmdbId}`,
      JSON.stringify(entry),
    );
  } catch {
    // sessionStorage unavailable — skip
  }
}

/**
 * Detect if a given TMDB show is anime.
 *
 * Heuristics:
 * 1. If not a Japanese production → false immediately
 * 2. Check sessionStorage cache
 * 3. AniList title match (fast GraphQL query)
 */
export async function detectAnime(
  tmdbId: string,
  title: string,
  year?: number,
  originCountry?: string[],
): Promise<boolean> {
  // Fast path: non-Japanese origin is never anime
  if (
    originCountry &&
    originCountry.length > 0 &&
    !originCountry.includes("JP")
  ) {
    return false;
  }

  // Check session cache
  const cached = readFromSession(tmdbId);
  if (cached !== null) return cached;

  // AniList lookup
  try {
    const result = await checkIsAnime(title, year);
    writeToSession(tmdbId, result);
    return result;
  } catch {
    return false;
  }
}
