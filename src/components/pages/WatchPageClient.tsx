/* ============================================
   Watch Page – Full-screen player with auto-play
   ============================================ */

"use client";

import { VideoPlayer } from "@/components/player/VideoPlayer";
import { toast } from "@/components/ui/Toaster";
import { resolveFebboxToken } from "@/lib/febbox";
import { scrapeAllSources, SOURCES } from "@/lib/providers";
import type { MediaSegments } from "@/lib/tidb";
import {
  getExternalIds,
  getMovieDetails,
  getSeasonDetails,
  getShowDetails,
} from "@/lib/tmdb";
import { formatTime, getAccentHex } from "@/lib/utils";
import { detectAnime } from "@/lib/animeDetect";
import { useAuthStore } from "@/stores/auth";
import { useBlockedContentStore } from "@/stores/blockedContent";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useWatchlistStore } from "@/stores/watchlist";
import type {
  AnimeAudioMode,
  Caption,
  Episode,
  Movie,
  Season,
  Show,
  SourceResult,
  Stream,
} from "@/types";
import Head from "next/head";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const runtime = "edge";

const EMPTY_SEGMENTS: MediaSegments = {
  intro: [],
  recap: [],
  credits: [],
  preview: [],
};

const FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY =
  "nexvid-febbox-token-notice-sitewide-dismissed";

