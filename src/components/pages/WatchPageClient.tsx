/* ============================================
   Watch Page – Full-screen player with auto-play
   ============================================ */

'use client';

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
import { useBlockedContentStore } from '@/stores/blockedContent';
import type { Caption, Episode, Movie, Season, Show, SourceResult, Stream } from '@/types';
import { formatTime } from '@/lib/utils';
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

export default function WatchPageClient({ initialMedia }: { initialMedia?: Movie | Show | null }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isBlocked, isLoaded } = useBlockedContentStore();

  const type = params?.type as string;
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

  const lastProgressSyncRef = useRef<{ wallTime: number; percent: number; second: number; key: string }>({
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
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [externalCaptions, setExternalCaptions] = useState<Caption[]>([]);
  const memoizedExternalCaptions = useMemo(() => externalCaptions, [externalCaptions]);

  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumeData, setResumeData] = useState<{ percentage: number; timestamp: number } | null>(null);
  const [resumeType, setResumeType] = useState<'low' | 'high' | null>(null);
  const [appliedSeekTime, setAppliedSeekTime] = useState(resumeTimeFromUrl);

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

  const proceedWithScrape = useCallback(async (seekTime?: number) => {
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
          outroStart: seg.credits?.[0]?.startMs != null ? seg.credits[0].startMs / 1000 : undefined,
          outroEnd: seg.credits?.[0]?.endMs != null ? seg.credits[0].endMs / 1000 : undefined,
        });

      } else {
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

        const filteredResults = disableEmbeds
          ? results.filter(r => r.stream.type !== 'embed')
          : results;

        if (filteredResults.length > 0) {
          setSourceResults(filteredResults);
          const sortedResults = [...filteredResults].sort((a, b) => {
            const rankA = SOURCES.find(s => s.id === a.sourceId)?.rank || 0;
            const rankB = SOURCES.find(s => s.id === b.sourceId)?.rank || 0;
            return rankB - rankA;
          });

          const bestDirect = sortedResults.find(r => r.stream.type !== 'embed');
          const bestDirectIdx = bestDirect ? filteredResults.indexOf(bestDirect) : -1;

          if (bestDirectIdx !== -1) {
            setSourceIndex(bestDirectIdx);
            setStream(withMergedCaptions(filteredResults[bestDirectIdx].stream, externalCaptions));
            setScrapeStatus('success');
          } else {
            setScrapeStatus('success');
          }
        } else {
          setScrapeStatus('error');
        }
      }
    } catch (err) {
      console.error('Failed to load media:', err);
      setScrapeStatus('error');
    }
  }, [type, id, seasonNum, episodeNum, media, imdbId, effectiveFebboxToken, fetchSegments, sessionToken, resolvedAccentHex, idlePauseOverlay, disableEmbeds, externalCaptions, setIntroOutro]);

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
    setShowResumeOverlay(false);
    setAppliedSeekTime(resumeTimeFromUrl);

    try {
      const item = getByTmdbId(id);
      const prog = item?.progress;

      // Strict comparison for type and ID
      const isSameType = item?.mediaType === type;
      const isSameId = String(item?.tmdbId) === String(id);
      const isSameEpisode = type === 'movie' || (prog?.season === seasonNum && prog?.episode === episodeNum);
      const hasMeaningfulProgress = isSameType && isSameId && isSameEpisode && prog?.percentage;

      if (hasMeaningfulProgress) {
        if (prog.percentage > 90) {
          setResumeData({ percentage: prog.percentage, timestamp: prog.timestamp || 0 });
          setResumeType('high');
          setShowResumeOverlay(true);
          loadingRef.current = false;
          return;
        }
        if (prog.percentage > 1 && prog.percentage < 10) {
          setResumeData({ percentage: prog.percentage, timestamp: prog.timestamp || 0 });
          setResumeType('low');
          setShowResumeOverlay(true);
          loadingRef.current = false;
          return;
        }
      }

      await proceedWithScrape();
    } catch (err) {
      console.error('Failed to load media:', err);
      setScrapeStatus('error');
    } finally {
      loadingRef.current = false;
    }
  }, [type, id, seasonNum, episodeNum, getByTmdbId, reset, proceedWithScrape, resumeTimeFromUrl]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    if (!id || !imdbId) return;

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
        setStream(prev => {
          if (!prev) return null;
          return withMergedCaptions(prev, caps);
        });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id, imdbId, type, seasonNum, episodeNum]);

  useEffect(() => {
    loadMedia();
    return () => reset();
  }, [loadMedia, reset]);

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
      const movedEnoughInTime = Math.abs(second - last.second) >= 30;
      const movedEnoughInPercent = Math.abs(percent - last.percent) >= 3.0;
      const enoughWallTime = now - last.wallTime >= 25_000;

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
    setStream(withMergedCaptions(currentStream, externalCaptions));
  }, [sourceIndex, sourceResults, externalCaptions]);

  const selectSource = useCallback((idx: number) => {
    if (idx < 0 || idx >= sourceResults.length) return;
    const currentStream = sourceResults[idx].stream;
    setSourceIndex(idx);
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

  const handleResumeChoice = (choice: 'watch' | 'rewatch' | 'next') => {
    setShowResumeOverlay(false);
    if (choice === 'next') {
      const nextEpNum = episodeNum + 1;
      router.push(`/watch/show/${id}?s=${seasonNum}&e=${nextEpNum}`);
      return;
    }
    const seekTime = choice === 'rewatch' ? 0.1 : (resumeData?.timestamp || 0);
    proceedWithScrape(seekTime);
  };

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
        initialSeekTime={appliedSeekTime}
      />

      {showResumeOverlay && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl animate-fade-in">
          <div className="max-w-md px-4 text-center sm:max-w-lg sm:px-8 animate-scale-in">
            {resumeType === 'high' ? (
              <>
                <div className="mb-4 flex justify-center">
                  <div className="h-12 w-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent animate-pulse shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                </div>
                <h2 className="text-xl font-black text-white tracking-tighter mb-1 uppercase italic">You're almost done</h2>
                <p className="text-white/50 text-xs font-medium leading-relaxed mb-4 px-4">
                  You've watched <span className="text-accent font-bold">{Math.round(resumeData?.percentage || 0)}%</span> of this {type === 'movie' ? 'movie' : 'episode'}.
                </p>

                <div className="flex flex-col gap-2 w-full max-w-[320px] mx-auto">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleResumeChoice('watch')}
                      className="btn-accent !py-2.5 !rounded-xl justify-center text-[10px] font-black uppercase tracking-widest w-full"
                    >
                      Watch ({Math.round(resumeData?.percentage || 0)}%)
                    </button>
                    <button
                      onClick={() => handleResumeChoice('rewatch')}
                      className="btn-glass !py-2.5 !rounded-xl justify-center text-[10px] font-black uppercase tracking-widest w-full"
                    >
                      Rewatch
                    </button>
                  </div>

                  {type === 'show' && (
                    <button
                      onClick={() => handleResumeChoice('next')}
                      className="btn-glass !bg-accent/10 !border-accent/20 !text-accent !py-2.5 !rounded-xl justify-center text-[10px] font-black uppercase tracking-widest w-full hover:!bg-accent/20"
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
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"/><path d="M12 6v6l4 2"/></svg>
                  </div>
                </div>
                <h2 className="text-xl font-black text-white tracking-tighter mb-1 uppercase italic">Welcome back</h2>
                <p className="text-white/50 text-xs font-medium leading-relaxed mb-4 px-4">
                  You're just getting started. Resume from where you left off or start over.
                </p>

                <div className="grid grid-cols-2 gap-2 w-full max-w-[320px] mx-auto">
                  <button
                    onClick={() => handleResumeChoice('watch')}
                    className="btn-accent !py-2.5 !rounded-xl justify-center text-[10px] font-black uppercase tracking-widest w-full"
                  >
                    Resume ({formatTime(resumeData?.timestamp || 0)})
                  </button>
                  <button
                    onClick={() => handleResumeChoice('rewatch')}
                    className="btn-glass !py-2.5 !rounded-xl justify-center text-[10px] font-black uppercase tracking-widest w-full"
                  >
                    Start Over
                  </button>
                </div>
              </>
            )}

            <button
              onClick={() => { setShowResumeOverlay(false); router.back(); }}
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
