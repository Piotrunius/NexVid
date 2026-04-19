/* ============================================
   Watch Page – Full-screen player with auto-play
   ============================================ */

'use client';

import { VideoPlayer } from '@/components/player/VideoPlayer';
import { toast } from '@/components/ui/Toaster';
import { resolveFebboxToken } from '@/lib/febbox';
import { scrapeAllSources, SOURCES } from '@/lib/providers';
import type { MediaSegments } from '@/lib/tidb';
import { getExternalIds, getMovieDetails, getSeasonDetails, getShowDetails } from '@/lib/tmdb';
import { formatTime, getAccentHex } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useBlockedContentStore } from '@/stores/blockedContent';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useWatchlistStore } from '@/stores/watchlist';
import type { Caption, Episode, Movie, Season, Show, SourceResult, Stream } from '@/types';
import Head from 'next/head';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const runtime = 'edge';

const EMPTY_SEGMENTS: MediaSegments = {
  intro: [],
  recap: [],
  credits: [],
  preview: [],
};

const FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY = 'nexvid-febbox-token-notice-sitewide-dismissed';

function mergeSourceCaptions(results: Array<{ stream: Stream }>) {
  const seen = new Set<string>();
  const captions: Caption[] = [];

  for (const result of results) {
    const streamCaptions =
      'captions' in result.stream && Array.isArray(result.stream.captions)
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
  return 'captions' in stream && Array.isArray(stream.captions) ? stream.captions : [];
}

async function loadExternalCaptions(params: {
  imdbId?: string;
  tmdbId?: string;
  mediaType: 'movie' | 'show';
  season?: number;
  episode?: number;
}): Promise<Caption[]> {
  const { imdbId, tmdbId, mediaType, season, episode } = params;
  if (!imdbId && !tmdbId) return [];

  const query = new URLSearchParams({
    type: mediaType,
    t: Date.now().toString(),
  });
  if (imdbId) query.set('imdbId', imdbId);
  if (tmdbId) query.set('tmdbId', tmdbId);

  if (mediaType === 'show') {
    if (season) query.set('season', String(season));
    if (episode) query.set('episode', String(episode));
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
        const url = String(subtitle?.url || '');
        if (!url) return null;
        const language = String(subtitle?.language || 'en').toLowerCase();
        const type = String(subtitle?.type || '')
          .toLowerCase()
          .includes('vtt')
          ? 'vtt'
          : 'srt';

        let id = String(subtitle?.id || '');
        if (!id.startsWith('wyzie-')) {
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
      .filter((caption: Caption | null): caption is Caption => Boolean(caption));
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
  if (stream.type === 'embed') return stream;
  return {
    ...stream,
    captions: mergedCaptions,
  };
}

export default function WatchPageClient({ initialMedia }: { initialMedia?: Movie | Show | null }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isBlocked, isLoaded } = useBlockedContentStore();

  const routeType = String(params?.type || '').toLowerCase();
  const type: 'movie' | 'show' =
    routeType === 'show' || routeType === 'tv' || routeType === 'series' ? 'show' : 'movie';
  const id = params?.id as string;

  useEffect(() => {
    if (isLoaded && isBlocked(id, type)) {
      router.replace('/');
      toast('This content is no longer available', 'error');
    }
  }, [isLoaded, isBlocked, id, type, router]);

  const seasonNum = searchParams?.get('s') ? parseInt(searchParams.get('s')!) : 1;
  const episodeNum = searchParams?.get('e') ? parseInt(searchParams.get('e')!) : 1;
  const resumeTimeFromUrl = searchParams?.get('t') ? parseFloat(searchParams.get('t')!) : 0;

  const lastProgressSyncRef = useRef<{
    wallTime: number;
    percent: number;
    second: number;
    key: string;
  }>({
    wallTime: 0,
    percent: 0,
    second: 0,
    key: '',
  });

  const [media, setMedia] = useState<Movie | Show | null>(initialMedia || null);
  const [season, setSeason] = useState<Season | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [imdbId, setImdbId] = useState<string | undefined>((initialMedia as any)?.imdbId);
  const [stream, setStream] = useState<Stream | null>(null);
  const [segments, setSegments] = useState<MediaSegments>(EMPTY_SEGMENTS);
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const loadingSourceIdsRef = useRef<Set<string>>(new Set());
  const waitingForSourceIdRef = useRef<string | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [externalCaptions, setExternalCaptions] = useState<Caption[]>([]);
  const memoizedExternalCaptions = useMemo(() => externalCaptions, [externalCaptions]);

  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumeData, setResumeData] = useState<{
    percentage: number;
    timestamp: number;
  } | null>(null);
  const [resumeType, setResumeType] = useState<'low' | 'high' | null>(null);
  const [appliedSeekTime, setAppliedSeekTime] = useState(resumeTimeFromUrl);

  const [dismissedTokenNoticeMediaKey, setDismissedTokenNoticeMediaKey] = useState<string | null>(
    null,
  );
  const [dismissedTokenNoticeSitewide, setDismissedTokenNoticeSitewide] = useState(false);

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
  } = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const effectiveFebboxToken = resolveFebboxToken(febboxApiKey);
  const hasAnyFebboxToken = Boolean(effectiveFebboxToken);

  const currentMediaKey = `${type}-${id}`;

  const resolvedAccentHex = useMemo(
    () => getAccentHex(accentColor, customAccentHex),
    [accentColor, customAccentHex],
  );

  // Prevent duplicate loading
  const loadingRef = useRef(false);
  const lastLoadKey = useRef('');
  /** Cache for prefetched next-episode scrape results: key = "season:episode" */
  const prefetchCacheRef = useRef<Map<string, import('@/types').SourceResult[]>>(new Map());
  /** Tracks which next-episode keys have already been prefetch-triggered */
  const prefetchTriggeredRef = useRef<Set<string>>(new Set());

  const fetchSegments = useCallback(
    async (params: {
      tmdbId: string;
      mediaType: 'movie' | 'show';
      season?: number;
      episode?: number;
    }) => {
      const query = new URLSearchParams({
        tmdbId: params.tmdbId,
        type: params.mediaType,
      });
      if (params.mediaType === 'show') {
        query.set('season', String(params.season ?? 1));
        query.set('episode', String(params.episode ?? 1));
      }

      try {
        const headers: Record<string, string> = {};
        if (introDbApiKey) headers['x-introdb-api-key'] = introDbApiKey;
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

        const response = await fetch(`/api/segments?${query.toString()}`, {
          signal: AbortSignal.timeout(9000),
          headers,
        });
        if (!response.ok) return EMPTY_SEGMENTS;
        const json = await response.json();
        const value = json?.segments;
        if (!value || typeof value !== 'object') return EMPTY_SEGMENTS;
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
      if (typeof seekTime === 'number') {
        setAppliedSeekTime(seekTime);
      }

      try {
        let mediaData: Movie | Show | null = media;
        let extImdbId: string | undefined = imdbId;

        if (!mediaData || mediaData.tmdbId !== id) {
          if (type === 'movie') {
            const movie = await getMovieDetails(id);
            setMedia(movie);
            mediaData = movie;
            try {
              const ext = await getExternalIds('movie', id);
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
              const ext = await getExternalIds('tv', id);
              setImdbId(ext.imdbId || (show as any).imdbId);
              extImdbId = ext.imdbId || (show as any).imdbId;
            } catch {
              setImdbId((show as any).imdbId);
              extImdbId = (show as any).imdbId;
            }
          }
        }

        if (type === 'movie') {
          const seg = await fetchSegments({ tmdbId: id, mediaType: 'movie' });
          setSegments(seg);
          setIntroOutro({
            introStart: seg.intro?.[0]?.startMs != null ? seg.intro[0].startMs / 1000 : undefined,
            introEnd: seg.intro?.[0]?.endMs != null ? seg.intro[0].endMs / 1000 : undefined,
            outroStart:
              seg.credits?.[0]?.startMs != null ? seg.credits[0].startMs / 1000 : undefined,
            outroEnd: seg.credits?.[0]?.endMs != null ? seg.credits[0].endMs / 1000 : undefined,
          });
        } else {
          const seasonData = await getSeasonDetails(id, seasonNum);
          setSeason(seasonData);
          const ep = seasonData.episodes?.find((e) => e.episodeNumber === episodeNum);
          setCurrentEpisode(ep || null);

          const seg = await fetchSegments({
            tmdbId: id,
            mediaType: 'show',
            season: seasonNum,
            episode: episodeNum,
          });
          setSegments(seg);
          setIntroOutro({
            introStart: seg.intro?.[0]?.startMs != null ? seg.intro[0].startMs / 1000 : undefined,
            introEnd: seg.intro?.[0]?.endMs != null ? seg.intro[0].endMs / 1000 : undefined,
            outroStart:
              seg.credits?.[0]?.startMs != null ? seg.credits[0].startMs / 1000 : undefined,
            outroEnd: seg.credits?.[0]?.endMs != null ? seg.credits[0].endMs / 1000 : undefined,
          });
        }

        if (mediaData) {
          setScrapeStatus('loading');

          // Initialize source results with placeholders so they appear in UI immediately
          const initialMeta = SOURCES.filter((s) => {
            if (s.id === 'febbox' && !effectiveFebboxToken) return false;
            if (!enableUnsafeEmbeds) {
              if (s.type === 'embed' && !['cinesrc', 'vidking', 'zxcstream'].includes(s.id))
                return false;
            }
            return true;
          });

          const initialResults: SourceResult[] = initialMeta.map((s) => ({
            sourceId: s.id,
            stream: {
              type: 'file',
              id: `${s.id}-pending`,
              flags: [],
              qualities: {},
              captions: [],
            } as any,
          }));
          setSourceResults(initialResults);

          // Determine starting source (Priority 1: Setting, Priority 2: Best ranked)
          let targetId = defaultSource;
          if (!initialResults.some((r) => r.sourceId === targetId)) {
            const sorted = [...initialMeta].sort((a, b) => (b.rank || 0) - (a.rank || 0));
            targetId = sorted[0]?.id || '';
          }
          waitingForSourceIdRef.current = targetId;
          const initialIdx = initialResults.findIndex((r) => r.sourceId === targetId);
          setSourceIndex(initialIdx !== -1 ? initialIdx : 0);

          // Start parallel scraping
          const results = await scrapeAllSources({
            tmdbId: id,
            imdbId: extImdbId,
            title: mediaData.title,
            releaseYear: mediaData.releaseYear,
            mediaType: type as 'movie' | 'show',
            season: seasonNum,
            episode: episodeNum,
            febboxCookie: effectiveFebboxToken,
            sessionToken,
            accentColor: resolvedAccentHex.replace('#', ''),
            idlePauseOverlay,
            startAt: seekTime,
            autoPlay,
            autoNext,
            autoSkipSegments: skipIntro || skipOutro || autoSkipSegments,
            nextButton: true,
            episodeSelector: true,
            onSourceFound: (res) => {
              // Double check security settings before adding to results
              if (!enableUnsafeEmbeds) {
                const meta = SOURCES.find((s) => s.id === res.sourceId);
                if (
                  meta?.type === 'embed' &&
                  !['cinesrc', 'vidking', 'zxcstream'].includes(res.sourceId)
                ) {
                  return;
                }
              }

              setSourceResults((prev) => {
                const isPlaceholder = prev.some(
                  (p) => p.sourceId === res.sourceId && p.stream.id.endsWith('-pending'),
                );
                if (isPlaceholder) {
                  return prev.map((p) => (p.sourceId === res.sourceId ? res : p));
                }
                // If it's not a placeholder and not in list, add it (shouldn't happen with current logic but for safety)
                if (!prev.some((p) => p.sourceId === res.sourceId)) {
                  return [...prev, res];
                }
                return prev;
              });

              // If this is the source we're waiting for, set it immediately
              if (res.sourceId === waitingForSourceIdRef.current) {
                setStream((prev) => {
                  // Only update if the stream is actually different (by ID or URL)
                  if (
                    !prev ||
                    prev.id !== res.stream.id ||
                    (prev.type === 'embed' &&
                      res.stream.type === 'embed' &&
                      prev.url !== res.stream.url)
                  ) {
                    return withMergedCaptions(res.stream, externalCaptions);
                  }
                  return prev;
                });
                setScrapeStatus('success');
              }
            },
          });

          // Final check if target source was found
          if (
            !waitingForSourceIdRef.current ||
            !results.some((r) => r.sourceId === waitingForSourceIdRef.current)
          ) {
            // Find any successful result if the target failed
            const successful = results.length > 0;
            if (successful && !waitingForSourceIdRef.current) {
              // Logic to pick a fallback if needed, but usually onSourceFound handles the first one
            } else if (!successful && results.length === 0) {
              // Wait a bit to ensure all concurrent ones finished (Promise.all in scrapeAllSources ensures this)
              setScrapeStatus('error');
            }
          }
        }
      } catch (err) {
        console.error('Failed to load media:', err);
        setScrapeStatus('error');
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
    ],
  );

  const loadMedia = useCallback(async () => {
    const loadKey = `${type}-${id}-${seasonNum}-${episodeNum}-${effectiveFebboxToken ? 'fb1' : 'fb0'}`;
    if (loadingRef.current || lastLoadKey.current === loadKey) return;
    loadingRef.current = true;
    lastLoadKey.current = loadKey;

    reset();
    setScrapeStatus('idle');
    setStream(null);
    setSegments(EMPTY_SEGMENTS);
    setIntroOutro(null);
    setSourceResults([]);
    setSourceIndex(0);
    setShowResumeOverlay(false);

    // Fallback to stored progress if URL doesn't have a timestamp
    let initialSeek = resumeTimeFromUrl;
    const item = getByTmdbId(id);
    const prog = item?.progress;

    const isSameType = item?.mediaType === type;
    const isSameId = String(item?.tmdbId) === String(id);
    const isSameEpisode =
      type === 'movie' || (prog?.season === seasonNum && prog?.episode === episodeNum);
    const hasMeaningfulProgress = isSameType && isSameId && isSameEpisode && prog?.percentage;

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
          setResumeType('high');
          setShowResumeOverlay(true);
          loadingRef.current = false;
          return;
        }
        if (prog.percentage > 1 && prog.percentage < 10) {
          setResumeData({
            percentage: prog.percentage,
            timestamp: prog.timestamp || 0,
          });
          setResumeType('low');
          setShowResumeOverlay(true);
          loadingRef.current = false;
          return;
        }
      }

      await proceedWithScrape(initialSeek);
    } catch (err) {
      console.error('Failed to load media:', err);
      setScrapeStatus('error');
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
    if (!id) return;

    let cancelled = false;
    const load = async () => {
      const caps = await loadExternalCaptions({
        imdbId,
        tmdbId: id,
        mediaType: type as 'movie' | 'show',
        season: seasonNum,
        episode: episodeNum,
      });

      if (!cancelled) {
        setExternalCaptions(caps);
        // Do NOT call setStream here. VideoPlayer receives externalCaptions as a prop
        // and handles merging internally to avoid a full stream/player reset.
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, imdbId, type, seasonNum, episodeNum]);

  useEffect(() => {
    loadMedia();
    return () => reset();
  }, [loadMedia, reset]);

  const saveProgress = useCallback(
    (time: number, dur: number) => {
      if (!time || !dur || dur < 30 || !media) return;
      const item = getByTmdbId(id);
      const percent = Math.max(0, Math.min(100, (time / dur) * 100));
      if (percent < 0.1) return;

      updateProgress(
        item?.id || '',
        {
          season: type === 'show' ? seasonNum : undefined,
          episode: type === 'show' ? episodeNum : undefined,
          timestamp: Math.floor(time),
          percentage: percent,
        },
        {
          tmdbId: id,
          mediaType: type as 'movie' | 'show',
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
          mediaType: 'show',
          season: targetSeason,
          episode: targetEpisode,
          febboxCookie: effectiveFebboxToken,
          sessionToken,
          accentColor: resolvedAccentHex.replace('#', ''),
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
      type === 'show' &&
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
        window.localStorage.getItem(FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY) === '1',
      );
    } catch {
      setDismissedTokenNoticeSitewide(false);
    }
  }, []);

  useEffect(() => {
    setDismissedTokenNoticeMediaKey((prev) => (prev === currentMediaKey ? prev : null));
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
    if (now - last.ts < 1200 && last.season === s && Math.abs(e - last.episode) <= 1) {
      return;
    }
    if (now - last.ts < 1200 && Math.abs(e - episodeNum) > 1) {
      // guard against accidental two-step skip (e.g. 2->4) during fast auto-next sequence
      console.warn('Blocked suspicious fast navigation', {
        current: episodeNum,
        target: e,
        last,
      });
      return;
    }

    lastNavigateRef.current = { ts: now, season: s, episode: e };
    router.push(`/watch/show/${id}?s=${s}&e=${e}`);
  };

  const tryNextSource = useCallback(() => {
    if (sourceResults.length < 2) return;
    const next = (sourceIndex + 1) % sourceResults.length;
    const res = sourceResults[next];
    setSourceIndex(next);

    // If source is already found (not a pending placeholder)
    if (res.stream && !res.stream.id.endsWith('-pending')) {
      setStream(withMergedCaptions(res.stream, externalCaptions));
      waitingForSourceIdRef.current = res.sourceId;
    } else {
      // It's still pending, set current stream to null and wait for onSourceFound
      setStream(null);
      setScrapeStatus('loading');
      waitingForSourceIdRef.current = res.sourceId;
    }
  }, [sourceIndex, sourceResults, externalCaptions]);

  const selectSource = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= sourceResults.length) return;
      const res = sourceResults[idx];
      setSourceIndex(idx);

      if (res.stream && !res.stream.id.endsWith('-pending')) {
        setStream(withMergedCaptions(res.stream, externalCaptions));
        waitingForSourceIdRef.current = res.sourceId;
      } else {
        setStream(null);
        setScrapeStatus('loading');
        waitingForSourceIdRef.current = res.sourceId;
      }
    },
    [sourceResults, externalCaptions],
  );

  const openSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const dismissTokenNoticeForCurrentMedia = useCallback(() => {
    setDismissedTokenNoticeMediaKey(currentMediaKey);
  }, [currentMediaKey]);

  const dismissTokenNoticeSitewide = useCallback(() => {
    setDismissedTokenNoticeSitewide(true);
    try {
      window.localStorage.setItem(FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY, '1');
    } catch (e) {
      console.error('Failed to save sitewide dismiss:', e);
    }
  }, []);

  const handleResumeChoice = (choice: 'watch' | 'rewatch' | 'next') => {
    setShowResumeOverlay(false);
    if (choice === 'next') {
      const nextEpNum = episodeNum + 1;
      router.push(`/watch/show/${id}?s=${seasonNum}&e=${nextEpNum}`);
      return;
    }
    const seekTime = choice === 'rewatch' ? 0.1 : resumeData?.timestamp || 0;
    proceedWithScrape(seekTime);
  };

  const shouldShowMissingFebboxTokenPrompt =
    scrapeStatus === 'error' && !stream && !hasAnyFebboxToken;
  const shouldShowPersistentTokenNotice =
    !hasAnyFebboxToken &&
    !dismissedTokenNoticeSitewide &&
    dismissedTokenNoticeMediaKey !== currentMediaKey;

  const currentEpisodeComputed = useMemo(() => {
    if (type !== 'show') return null;
    if (currentEpisode?.episodeNumber === episodeNum) return currentEpisode;
    return season?.episodes?.find((ep) => ep.episodeNumber === episodeNum) || null;
  }, [type, currentEpisode, season, episodeNum]);

  const getTitle = () => {
    return media?.title || '';
  };

  const getSubtitle = () => {
    if (type === 'show') {
      const episodeName = currentEpisodeComputed?.name || '';
      return `S${seasonNum}:E${episodeNum}${episodeName ? ` - ${episodeName}` : ''}`;
    }
    return '';
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
            if (type === 'show') {
              router.push(`/show/${id}`);
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
          mediaType={type as 'movie' | 'show'}
          onNavigateEpisode={navigateEpisode}
          scrapeStatus={scrapeStatus}
          segments={segments}
          tmdbId={id}
          sourceLabel={sourceResults.length > 0 ? sourceResults[sourceIndex]?.sourceId : undefined}
          canTryNextSource={sourceResults.length > 1}
          onTryNextSource={tryNextSource}
          allSourceResults={sourceResults}
          currentSourceIndex={sourceIndex}
          onSelectSource={selectSource}
          externalCaptions={memoizedExternalCaptions}
          scrapeErrorTitle={
            shouldShowMissingFebboxTokenPrompt ? 'No FebBox token configured' : undefined
          }
          scrapeErrorDescription={
            shouldShowMissingFebboxTokenPrompt ? 'Add your own token in settings' : undefined
          }
          scrapeErrorActionLabel={shouldShowMissingFebboxTokenPrompt ? 'Open settings' : undefined}
          onScrapeErrorAction={
            shouldShowMissingFebboxTokenPrompt ? () => router.push('/settings') : undefined
          }
          initialSeekTime={appliedSeekTime}
        />

        {showResumeOverlay && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl animate-fade-in">
            <div className="mx-4 w-full max-w-xl rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:px-8 sm:py-8 animate-scale-in">
              {resumeType === 'high' ? (
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
                    You've watched{' '}
                    <span className="text-accent font-bold">
                      {Math.round(resumeData?.percentage || 0)}%
                    </span>{' '}
                    of this {type === 'movie' ? 'movie' : 'episode'}.
                  </p>

                  <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleResumeChoice('watch')}
                        className="btn-accent justify-center w-full"
                      >
                        Watch ({Math.round(resumeData?.percentage || 0)}%)
                      </button>
                      <button
                        onClick={() => handleResumeChoice('rewatch')}
                        className="btn-glass justify-center w-full"
                      >
                        Rewatch
                      </button>
                    </div>

                    {type === 'show' && (
                      <button
                        onClick={() => handleResumeChoice('next')}
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
                    You're just getting started. Resume from where you left off or start over.
                  </p>

                  <div className="mx-auto grid w-full max-w-[360px] grid-cols-2 gap-2">
                    <button
                      onClick={() => handleResumeChoice('watch')}
                      className="btn-accent justify-center w-full"
                    >
                      Resume ({formatTime(resumeData?.timestamp || 0)})
                    </button>
                    <button
                      onClick={() => handleResumeChoice('rewatch')}
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
