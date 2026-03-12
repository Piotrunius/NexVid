/* ============================================
   Watch Page – Full-screen player with auto-play
   ============================================ */

'use client';

export const runtime = 'edge';

import { VideoPlayer } from '@/components/player/VideoPlayer';
import { toast } from '@/components/ui/Toaster';
import { isPublicFebboxToken, PUBLIC_FEBBOX_TOKEN_PLACEHOLDER, resolveFebboxToken } from '@/lib/febbox';
import { scrapeAllSources, SOURCES } from '@/lib/providers';
import type { MediaSegments } from '@/lib/tidb';
import { getExternalIds, getMovieDetails, getSeasonDetails, getShowDetails } from '@/lib/tmdb';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useWatchlistStore } from '@/stores/watchlist';
import type { Caption, Episode, Movie, Season, Show, SourceResult, Stream } from '@/types';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    const streamCaptions = 'captions' in result.stream && Array.isArray(result.stream.captions)
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

  const query = new URLSearchParams({ type: mediaType });
  if (imdbId) query.set('imdbId', imdbId);
  if (tmdbId) query.set('tmdbId', tmdbId);

  if (mediaType === 'show') {
    if (season) query.set('season', String(season));
    if (episode) query.set('episode', String(episode));
  }

  try {
    const response = await fetch(`/api/subtitles?${query.toString()}`, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) return [];

    const json = await response.json();
    const subtitles = Array.isArray(json?.subtitles) ? json.subtitles : [];

    return subtitles
      .map((subtitle: any): Caption | null => {
        const url = String(subtitle?.url || '');
        if (!url) return null;
        const language = String(subtitle?.language || 'en').toLowerCase();
        const type = String(subtitle?.type || '').toLowerCase().includes('vtt') ? 'vtt' : 'srt';
        
        let id = String(subtitle?.id || '');
        if (!id.startsWith('wyzie-')) {
          id = `wyzie-${language}-${Math.random().toString(36).slice(2, 9)}`;
        }

        return {
          id,
          url,
          language,
          type,
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

export default function WatchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = params?.type as string;
  const id = params?.id as string;
  const seasonNum = searchParams?.get('s') ? parseInt(searchParams.get('s')!) : 1;
  const episodeNum = searchParams?.get('e') ? parseInt(searchParams.get('e')!) : 1;
  const resumeTime = searchParams?.get('t') ? parseFloat(searchParams.get('t')!) : 0;
  const lastProgressSyncRef = useRef<{ wallTime: number; percent: number; second: number; key: string }>({
    wallTime: 0,
    percent: 0,
    second: 0,
    key: '',
  });

  const [media, setMedia] = useState<Movie | Show | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [imdbId, setImdbId] = useState<string | undefined>();
  const [stream, setStream] = useState<Stream | null>(null);
  const [segments, setSegments] = useState<MediaSegments>(EMPTY_SEGMENTS);
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [externalCaptions, setExternalCaptions] = useState<Caption[]>([]);
  const memoizedExternalCaptions = useMemo(() => externalCaptions, [externalCaptions]);
  const [dismissedTokenNoticeMediaKey, setDismissedTokenNoticeMediaKey] = useState<string | null>(null);
  const [dismissedTokenNoticeSitewide, setDismissedTokenNoticeSitewide] = useState(false);

  const { setIntroOutro, reset, currentTime, duration } = usePlayerStore();
  const { isLoggedIn, authToken: sessionToken } = useAuthStore();
  const { getByTmdbId, updateProgress, addItem } = useWatchlistStore();
  const { febboxApiKey, introDbApiKey, disableEmbeds, customAccentHex, accentColor, idlePauseOverlay } = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const hasAnyFebboxToken = Boolean(String(febboxApiKey || '').trim());
  const effectiveFebboxToken = resolveFebboxToken(febboxApiKey);

  const currentMediaKey = `${type}-${id}`;

  const resolvedAccentHex = useMemo(() => {
    if (accentColor === 'custom') return customAccentHex || '#6366f1';
    const mapping: Record<string, string> = {
      indigo: '#6366f1',
      violet: '#8b5cf6',
      rose: '#f43f5e',
      emerald: '#10b981',
      amber: '#f59e0b',
      cyan: '#06b6d4',
    };
    return mapping[accentColor] || '#6366f1';
  }, [accentColor, customAccentHex]);

  // Prevent duplicate loading
  const loadingRef = useRef(false);
  const lastLoadKey = useRef('');

  const fetchSegments = useCallback(async (params: { tmdbId: string; mediaType: 'movie' | 'show'; season?: number; episode?: number }) => {
    const query = new URLSearchParams({ tmdbId: params.tmdbId, type: params.mediaType });
    if (params.mediaType === 'show') {
      query.set('season', String(params.season ?? 1));
      query.set('episode', String(params.episode ?? 1));
    }

    try {
      const response = await fetch(`/api/segments?${query.toString()}`, {
        signal: AbortSignal.timeout(9000),
        headers: introDbApiKey ? { 'x-introdb-api-key': introDbApiKey } : undefined,
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
  }, [introDbApiKey]);

  useEffect(() => {
    if (!id || !imdbId) return;
    
    let cancelled = false;
    const load = async () => {
      console.log(`[Subtitles] Requesting for ID: ${id} (IMDB: ${imdbId})`);
      
      const caps = await loadExternalCaptions({
        imdbId,
        tmdbId: id,
        mediaType: type as 'movie' | 'show',
        season: seasonNum,
        episode: episodeNum,
      });

      if (!cancelled) {
        if (caps.length > 0) {
          console.log(`[Subtitles] SUCCESS: Found ${caps.length} tracks`);
        } else {
          console.warn(`[Subtitles] EMPTY: No tracks returned from API`);
        }
        setExternalCaptions(caps);
        
        // CRITICAL: Also update the current stream's captions if a stream is already active
        setStream(prev => {
          if (!prev) return null;
          return withMergedCaptions(prev, caps);
        });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id, type, seasonNum, episodeNum, imdbId]);

  const loadMedia = useCallback(async () => {
    const loadKey = `${type}-${id}-${seasonNum}-${episodeNum}`;
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

    try {
      let mediaData: Movie | Show | null = null;
      let extImdbId: string | undefined;

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

        const seg = await fetchSegments({ tmdbId: id, mediaType: 'movie' });
        setSegments(seg);
        setIntroOutro({
          introStart: seg.intro?.[0]?.startMs != null ? seg.intro[0].startMs / 1000 : undefined,
          introEnd: seg.intro?.[0]?.endMs != null ? seg.intro[0].endMs / 1000 : undefined,
          outroStart: seg.credits?.[0]?.startMs != null ? seg.credits[0].startMs / 1000 : undefined,
          outroEnd: seg.credits?.[0]?.endMs != null ? seg.credits[0].endMs / 1000 : undefined,
        });

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
        const seasonData = await getSeasonDetails(id, seasonNum);
        setSeason(seasonData);
        const ep = seasonData.episodes?.find((e) => e.episodeNumber === episodeNum);
        setCurrentEpisode(ep || null);

        const seg = await fetchSegments({ tmdbId: id, mediaType: 'show', season: seasonNum, episode: episodeNum });
        setSegments(seg);
        setIntroOutro({
          introStart: seg.intro?.[0]?.startMs != null ? seg.intro[0].startMs / 1000 : undefined,
          introEnd: seg.intro?.[0]?.endMs != null ? seg.intro[0].endMs / 1000 : undefined,
          outroStart: seg.credits?.[0]?.startMs != null ? seg.credits[0].startMs / 1000 : undefined,
          outroEnd: seg.credits?.[0]?.endMs != null ? seg.credits[0].endMs / 1000 : undefined,
        });

      }

      // Auto-scrape
      if (mediaData) {
        setScrapeStatus('loading');

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
        });

        // Filter out embeds if settings forbid them, but KEEP integrated providers (direct streams)
        const filteredResults = disableEmbeds 
          ? results.filter(r => r.stream.type !== 'embed')
          : results;

        if (filteredResults.length > 0) {
          setSourceResults(filteredResults);

          // Sort results by rank (descending)
          const sortedResults = [...filteredResults].sort((a, b) => {
            const rankA = SOURCES.find(s => s.id === a.sourceId)?.rank || 0;
            const rankB = SOURCES.find(s => s.id === b.sourceId)?.rank || 0;
            return rankB - rankA;
          });

          // Find the highest ranked available source that is NOT an embed
          const bestDirect = sortedResults.find(r => r.stream.type !== 'embed');
          const bestDirectIdx = bestDirect ? filteredResults.indexOf(bestDirect) : -1;

          if (bestDirectIdx !== -1) {
            setSourceIndex(bestDirectIdx);
            setStream(withMergedCaptions(filteredResults[bestDirectIdx].stream, externalCaptions));
            setScrapeStatus('success');
          } else {
            // We have sources but they are all embeds
            setScrapeStatus('success');
          }
        } else {
          setScrapeStatus('error');
        }      }
    } catch (err) {
      console.error('Failed to load media:', err);
      setScrapeStatus('error');
    } finally {
      loadingRef.current = false;
    }
  }, [type, id, seasonNum, episodeNum, effectiveFebboxToken, fetchSegments, setIntroOutro, sessionToken, resolvedAccentHex, idlePauseOverlay, disableEmbeds, updateSettings, reset, getByTmdbId, externalCaptions]);

  useEffect(() => {
    if (!duration || duration < 30 || !currentTime || !media) return;
    const item = getByTmdbId(id);

    const percent = Math.max(0, Math.min(100, (currentTime / duration) * 100));
    if (percent < 0.5) return;

    const now = Date.now();
    const second = Math.floor(currentTime);
    const key = `${id}:${type}:${seasonNum}:${episodeNum}`;
    const last = lastProgressSyncRef.current;

    if (last.key !== key) {
      lastProgressSyncRef.current = { wallTime: 0, percent: 0, second: 0, key };
    } else {
      const movedEnoughInTime = Math.abs(second - last.second) >= 10;
      const movedEnoughInPercent = Math.abs(percent - last.percent) >= 1.5;
      const enoughWallTime = now - last.wallTime >= 8_000;

      if (!(enoughWallTime && (movedEnoughInTime || movedEnoughInPercent))) {
        return;
      }
    }

    lastProgressSyncRef.current = {
      wallTime: now,
      percent,
      second,
      key,
    };

    updateProgress(item?.id || '', {
      season: type === 'show' ? seasonNum : undefined,
      episode: type === 'show' ? episodeNum : undefined,
      timestamp: Math.floor(currentTime),
      percentage: percent,
    }, {
      tmdbId: id,
      mediaType: type as 'movie' | 'show',
      title: media.title,
      posterPath: media.posterPath,
    });
  }, [currentTime, duration, id, type, seasonNum, episodeNum, getByTmdbId, updateProgress, media]);

  useEffect(() => {
    loadMedia();
    return () => reset();
  }, [loadMedia, reset]);

  useEffect(() => {
    try {
      setDismissedTokenNoticeSitewide(window.localStorage.getItem(FEBBOX_NOTICE_SITEWIDE_DISMISS_KEY) === '1');
    } catch {
      setDismissedTokenNoticeSitewide(false);
    }
  }, []);

  useEffect(() => {
    setDismissedTokenNoticeMediaKey((prev) => (prev === currentMediaKey ? prev : null));
  }, [currentMediaKey]);

  const navigateEpisode = (s: number, e: number) => {
    router.push(`/watch/show/${id}?s=${s}&e=${e}`);
  };

  const tryNextSource = useCallback(() => {
    if (sourceResults.length < 2) return;
    const next = (sourceIndex + 1) % sourceResults.length;
    const currentStream = sourceResults[next].stream;
    setSourceIndex(next);
    // Inject external captions directly into the stream object
    setStream(withMergedCaptions(currentStream, externalCaptions));
  }, [sourceIndex, sourceResults, externalCaptions]);

  const selectSource = useCallback((idx: number) => {
    if (idx < 0 || idx >= sourceResults.length) return;
    const currentStream = sourceResults[idx].stream;
    setSourceIndex(idx);
    // Inject external captions directly into the stream object
    setStream(withMergedCaptions(currentStream, externalCaptions));
  }, [sourceResults, externalCaptions]);

  const applyPublicFebboxToken = useCallback(() => {
    if (!isLoggedIn) {
      toast('Sign in to use the public FebBox token', 'info');
      router.push('/login');
      return;
    }
    if (isPublicFebboxToken(febboxApiKey)) return;
    setDismissedTokenNoticeMediaKey(currentMediaKey);
    setScrapeStatus('loading');
    updateSettings({ febboxApiKey: PUBLIC_FEBBOX_TOKEN_PLACEHOLDER });
  }, [isLoggedIn, febboxApiKey, currentMediaKey, updateSettings, router]);

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

  const shouldShowMissingFebboxTokenPrompt = scrapeStatus === 'error' && !stream && !hasAnyFebboxToken;
  const shouldShowPersistentTokenNotice = !hasAnyFebboxToken && !dismissedTokenNoticeSitewide && dismissedTokenNoticeMediaKey !== currentMediaKey;

  const getTitle = () => media?.title || '';
  const getSubtitle = () => {
    if (type === 'show' && currentEpisode) {
      return `S${seasonNum}:E${episodeNum} - ${currentEpisode.name}`;
    }
    return '';
  };

  return (
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
        scrapeErrorTitle={shouldShowMissingFebboxTokenPrompt ? 'No FebBox token configured' : undefined}
        scrapeErrorDescription={shouldShowMissingFebboxTokenPrompt ? 'Add your own token in settings, or sign in to use the public token.' : undefined}
        scrapeErrorActionLabel={shouldShowMissingFebboxTokenPrompt ? (isLoggedIn ? 'Use public FebBox token' : 'Sign in to use public token') : undefined}
        onScrapeErrorAction={shouldShowMissingFebboxTokenPrompt ? (isLoggedIn ? applyPublicFebboxToken : (() => router.push('/login'))) : undefined}
        showTokenNotice={shouldShowPersistentTokenNotice}
        tokenNoticeText={shouldShowPersistentTokenNotice ? 'No personal FebBox token is set in settings. Add your own token, or sign in to use the public token.' : undefined}
        tokenNoticeActionLabel={shouldShowPersistentTokenNotice ? (isLoggedIn ? 'Use public FebBox token' : 'Sign in') : undefined}
        onTokenNoticeAction={shouldShowPersistentTokenNotice ? (isLoggedIn ? applyPublicFebboxToken : (() => router.push('/login'))) : undefined}
        tokenNoticeSettingsLabel={shouldShowPersistentTokenNotice ? 'Open settings' : undefined}
        onTokenNoticeSettings={shouldShowPersistentTokenNotice ? openSettings : undefined}
        tokenNoticeDismissLabel={shouldShowPersistentTokenNotice ? 'Dismiss for this title' : undefined}
        onTokenNoticeDismiss={shouldShowPersistentTokenNotice ? dismissTokenNoticeForCurrentMedia : undefined}
        tokenNoticePermanentDismissLabel={shouldShowPersistentTokenNotice ? 'Dismiss sitewide' : undefined}
        tokenNoticePermanentDismissHint={shouldShowPersistentTokenNotice ? 'Not recommended' : undefined}
        onTokenNoticePermanentDismiss={shouldShowPersistentTokenNotice ? dismissTokenNoticeSitewide : undefined}
        initialSeekTime={resumeTime > 0 ? resumeTime : 0}
      />
    </div>
  );
}