function mergeSourceCaptions(results: Array<{ stream: Stream }>) {
  const seen = new Set<string>();
  const captions: Caption[] = [];

  for (const result of results) {
    const streamCaptions =
      "captions" in result.stream && Array.isArray(result.stream.captions)
        ? result.stream.captions
        : [];

    for (const caption of streamCaptions) {
      const key = `${caption.language.toLowerCase()}|${caption.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      captions.push(caption);
    }
  }

  return captions;
}

function getStreamCaptions(stream: Stream | null): Caption[] {
  if (!stream) return [];
  return "captions" in stream && Array.isArray(stream.captions)
    ? stream.captions
    : [];
}

async function loadExternalCaptions(params: {
  imdbId?: string;
  tmdbId?: string;
  mediaType: "movie" | "show";
  season?: number;
  episode?: number;
  title?: string;
}): Promise<Caption[]> {
  const { imdbId, tmdbId, mediaType, season, episode, title } = params;
  if (!imdbId && !tmdbId && !title) return [];

  // If TMDB ID is a placeholder/mock from AniList (al-XXXX), try to ignore it and prefer title if possible,
  // but better to have resolved the real TMDB ID beforehand.
  const queryTmdbId = tmdbId?.startsWith("al-") ? undefined : tmdbId;

  // Normalize mediaType: Wyzie/subtitles API only expects 'show' or 'movie'
  const normalizedType = mediaType === "movie" ? "movie" : "show";

  const query = new URLSearchParams({
    type: normalizedType,
    t: Date.now().toString(),
  });
  if (imdbId) query.set("imdbId", imdbId);
  if (queryTmdbId) query.set("tmdbId", queryTmdbId);
  if (title) query.set("title", title);

  if (mediaType === "show") {
    if (season) query.set("season", String(season));
    if (episode) query.set("episode", String(episode));
  }

  try {
    const response = await fetch(`/api/subtitles?${query.toString()}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return [];

    const json = await response.json();
    const subtitles = Array.isArray(json?.subtitles) ? json.subtitles : [];

    return subtitles
      .map((subtitle: any): Caption | null => {
        const url = String(subtitle?.url || "");
        if (!url) return null;
        const language = String(subtitle?.language || "en").toLowerCase();
        const type = String(subtitle?.type || "")
          .toLowerCase()
          .includes("vtt")
          ? "vtt"
          : "srt";

        let id = String(subtitle?.id || "");
        if (!id.startsWith("wyzie-")) {
          id = `wyzie-${language}-${Math.random().toString(36).slice(2, 9)}`;
        }

        return {
          id,
          url,
          language,
          type,
          label: subtitle?.label || subtitle?.display,
          flagUrl: subtitle?.flagUrl,
          isHearingImpaired: Boolean(subtitle?.isHearingImpaired),
          release: subtitle?.release || null,
          fileName: subtitle?.fileName || null,
          downloadCount: Number(subtitle?.downloadCount || 0),
        } as Caption;
      })
      .filter((caption: Caption | null): caption is Caption =>
        Boolean(caption),
      );
  } catch (err: any) {
    console.error(`[Subtitles] FETCH ERROR:`, err);
    return [];
  }
}

function mergeCaptionSets(primary: Caption[], secondary: Caption[]) {
  const merged: Caption[] = [];
  const seen = new Set<string>();

  for (const caption of [...primary, ...secondary]) {
    const key = `${caption.language.toLowerCase()}|${caption.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(caption);
  }

  return merged;
}

function withMergedCaptions(stream: Stream, mergedCaptions: Caption[]): Stream {
  if (stream.type === "embed") return stream;
  return {
    ...stream,
    captions: mergedCaptions,
  };
}

export default function WatchPageClient({
  initialMedia,
}: {
  initialMedia?: Movie | Show | null;
}) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isBlocked, isLoaded } = useBlockedContentStore();

  const routeType = String(params?.type || "").toLowerCase();
  const type =
    routeType === "show" || routeType === "tv" || routeType === "series"
      ? "show"
      : routeType === "anime"
        ? "anime"
        : "movie";
  const id = type === "anime" && !String(params?.id).startsWith("al-") 
    ? `al-${params?.id}` 
    : (params?.id as string);

  useEffect(() => {
    if (isLoaded && isBlocked(id, (type === "anime" ? "show" : type) as any)) {
      router.replace("/");
      toast("This content is no longer available", "error");
    }
  }, [isLoaded, isBlocked, id, type, router]);

  const seasonNum = searchParams?.get("s")
    ? parseInt(searchParams.get("s")!)
    : 1;
  const episodeNum = searchParams?.get("e")
    ? parseInt(searchParams.get("e")!)
    : 1;
  const resumeTimeFromUrl = searchParams?.get("t")
    ? parseFloat(searchParams.get("t")!)
    : 0;

  const lastProgressSyncRef = useRef<{
    wallTime: number;
    percent: number;
    second: number;
    key: string;
  }>({
    wallTime: 0,
    percent: 0,
    second: 0,
    key: "",
  });

  const [media, setMedia] = useState<Movie | Show | null>(initialMedia || null);
  const [season, setSeason] = useState<Season | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [imdbId, setImdbId] = useState<string | undefined>(
    (initialMedia as any)?.imdbId,
  );
  const [tmdbId, setTmdbId] = useState<string | undefined>(
    (initialMedia as any)?.tmdbId || id,
  );
  const [stream, setStream] = useState<Stream | null>(null);
  const [segments, setSegments] = useState<MediaSegments>(EMPTY_SEGMENTS);
  const [scrapeStatus, setScrapeStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [externalCaptions, setExternalCaptions] = useState<Caption[]>([]);
  const memoizedExternalCaptions = useMemo(
    () => externalCaptions,
    [externalCaptions],
  );

  // ── Anime state ──────────────────────────────────────────────────────────
  const [isAnime, setIsAnime] = useState(false);
  const [animeAudioMode, setAnimeAudioMode] = useState<AnimeAudioMode>(
    (useSettingsStore.getState().settings.animeAudioMode as AnimeAudioMode) ?? "sub",
  );
  const animeLoadingRef = useRef(false);
  // ─────────────────────────────────────────────────────────────────────────

  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumeData, setResumeData] = useState<{
    percentage: number;
    timestamp: number;
  } | null>(null);
  const [resumeType, setResumeType] = useState<"low" | "high" | null>(null);
  const [appliedSeekTime, setAppliedSeekTime] = useState(resumeTimeFromUrl);

  const [dismissedTokenNoticeMediaKey, setDismissedTokenNoticeMediaKey] =
    useState<string | null>(null);
  const [dismissedTokenNoticeSitewide, setDismissedTokenNoticeSitewide] =
    useState(false);

  const { setIntroOutro, reset, currentTime, duration } = usePlayerStore();
  const { isLoggedIn, authToken: sessionToken } = useAuthStore();
  const { getByTmdbId, updateProgress, addItem } = useWatchlistStore();
  const {
    febboxApiKey,
    introDbApiKey,
    enableUnsafeEmbeds,
    customAccentHex,
    accentColor,
    idlePauseOverlay,
    defaultSource,
    autoPlay,
    autoNext,
    skipIntro,
    skipOutro,
    autoSkipSegments,
    animeAudioMode: settingsAnimeAudioMode,
  } = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const effectiveFebboxToken = resolveFebboxToken(febboxApiKey);
  const hasAnyFebboxToken = Boolean(effectiveFebboxToken);

  // Sync anime audio mode from settings on mount
  useEffect(() => {
    setAnimeAudioMode(settingsAnimeAudioMode ?? "sub");
  }, [settingsAnimeAudioMode]);

  const currentMediaKey = `${type}-${id}`;

  const resolvedAccentHex = useMemo(
    () => getAccentHex(accentColor, customAccentHex),
    [accentColor, customAccentHex],
  );

  // Prevent duplicate loading
  const loadingRef = useRef(false);
  const lastLoadKey = useRef("");
  /** Cache for prefetched next-episode scrape results: key = "season:episode" */
  const prefetchCacheRef = useRef<
    Map<string, import("@/types").SourceResult[]>
  >(new Map());
  /** Tracks which next-episode keys have already been prefetch-triggered */
  const prefetchTriggeredRef = useRef<Set<string>>(new Set());

  const fetchSegments = useCallback(
    async (params: {
      tmdbId: string;
      mediaType: "movie" | "show";
      season?: number;
      episode?: number;
    }) => {
      const query = new URLSearchParams({
        tmdbId: params.tmdbId,
        type: params.mediaType,
      });
      if (params.mediaType === "show") {
        query.set("season", String(params.season ?? 1));
        query.set("episode", String(params.episode ?? 1));
      }

      try {
        const headers: Record<string, string> = {};
        if (introDbApiKey) headers["x-introdb-api-key"] = introDbApiKey;
        if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

        const response = await fetch(`/api/segments?${query.toString()}`, {
          signal: AbortSignal.timeout(9000),
          headers,
        });
        if (!response.ok) return EMPTY_SEGMENTS;
        const json = await response.json();
        const value = json?.segments;
        if (!value || typeof value !== "object") return EMPTY_SEGMENTS;
        return {
          intro: Array.isArray(value.intro) ? value.intro : [],
          recap: Array.isArray(value.recap) ? value.recap : [],
          credits: Array.isArray(value.credits) ? value.credits : [],
          preview: Array.isArray(value.preview) ? value.preview : [],
        } as MediaSegments;
      } catch {
        return EMPTY_SEGMENTS;
      }
    },
    [introDbApiKey],
  );

  const proceedWithScrape = useCallback(
    async (seekTime?: number) => {
      if (typeof seekTime === "number") {
        setAppliedSeekTime(seekTime);
      }

      try {
        let mediaData: Movie | Show | null = media;
        let extImdbId: string | undefined = imdbId;

        // ── AniList anime fast-path (al-XXXX IDs or /anime/ type) ─────────
        // These don't exist in TMDB — skip directly to AnimeKAI scraping.
        if (id.startsWith("al-") || type === "anime") {
          setIsAnime(true);
          let animeTitle = mediaData?.title ?? "";
          let finalMedia = mediaData;
          
          if (!animeTitle) {
            try {
              const numericId = parseInt(id.replace("al-", ""), 10);
              const { getAnimeFullDetails } = await import("@/lib/anilist");
              const details = await getAnimeFullDetails(numericId);
              const titleStr = details.title.english || details.title.romaji || details.title.native || "";
              animeTitle = titleStr;
              
              const mItem = {
                id: numericId.toString(),
                tmdbId: `al-${numericId}`,
                mediaType: "show" as const,
                title: titleStr,
                posterPath: details.coverImage?.extraLarge || details.coverImage?.large,
                backdropPath: details.bannerImage || null,
                releaseYear: details.startDate?.year,
                rating: details.averageScore ? details.averageScore / 10 : 0,
                overview: details.description?.replace(/<[^>]+>/g, "") ?? "",
                type: "show",
              };
              setMedia(mItem as unknown as Show);
              finalMedia = mItem as unknown as Show;
            } catch (fallbackErr) {
              console.error("Client-side AniList fallback fetch failed:", fallbackErr);
              setScrapeStatus("error");
              return;
            }
          }

          // Try to discover real TMDB ID for subtitles and rich metadata
          let discoveredTmdbId: string | undefined = undefined;
          let discoveredImdbId: string | undefined = undefined;
          if (finalMedia) {
             try {
                const { searchShowByTitle, getTmdbEpisodesForAnime } = await import("@/lib/tmdb");
                const tmdbMatch = await searchShowByTitle(animeTitle, finalMedia.releaseYear);
                if (tmdbMatch) {
                   discoveredTmdbId = String(tmdbMatch.tmdbId);
                   discoveredImdbId = tmdbMatch.imdbId;
                   setTmdbId(discoveredTmdbId);
                   if (discoveredImdbId) setImdbId(discoveredImdbId);

                   // Also try to get rich episode metadata
                   const startDate = (initialMedia as any)?.startDate || { year: finalMedia.releaseYear, month: 1, day: 1 };
                   const epData = await getTmdbEpisodesForAnime(discoveredTmdbId, `${startDate.year}-${startDate.month}-${startDate.day}`, (finalMedia as any).totalEpisodes || 24);
                   
                   if (epData.episodes?.length > 0) {
                      const enrichedSeason = {
                         id: 1,
                         seasonNumber: 1,
                         name: "Episodes",
                         overview: finalMedia.overview || "",
                         posterPath: finalMedia.posterPath || null,
                         episodes: epData.episodes.map(tep => ({
                            id: tep.episode_number,
                            episodeNumber: tep.episode_number,
                            name: (tep.name && !tep.name.toLowerCase().startsWith("episode ")) ? tep.name : `Episode ${tep.episode_number}`,
                            overview: tep.overview,
                            stillPath: tep.still_path,
                            airDate: "",
                            runtime: 24,
                            voteAverage: 0
                         }))
                      };
                      setSeason(enrichedSeason as any);
                      const curEp = enrichedSeason.episodes.find(e => e.episodeNumber === episodeNum);
                      if (curEp) setCurrentEpisode(curEp as any);
                   }
                }
             } catch (tmdbErr) {
                console.error("Failed to discover TMDB metadata for anime:", tmdbErr);
             }
          }
          
          // Use real season data from initialMedia if available (AniList streamingEpisodes mapped episodes)
          // Only if we haven't already enriched from TMDB
          const realSeasonData = finalMedia && "seasons" in finalMedia && (finalMedia as any).seasons?.[0];
          if (realSeasonData && realSeasonData.episodes?.length > 0 && !discoveredTmdbId) {
            setSeason(realSeasonData);
            const currentEp = realSeasonData.episodes.find(
              (ep: any) => ep.episodeNumber === episodeNum
            );
            if (currentEp) setCurrentEpisode(currentEp);
          } else if (!discoveredTmdbId) {
            // Fallback: generate generic episode stubs
            const maxEps = finalMedia && "totalEpisodes" in finalMedia && typeof (finalMedia as any).totalEpisodes === "number" && (finalMedia as any).totalEpisodes > 0
              ? (finalMedia as any).totalEpisodes
              : 24;
            setSeason({
              id: 1,
              seasonNumber: 1,
              name: "Episodes",
              overview: "",
              posterPath: finalMedia?.posterPath || null,
              episodes: Array.from({ length: maxEps }).map((_, i) => ({
                id: i + 1,
                episodeNumber: i + 1,
                name: `Episode ${i + 1}`,
                overview: "",
                stillPath: finalMedia?.backdropPath || finalMedia?.posterPath || null,
                airDate: finalMedia?.releaseYear ? String(finalMedia.releaseYear) : "",
                runtime: 24,
                voteAverage: 0,
              })),
            });
          }

          await scrapeAnimeSource(animeTitle, episodeNum, animeAudioMode);
          return;
        }
        // ──────────────────────────────────────────────────────────────────

        if (!mediaData || mediaData.tmdbId !== id) {
          if (type === "movie") {
            const movie = await getMovieDetails(id);
            setMedia(movie);
            mediaData = movie;
            try {
              const ext = await getExternalIds("movie", id);
              setImdbId(ext.imdbId || movie.imdbId);
              extImdbId = ext.imdbId || movie.imdbId;
            } catch {
              setImdbId(movie.imdbId);
              extImdbId = movie.imdbId;
            }
          } else {
            const show = await getShowDetails(id);
            setMedia(show);
            mediaData = show;
            try {
              const ext = await getExternalIds("tv", id);
              setImdbId(ext.imdbId || (show as any).imdbId);
              extImdbId = ext.imdbId || (show as any).imdbId;
            } catch {
              setImdbId((show as any).imdbId);
              extImdbId = (show as any).imdbId;
            }
          }
        }

        // ── Anime detection (only for shows) ──────────────────────────────
        if (type === "show" && mediaData) {
          const show = mediaData as Show;
          const detected = await detectAnime(
            id,
            show.title,
            show.releaseYear,
            show.originCountry,
          );
          setIsAnime(detected);

          if (detected) {
            // Mock season to enable VideoPlayer episode selector for TMDB animes
            const maxEps = show.totalEpisodes && show.totalEpisodes > 0 ? show.totalEpisodes : 24;
            setSeason({
              id: 1,
              seasonNumber: 1,
              name: "AnimeEpisodes",
              overview: "",
              posterPath: null,
              episodes: Array.from({ length: maxEps }).map((_, i) => ({
                id: i + 1,
                episodeNumber: i + 1,
                name: `Episode ${i + 1}`,
                overview: "",
                stillPath: null,
                airDate: "",
                runtime: 24,
                voteAverage: 0,
              })),
            });

            // Fetch segments for anime if TMDB ID was discovered
            if (discoveredTmdbId) {
              const seg = await fetchSegments({
                tmdbId: discoveredTmdbId,
                mediaType: "show",
                season: seasonNum,
                episode: episodeNum,
              });
              setSegments(seg);
              setIntroOutro({
                introStart: seg.intro?.[0]?.startMs != null ? seg.intro[0].startMs / 1000 : undefined,
                introEnd: seg.intro?.[0]?.endMs != null ? seg.intro[0].endMs / 1000 : undefined,
                outroStart: seg.credits?.[0]?.startMs != null ? seg.credits[0].startMs / 1000 : undefined,
                outroEnd: seg.credits?.[0]?.endMs != null ? seg.credits[0].endMs / 1000 : undefined,
              });
            }

            // Use AnimeKAI pipeline instead of standard scraping
            await scrapeAnimeSource(show.title, episodeNum, animeAudioMode);
            return;
          }
        }
        // ─────────────────────────────────────────────────────────────────

        if (type === "movie") {
          const seg = await fetchSegments({ tmdbId: id, mediaType: "movie" });
          setSegments(seg);
          setIntroOutro({
            introStart:
              seg.intro?.[0]?.startMs != null
                ? seg.intro[0].startMs / 1000
                : undefined,
            introEnd:
              seg.intro?.[0]?.endMs != null
                ? seg.intro[0].endMs / 1000
                : undefined,
            outroStart:
              seg.credits?.[0]?.startMs != null
                ? seg.credits[0].startMs / 1000
                : undefined,
            outroEnd:
              seg.credits?.[0]?.endMs != null
                ? seg.credits[0].endMs / 1000
                : undefined,
          });
        } else {
          const seasonData = await getSeasonDetails(id, seasonNum);
          setSeason(seasonData);
          const ep = seasonData.episodes?.find(
            (e) => e.episodeNumber === episodeNum,
          );
          setCurrentEpisode(ep || null);

          const segmentsTmdbId = discoveredTmdbId || id;
          const seg = await fetchSegments({
            tmdbId: segmentsTmdbId,
            mediaType: "show",
            season: seasonNum,
            episode: episodeNum,
          });
          setSegments(seg);
          setIntroOutro({
            introStart:
              seg.intro?.[0]?.startMs != null
                ? seg.intro[0].startMs / 1000
                : undefined,
            introEnd:
              seg.intro?.[0]?.endMs != null
                ? seg.intro[0].endMs / 1000
                : undefined,
            outroStart:
              seg.credits?.[0]?.startMs != null
                ? seg.credits[0].startMs / 1000
                : undefined,
            outroEnd:
              seg.credits?.[0]?.endMs != null
                ? seg.credits[0].endMs / 1000
                : undefined,
          });
        }

        if (mediaData) {
          setScrapeStatus("loading");

          const results = await scrapeAllSources({
            tmdbId: id,
            imdbId: extImdbId,
            title: mediaData.title,
            releaseYear: mediaData.releaseYear,
            mediaType: type as "movie" | "show",
            season: seasonNum,
            episode: episodeNum,
            febboxCookie: effectiveFebboxToken,
            sessionToken,
            accentColor: resolvedAccentHex.replace("#", ""),
            idlePauseOverlay,
            startAt: seekTime,
            autoPlay,
            autoNext,
            autoSkipSegments: skipIntro || skipOutro || autoSkipSegments,
            nextButton: true,
            episodeSelector: true,
          });

          const filteredResults = enableUnsafeEmbeds
            ? results
            : results.filter(
                (r) =>
                  r.stream.type !== "embed" ||
                  ["cinesrc", "vidking", "zxcstream"].includes(r.sourceId),
              );

          if (filteredResults.length > 0) {
            setSourceResults(filteredResults);

            // Priority 1: User's default source from settings
            const defaultIdx = filteredResults.findIndex(
              (r) => r.sourceId === defaultSource,
            );

            if (defaultIdx !== -1) {
              setSourceIndex(defaultIdx);
              setStream(
                withMergedCaptions(
                  filteredResults[defaultIdx].stream,
                  externalCaptions,
                ),
              );
              setScrapeStatus("success");
            } else {
              // Priority 2: Best direct stream (non-embed) based on rank
              const sortedResults = [...filteredResults].sort((a, b) => {
                const rankA =
                  SOURCES.find((s) => s.id === a.sourceId)?.rank || 0;
                const rankB =
                  SOURCES.find((s) => s.id === b.sourceId)?.rank || 0;
                return rankB - rankA;
              });

              const bestDirect = sortedResults.find(
                (r) => r.stream.type !== "embed",
              );
              const bestDirectIdx = bestDirect
                ? filteredResults.indexOf(bestDirect)
                : 0;

              setSourceIndex(bestDirectIdx);
              setStream(
                withMergedCaptions(
                  filteredResults[bestDirectIdx].stream,
                  externalCaptions,
                ),
              );
              setScrapeStatus("success");
            }
          } else {
            setScrapeStatus("error");
          }
        }
      } catch (err) {
        console.error("Failed to load media:", err);
        setScrapeStatus("error");
      }
    },
    [
      type,
      id,
      seasonNum,
      episodeNum,
      media,
      imdbId,
      effectiveFebboxToken,
      fetchSegments,
      sessionToken,
      resolvedAccentHex,
      idlePauseOverlay,
      enableUnsafeEmbeds,
      externalCaptions,
      defaultSource,
      autoPlay,
      autoNext,
      skipIntro,
      skipOutro,
      autoSkipSegments,
      setIntroOutro,
      animeAudioMode,
    ],
  );

  /**
   * Anikuro scraping pipeline:
   * Resolves AniList ID → calls anikuro.to/api/getsources → extracts HLS playlist
   *
   * URL format: https://anikuro.to/api/getsources/?id={anilistId}&lol={server}&ep={epNum}
   * Servers: animez | allani | animekai | anigg  (tried in order via the backend route)
   */
  const scrapeAnimeSource = useCallback(
    async (title: string, epNum: number, mode: AnimeAudioMode) => {
      if (animeLoadingRef.current) return;
      animeLoadingRef.current = true;
      setScrapeStatus("loading");

      try {
        // 1. Resolve AniList ID
        //    - For native anime routes the id is "al-XXXX"; strip prefix.
        //    - For TMDB-detected anime use /api/anime-resolve.
        let anilistId: string | null = null;

        if (id.startsWith("al-")) {
          anilistId = id.replace("al-", "");
        } else {
          const resolveRes = await fetch(
            `/api/anime-resolve?title=${encodeURIComponent(title)}&year=${media?.releaseYear ?? ""}`,
          );
          if (resolveRes.ok) {
            const resolveData = await resolveRes.json();
            if (resolveData.anilistId) {
              anilistId = String(resolveData.anilistId);
            }
          }
        }

        if (!anilistId) throw new Error("Could not resolve AniList ID for this anime");

        // 2. Fetch source from anikuro.to (backend tries all servers in order)
        const srcRes = await fetch(
          `/api/anikuro/source?anilistId=${encodeURIComponent(anilistId)}&ep=${encodeURIComponent(epNum)}&mode=${mode}&t=${Date.now()}`,
          { cache: 'no-store' }
        );

        if (!srcRes.ok) {
          const data = await srcRes.json().catch(() => ({}));
          throw new Error(data.error || `Anikuro returned ${srcRes.status}`);
        }

        const srcData = await srcRes.json();

        // Handle fallback from dub to sub
        if (srcData.isFallback && mode === "dub") {
          setAnimeAudioMode("sub");
        }

        const playlist: string = srcData.playlist ?? "";
        const tracks: any[] = srcData.tracks ?? [];
        const skip: any = srcData.skip ?? {};
        const headers: Record<string, string> | undefined = srcData.headers;

        if (!playlist) throw new Error("No playable source found on anikuro.to");

        // 3. Map subtitle tracks to Caption objects
        const sourceCaptions: Caption[] = tracks
          .filter((t: any) => t.kind === "subtitles" || t.kind === "captions")
          .map((t: any, i: number) => ({
            id: `anime-track-${i}`,
            url: t.file,
            language: t.label?.toLowerCase().slice(0, 2) ?? "en",
            label: t.label ?? "Subtitle",
            type: "vtt" as const,
          }));

        const captions = sourceCaptions;

        const animeStream: import("@/types").HlsBasedStream = {
          type: "hls",
          id: "anikuro-stream",
          flags: [],
          captions,
          playlist,
          headers,
        };

        const mergedStream = withMergedCaptions(animeStream, externalCaptions);
        setStream(mergedStream);
        setSourceResults([{ sourceId: "anikuro", stream: mergedStream }]);
        setSourceIndex(0);
        setScrapeStatus("success");

        // 4. Set intro/outro skip times if available
        // Anikuro returns {start:0,end:0} when no segment — check values not object truthiness
        const hasIntro = (skip?.intro?.start ?? 0) > 0 && (skip?.intro?.end ?? 0) > 0;
        const hasOutro = (skip?.outro?.start ?? 0) > 0 && (skip?.outro?.end ?? 0) > 0;
        if (hasIntro || hasOutro) {
          setIntroOutro({
            introStart: hasIntro ? skip.intro.start : undefined,
            introEnd: hasIntro ? skip.intro.end : undefined,
            outroStart: hasOutro ? skip.outro.start : undefined,
            outroEnd: hasOutro ? skip.outro.end : undefined,
          });
        }
      } catch (err: any) {
        console.error("[Anikuro] scrape error:", err);
        setScrapeStatus("error");
      } finally {
        animeLoadingRef.current = false;
      }
    },
    [id, media, externalCaptions, setIntroOutro],
  );

  /** Called from VideoPlayer when user changes Sub/Dub/Soft-sub */
  const handleAnimeAudioModeChange = useCallback(
    (mode: AnimeAudioMode) => {
      setAnimeAudioMode(mode);
      updateSettings({ animeAudioMode: mode });
      if (media && isAnime) {
        reset();
        setStream(null);
        setScrapeStatus("idle");
        void scrapeAnimeSource(media.title, episodeNum, mode);
      }
    },
    [media, isAnime, episodeNum, scrapeAnimeSource, updateSettings, reset],
  );

  const loadMedia = useCallback(async () => {
    const loadKey = `${type}-${id}-${seasonNum}-${episodeNum}-${effectiveFebboxToken ? "fb1" : "fb0"}`;
    if (loadingRef.current || lastLoadKey.current === loadKey) return;
    loadingRef.current = true;
    lastLoadKey.current = loadKey;

    reset();
    setScrapeStatus("idle");
    setStream(null);
    setSegments(EMPTY_SEGMENTS);
    setIntroOutro(null);
    setSourceResults([]);
    setSourceIndex(0);
    setShowResumeOverlay(false);

    // Fallback to stored progress if URL doesn't have a timestamp
    let initialSeek = resumeTimeFromUrl;
    const item = getByTmdbId(id) || getByTmdbId(media?.tmdbId || `al-${id}`);
    const prog = item?.progress;

    const isSameType = item?.mediaType === type;
    const isSameId = String(item?.tmdbId) === String(id);
    const isSameEpisode =
      type === "movie" ||
      (prog?.season === seasonNum && prog?.episode === episodeNum);
    const hasMeaningfulProgress =
      isSameType && isSameId && isSameEpisode && prog?.percentage;

    if (initialSeek === 0 && hasMeaningfulProgress && prog?.timestamp) {
      initialSeek = prog.timestamp;
    }

    setAppliedSeekTime(initialSeek);

    try {
      if (hasMeaningfulProgress && prog?.percentage !== undefined) {
        if (prog.percentage > 90) {
          setResumeData({
            percentage: prog.percentage,
            timestamp: prog.timestamp || 0,
          });
          setResumeType("high");
          setShowResumeOverlay(true);
          loadingRef.current = false;
          return;
        }
        if (prog.percentage > 1 && prog.percentage < 10) {
          setResumeData({
            percentage: prog.percentage,
            timestamp: prog.timestamp || 0,
          });
          setResumeType("low");
          setShowResumeOverlay(true);
          loadingRef.current = false;
          return;
        }
      }

      await proceedWithScrape(initialSeek);
    } catch (err) {
      console.error("Failed to load media:", err);
      setScrapeStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, [
    type,
    id,
    seasonNum,
    episodeNum,
    effectiveFebboxToken,
    getByTmdbId,
    reset,
    proceedWithScrape,
    resumeTimeFromUrl,
  ]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const load = async () => {
      // Normalize type for subtitles service (only supports show/movie)
      const normalizedType = type === "anime" ? "show" : type;

      const caps = await loadExternalCaptions({
        imdbId,
        tmdbId: tmdbId || id,
        mediaType: normalizedType as "movie" | "show",
        season: seasonNum,
        episode: episodeNum,
        title: media?.title,
      });

      if (!cancelled) {
        setExternalCaptions(caps);
        setStream((prev) => {
          if (!prev) return null;
          return withMergedCaptions(prev, caps);
        });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, imdbId, tmdbId, type, seasonNum, episodeNum, media?.title]);


  useEffect(() => {
    return () => reset();
  }, [reset]);

  const saveProgress = useCallback(
    (time: number, dur: number) => {
      if (!time || !dur || dur < 30 || !media) return;
      const item = getByTmdbId(id);
      const percent = Math.max(0, Math.min(100, (time / dur) * 100));
      if (percent < 0.1) return;

      updateProgress(
        item?.id || "",
        {
          season: type === "show" || type === "anime" ? seasonNum : undefined,
          episode: type === "show" || type === "anime" ? episodeNum : undefined,
          timestamp: Math.floor(time),
          percentage: percent,
        },
        {
          tmdbId: id,
          externalTmdbId: tmdbId || (media as any)?.externalTmdbId,
          mediaType: (type === "anime" ? "show" : type) as "movie" | "show",
          title: media.title,
          posterPath: media.posterPath,
        },
      );
    },
    [id, type, seasonNum, episodeNum, getByTmdbId, updateProgress, media],
  );

  // Handle unmount save
  const progressRef = useRef({ currentTime, duration });
  useEffect(() => {
    progressRef.current = { currentTime, duration };
  }, [currentTime, duration]);

  useEffect(() => {
    return () => {
      const { currentTime: t, duration: d } = progressRef.current;
      if (t > 0 && d > 0) {
        saveProgress(t, d);
      }
    };
  }, [saveProgress]);

  /** Silently pre-scrape the next episode so navigation is instant. */
  const prefetchNextEpisode = useCallback(
    async (targetSeason: number, targetEpisode: number) => {
      if (!media) return;
      const key = `${targetSeason}:${targetEpisode}`;
      if (prefetchTriggeredRef.current.has(key)) return;
      prefetchTriggeredRef.current.add(key);

      try {
        const results = await scrapeAllSources({
          tmdbId: id,
          imdbId,
          title: media.title,
          releaseYear: media.releaseYear,
          mediaType: "show",
          season: targetSeason,
          episode: targetEpisode,
          febboxCookie: effectiveFebboxToken,
          sessionToken,
          accentColor: resolvedAccentHex.replace("#", ""),
          idlePauseOverlay,
          autoPlay,
          autoNext,
          autoSkipSegments: skipIntro || skipOutro || autoSkipSegments,
          nextButton: true,
          episodeSelector: true,
        });
        if (results.length > 0) {
          prefetchCacheRef.current.set(key, results);
        }
      } catch {
        // prefetch failures are silent
      }
    },
    [
      id,
      imdbId,
      media,
      effectiveFebboxToken,
      sessionToken,
      resolvedAccentHex,
      idlePauseOverlay,
      autoPlay,
      autoNext,
      skipIntro,
      skipOutro,
      autoSkipSegments,
    ],
  );

  useEffect(() => {
    if (!duration || duration < 30 || !currentTime || !media) return;

    const percent = Math.max(0, Math.min(100, (currentTime / duration) * 100));
    if (percent < 0.1) return;

    const now = Date.now();
    const second = Math.floor(currentTime);
    const key = `${id}:${type}:${seasonNum}:${episodeNum}`;
    const last = lastProgressSyncRef.current;

    if (last.key !== key) {
      lastProgressSyncRef.current = { wallTime: now, percent, second, key };
      // First save for this item can happen sooner (e.g., after 5s)
      return;
    }

    const movedEnoughInTime = Math.abs(second - last.second) >= 20;
    const movedEnoughInPercent = Math.abs(percent - last.percent) >= 2.0;
    const enoughWallTime = now - last.wallTime >= 15_000; // Reduced from 25s to 15s

    if (enoughWallTime && (movedEnoughInTime || movedEnoughInPercent)) {
      lastProgressSyncRef.current = { wallTime: now, percent, second, key };
      saveProgress(currentTime, duration);
    }

    // ── Prefetch next episode when ~2 minutes from end ──────────────────
    if (
      (type === "show" || type === "anime") &&
      duration > 120 &&
      currentTime > 0 &&
      duration - currentTime <= 120 &&
      duration - currentTime > 0
    ) {
      const nextEp = episodeNum + 1;
      const episodesInSeason = season?.episodes?.length ?? 0;
      if (nextEp <= episodesInSeason) {
        void prefetchNextEpisode(seasonNum, nextEp);
      }
    }
  }, [
    currentTime,
    duration,
    id,
    type,
    seasonNum,
    episodeNum,
    saveProgress,
    season,
    prefetchNextEpisode,
  ]);

  useEffect(() => {
    try {
      setDismissedTokenNoticeSitewide(
        window.localStorage.getItem(FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY) === "1",
      );
    } catch {
      setDismissedTokenNoticeSitewide(false);
    }
  }, []);

  useEffect(() => {
    setDismissedTokenNoticeMediaKey((prev) =>
      prev === currentMediaKey ? prev : null,
    );
  }, [currentMediaKey]);

  const lastNavigateRef = useRef<{
    ts: number;
    season: number;
    episode: number;
  }>({ ts: 0, season: seasonNum, episode: episodeNum });

  const navigateEpisode = (s: number, e: number) => {
    const now = Date.now();
    const last = lastNavigateRef.current;

    // Avoid immediate double-jump glitches caused by edge-case auto-next race
    if (
      now - last.ts < 1200 &&
      last.season === s &&
      Math.abs(e - last.episode) <= 1
    ) {
      return;
    }
    if (now - last.ts < 1200 && Math.abs(e - episodeNum) > 1) {
      // guard against accidental two-step skip (e.g. 2->4) during fast auto-next sequence
      console.warn("Blocked suspicious fast navigation", {
        current: episodeNum,
        target: e,
        last,
      });
      return;
    }

    lastNavigateRef.current = { ts: now, season: s, episode: e };
    
    if (type === "anime") {
        router.push(`/watch/anime/${id.replace("al-", "")}?s=${s}&e=${e}`);
    } else {
        router.push(`/watch/show/${id}?s=${s}&e=${e}`);
    }
  };

  const tryNextSource = useCallback(() => {
    if (sourceResults.length < 2) return;
    const next = (sourceIndex + 1) % sourceResults.length;
    const currentStream = sourceResults[next].stream;
    setSourceIndex(next);
    setStream(withMergedCaptions(currentStream, externalCaptions));
  }, [sourceIndex, sourceResults, externalCaptions]);

  const selectSource = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= sourceResults.length) return;
      const currentStream = sourceResults[idx].stream;
      setSourceIndex(idx);
      setStream(withMergedCaptions(currentStream, externalCaptions));
    },
    [sourceResults, externalCaptions],
  );

  const openSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const dismissTokenNoticeForCurrentMedia = useCallback(() => {
    setDismissedTokenNoticeMediaKey(currentMediaKey);
  }, [currentMediaKey]);

  const dismissTokenNoticeSitewide = useCallback(() => {
    setDismissedTokenNoticeSitewide(true);
    try {
      window.localStorage.setItem(FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY, "1");
    } catch (e) {
      console.error("Failed to save sitewide dismiss:", e);
    }
  }, []);

  const handleResumeChoice = (choice: "watch" | "rewatch" | "next") => {
    setShowResumeOverlay(false);
    if (choice === "next") {
      const nextEpNum = episodeNum + 1;
      if (type === "anime") {
        router.push(`/watch/anime/${id.replace("al-", "")}?s=${seasonNum}&e=${nextEpNum}`);
      } else {
        router.push(`/watch/show/${id}?s=${seasonNum}&e=${nextEpNum}`);
      }
      return;
    }
    const seekTime = choice === "rewatch" ? 0.1 : resumeData?.timestamp || 0;
    proceedWithScrape(seekTime);
  };

  const shouldShowMissingFebboxTokenPrompt =
    scrapeStatus === "error" && !stream && !hasAnyFebboxToken;
  const shouldShowPersistentTokenNotice =
    !hasAnyFebboxToken &&
    !dismissedTokenNoticeSitewide &&
    dismissedTokenNoticeMediaKey !== currentMediaKey;

  const currentEpisodeComputed = useMemo(() => {
    if (type !== "show" && type !== "anime") return null;
    if (currentEpisode?.episodeNumber === episodeNum) return currentEpisode;
    return (
      season?.episodes?.find((ep) => ep.episodeNumber === episodeNum) || null
    );
  }, [type, currentEpisode, season, episodeNum]);

  const getTitle = () => {
    return media?.title || "";
  };

  const getSubtitle = () => {
    if (type === "anime") {
      const epInfo = currentEpisodeComputed;
      const epName = epInfo?.name && epInfo.name !== `Episode ${episodeNum}` && epInfo.name !== `Episode ${episodeNum}:`
        ? epInfo.name
        : null;
      return epName ? `Episode ${episodeNum} - ${epName}` : `Episode ${episodeNum}`;
    }
    if (type === "show") {
      const episodeName = currentEpisodeComputed?.name || "";
      return `S${seasonNum}:E${episodeNum}${episodeName ? ` - ${episodeName}` : ""}`;
    }
    return "";
  };

  return (
    <>
      <Head>
        <meta name="robots" content="noindex,follow" />
        <meta name="googlebot" content="noindex,follow,noimageindex" />
      </Head>
      <div className="fixed inset-0 bg-black z-50">
        <VideoPlayer
          stream={stream}
          fullViewport
          onBack={() => {
            if (type === "show") {
              router.push(`/show/${id}`);
              return;
            }
            if (type === "anime") {
              router.push(`/anime/${id.replace(/^al-/, "")}`);
              return;
            }
            router.push(`/movie/${id}`);
          }}
          title={getTitle()}
          subtitle={getSubtitle()}
          media={media}
          season={season}
          seasonNum={seasonNum}
          episodeNum={episodeNum}
          mediaType={type === "movie" ? "movie" : "show"}
          onNavigateEpisode={navigateEpisode}
          scrapeStatus={scrapeStatus}
          segments={segments}
          tmdbId={id}
          externalTmdbId={(initialMedia as any)?.externalTmdbId}
          sourceLabel={
            isAnime
              ? "AnimeKAI"
              : sourceResults.length > 0
                ? sourceResults[sourceIndex]?.sourceId
                : undefined
          }
          canTryNextSource={!isAnime && sourceResults.length > 1}
          onTryNextSource={isAnime ? undefined : tryNextSource}
          allSourceResults={isAnime ? [] : sourceResults}
          currentSourceIndex={isAnime ? 0 : sourceIndex}
          onSelectSource={isAnime ? undefined : selectSource}
          externalCaptions={memoizedExternalCaptions}
          scrapeErrorTitle={
            shouldShowMissingFebboxTokenPrompt
              ? "No FebBox token configured"
              : undefined
          }
          scrapeErrorDescription={
            shouldShowMissingFebboxTokenPrompt
              ? "Add your own token in settings"
              : undefined
          }
          scrapeErrorActionLabel={
            shouldShowMissingFebboxTokenPrompt ? "Open settings" : undefined
          }
          onScrapeErrorAction={
            shouldShowMissingFebboxTokenPrompt
              ? () => router.push("/settings")
              : undefined
          }
          initialSeekTime={appliedSeekTime}
          isAnime={isAnime}
          animeAudioMode={animeAudioMode}
          onAnimeAudioModeChange={handleAnimeAudioModeChange}
        />

        {showResumeOverlay && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl animate-fade-in">
            <div className="mx-4 w-full max-w-xl rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:px-8 sm:py-8 animate-scale-in">
              {resumeType === "high" ? (
                <>
                  <div className="mb-4 flex justify-center">
                    <div className="h-12 w-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent animate-pulse shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                  </div>
                  <h2 className="text-xl font-black text-white tracking-tighter mb-1 uppercase italic">
                    You're almost done
                  </h2>
                  <p className="text-white/50 text-xs font-medium leading-relaxed mb-4 px-4">
                    You've watched{" "}
                    <span className="text-accent font-bold">
                      {Math.round(resumeData?.percentage || 0)}%
                    </span>{" "}
                    of this {type === "movie" ? "movie" : "episode"}.
                  </p>

                  <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleResumeChoice("watch")}
                        className="btn-accent justify-center w-full"
                      >
                        Watch ({Math.round(resumeData?.percentage || 0)}%)
                      </button>
                      <button
                        onClick={() => handleResumeChoice("rewatch")}
                        className="btn-glass justify-center w-full"
                      >
                        Rewatch
                      </button>
                    </div>

                    {(type === "show" || type === "anime") && (
                      <button
                        onClick={() => handleResumeChoice("next")}
                        className="btn-glass !bg-accent/10 !border-accent/20 !text-accent justify-center w-full hover:!bg-accent/20"
                      >
                        Next Episode
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex justify-center">
                    <div className="h-12 w-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent animate-pulse shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                  </div>
                  <h2 className="text-xl font-black text-white tracking-tighter mb-1 uppercase italic">
                    Welcome back
                  </h2>
                  <p className="text-white/50 text-xs font-medium leading-relaxed mb-4 px-4">
                    You're just getting started. Resume from where you left off
                    or start over.
                  </p>

                  <div className="mx-auto grid w-full max-w-[360px] grid-cols-2 gap-2">
                    <button
                      onClick={() => handleResumeChoice("watch")}
                      className="btn-accent justify-center w-full"
                    >
                      Resume ({formatTime(resumeData?.timestamp || 0)})
                    </button>
                    <button
                      onClick={() => handleResumeChoice("rewatch")}
                      className="btn-glass justify-center w-full"
                    >
                      Start Over
                    </button>
                  </div>
                </>
              )}

              <button
                onClick={() => {
                  setShowResumeOverlay(false);
                  router.back();
                }}
                className="mt-4 text-[10px] font-black text-white/30 uppercase tracking-[0.3em] hover:text-white/60 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
