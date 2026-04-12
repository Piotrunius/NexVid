import type { MediaType } from "@/types";

export function normalizeMediaType(value: unknown): MediaType {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  // Handle various TV show indicators
  if (
    raw === "show" ||
    raw === "tv" ||
    raw === "series" ||
    raw === "tvshow" ||
    raw === "tv_show" ||
    raw === "tv-show"
  ) {
    return "show";
  }
  return "movie";
}

export function toTmdbMediaType(value: unknown): "movie" | "tv" {
  return normalizeMediaType(value) === "show" ? "tv" : "movie";
}

export function isAnimeMedia(item: any): boolean {
  if (item.tmdbId?.startsWith("al-") || item.isAnime) return true;
  if (item.mediaType === "show" || item.mediaType === "tv") {
    const isJapanese = Array.isArray(item.originCountry) && item.originCountry.includes("JP");
    const hasAnimationGenre = Array.isArray(item.genres) && item.genres.some(
      (g: any) => g.id === 16 || g.name?.toLowerCase() === "animation"
    );
    if (isJapanese && hasAnimationGenre) return true;
  }
  return false;
}
