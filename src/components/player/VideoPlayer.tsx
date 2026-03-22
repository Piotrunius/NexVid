/* ============================================
  NexVid Video Player
   Full-featured player with HLS.js, playback
   speed, PiP, captions, quality selection,
   timeline segments (TIDB), etc.
   ============================================ */

'use client';

import { toast } from '@/components/ui/Toaster';
import { createWatchParty, joinWatchParty, leaveWatchParty, loadWatchPartyState, reportPlayerError, reportPlayerSuccess, updateWatchPartyState, type WatchPartyPlaybackState, type WatchPartyRole } from '@/lib/cloudSync';
import { isPublicFebboxToken, PUBLIC_FEBBOX_TOKEN_PLACEHOLDER } from '@/lib/febbox';
import type { MediaSegments } from '@/lib/tidb';
import { submitSegment } from '@/lib/tidb';
import { getSeasonDetails } from '@/lib/tmdb';
import { cn, formatTime, getQualityLabel } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useWatchlistStore } from '@/stores/watchlist';
import type { AudioTrack, Caption, Episode, Movie, Season, Show, SourceResult, Stream, StreamQuality, WatchlistStatus } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface PlayerProps {
  stream: Stream | null;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  media?: Movie | Show | null;
  season?: Season | null;
  seasonNum?: number;
  episodeNum?: number;
  mediaType?: 'movie' | 'show';
  onNavigateEpisode?: (season: number, episode: number) => void;
  scrapeStatus?: 'idle' | 'loading' | 'success' | 'error';
  segments?: MediaSegments | null;
  tmdbId?: string;
  sourceLabel?: string;
  canTryNextSource?: boolean;
  onTryNextSource?: () => void;
  allSourceResults?: SourceResult[];
  currentSourceIndex?: number;
  onSelectSource?: (index: number) => void;
  scrapeErrorTitle?: string;
  scrapeErrorDescription?: string;
  scrapeErrorActionLabel?: string;
  onScrapeErrorAction?: () => void;
  showTokenNotice?: boolean;
  tokenNoticeText?: string;
  tokenNoticeActionLabel?: string;
  onTokenNoticeAction?: () => void;
  tokenNoticeSettingsLabel?: string;
  onTokenNoticeSettings?: () => void;
  tokenNoticeDismissLabel?: string;
  onTokenNoticeDismiss?: () => void;
  tokenNoticePermanentDismissLabel?: string;
  tokenNoticePermanentDismissHint?: string;
  onTokenNoticePermanentDismiss?: () => void;
  fullViewport?: boolean;
  initialSeekTime?: number;
  externalCaptions?: Caption[];
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SUB_DELAY_MIN_MS = -10000;
const SUB_DELAY_MAX_MS = 10000;
const KNOWN_SOURCE_ORDER = ['febbox', 'vixsrc', 'vidlink'] as const;
const SUBTITLE_APPEARANCE_CACHE_KEY = 'nexvid-subtitle-appearance';
const PAUSE_IDLE_OVERLAY_MS = 10000;

type NormalizedQualityEntry = {
  quality: StreamQuality;
  url: string;
  sourceKey: string;
};

function normalizeQualityKey(raw: string): StreamQuality | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value === '4k' || value === '2160' || value.includes('2160')) return '4k';
  if (value === '2k' || value === '1440' || value.includes('1440')) return '2k';
  if (value === '1080' || value.includes('1080')) return '1080';
  if (value === '720' || value.includes('720')) return '720';
  if (value === '480' || value.includes('480')) return '480';
  if (value === '360' || value.includes('360')) return '360';
  if (value === 'unknown' || value === 'original' || value === 'orig' || value === 'source' || value === 'auto') return 'unknown';
  return null;
}

function getQualitySortWeight(quality: StreamQuality): number {
  if (quality === '4k') return 0;
  if (quality === '2k') return 1;
  if (quality === '1080') return 2;
  if (quality === '720') return 3;
  if (quality === '480') return 4;
  if (quality === '360') return 5;
  return 6;
}

function getNormalizedQualityEntries(qualities: Record<string, { url: string } | undefined>): NormalizedQualityEntry[] {
  const bestByQuality = new Map<StreamQuality, NormalizedQualityEntry>();

  for (const [key, file] of Object.entries(qualities || {})) {
    const quality = normalizeQualityKey(key);
    if (!quality || !file?.url) continue;
    if (!bestByQuality.has(quality)) {
      bestByQuality.set(quality, { quality, url: file.url, sourceKey: key });
    }
  }

  return Array.from(bestByQuality.values()).sort((a, b) => getQualitySortWeight(a.quality) - getQualitySortWeight(b.quality));
}

function getPreferredManualQuality(entries: NormalizedQualityEntry[], preferred: StreamQuality): StreamQuality | null {
  if (entries.some((entry) => entry.quality === preferred)) return preferred;
  const fallbackOrder: StreamQuality[] = ['2k', '1080', '720', '480', '360', '4k', 'unknown'];
  return fallbackOrder.find((quality) => entries.some((entry) => entry.quality === quality)) || null;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  pl: 'Polski',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  el: 'Ελληνικά',
  fa: 'فارسی',
  he: 'עברית',
  nl: 'Nederlands',
  tr: 'Türkçe',
  ru: 'Русский',
  uk: 'Українська',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  sr: 'Српски',
  hr: 'Hrvatski',
  da: 'Dansk',
  fi: 'Suomi',
  sv: 'Svenska',
  no: 'Norsk',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  ar: 'العربية',
  hi: 'हिन्दी',
  sq: 'Shqip',
  bn: 'বাংলা',
  et: 'Eesti',
  km: 'ភាសាខ្មែร',
  mk: 'Македонски',
  ms: 'Bahasa Melayu',
  sl: 'Slovenščina',
  ea: 'Español (Latino)',
  ca: 'Català',
  gl: 'Galego',
  eu: 'Euskara',
  ml: 'മലയാളം',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  mr: 'मराठी',
  gu: 'ગુજરાતી',
  pa: 'ਪੰਜਾਬੀ',
  ur: 'اردو',
  si: 'සිංහල',
  ka: 'ქართული',
  hy: 'Հայերեն',
  az: 'Azərbaycan',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  is: 'Íslenska',
  be: 'Беларуская',
  kk: 'Қазақ тілі',
  uz: 'Oʻzbek',
  mn: 'Монгол',
  af: 'Afrikaans',
  sw: 'Kiswahili',
  am: 'አማርኛ',
  tl: 'Tagalog',
  my: 'မြန်မာဘာသာ',
  lo: 'ພາសាລາວ',
  bs: 'Bosanski',
  cy: 'Cymraeg',
  ga: 'Gaeilge',
  mt: 'Malti',
};

const FLAG_BY_LANG: Record<string, string> = {
  en: '🇬🇧',
  pl: '🇵🇱',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  pt: '🇵🇹',
  el: '🇬🇷',
  fa: '🇮🇷',
  he: '🇮🇱',
  nl: '🇳🇱',
  tr: '🇹🇷',
  ru: '🇷🇺',
  uk: '🇺🇦',
  cs: '🇨🇿',
  sk: '🇸🇰',
  hu: '🇭🇺',
  ro: '🇷🇴',
  bg: '🇧🇬',
  sr: '🇷🇸',
  hr: '🇭🇷',
  da: '🇩🇰',
  fi: '🇫🇮',
  sv: '🇸🇪',
  no: '🇳🇴',
  id: '🇮🇩',
  vi: '🇻🇳',
  th: '🇹🇭',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
  ar: '🇸🇦',
  hi: '🇮🇳',
  sq: '🇦🇱',
  bn: '🇧🇩',
  et: '🇪🇪',
  km: '🇰🇭',
  mk: '🇲🇰',
  ms: '🇲🇾',
  sl: '🇸🇮',
  ea: '🇲🇽',
  ca: '🇦🇩',
  gl: '🇪🇸',
  eu: '🇪🇸',
  ml: '🇮🇳',
  ta: '🇮🇳',
  te: '🇮🇳',
  kn: '🇮🇳',
  mr: '🇮🇳',
  gu: '🇮🇳',
  pa: '🇮🇳',
  ur: '🇵🇰',
  si: '🇱🇰',
  ka: '🇬🇪',
  hy: '🇦🇲',
  az: '🇦🇿',
  lt: '🇱🇹',
  lv: '🇱🇻',
  is: '🇮🇸',
  be: '🇧🇾',
  kk: '🇰🇿',
  uz: '🇺🇿',
  mn: '🇲🇳',
  af: '🇿🇦',
  sw: '🇰🇪',
  am: '🇪🇹',
  tl: '🇵🇭',
  my: '🇲🇲',
  lo: '🇱🇦',
  bs: '🇧🇦',
  cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  ga: '🇮🇪',
  mt: '🇲🇹',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  pb: 'pt',
  br: 'pt',
  'ptbr': 'pt',
  por: 'pt',
  eng: 'en',
  gb: 'en',
  us: 'en',
  ell: 'el',
  gre: 'el',
  per: 'fa',
  farsi: 'fa',
  he: 'he',
  iw: 'he',
  heb: 'he',
  jp: 'ja',
  jpn: 'ja',
  kr: 'ko',
  kor: 'ko',
  ua: 'uk',
  ukr: 'uk',
  zhcn: 'zh',
  zhtw: 'zh',
};

function normalizeLanguageCode(input: string): string {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'unknown';
  const raw = value.includes('-')
    ? value.split('-')[0]
    : value.includes('_')
      ? value.split('_')[0]
      : value;
  const compact = raw.replace(/[^a-z]/g, '');
  const alias = LANGUAGE_ALIASES[compact] || LANGUAGE_ALIASES[raw];
  if (alias) return alias;
  if (raw.length <= 3) return raw;
  const found = Object.entries(LANGUAGE_LABELS).find(([, label]) => label.toLowerCase() === value);
  return found?.[0] || value;
}

function languageLabel(input: string): string {
  const code = normalizeLanguageCode(input);
  return LANGUAGE_LABELS[code] || input || 'Unknown';
}

function languageFlag(input: string): string {
  const code = normalizeLanguageCode(input);
  return FLAG_BY_LANG[code] || '🏳️';
}

function convertSrtToVtt(text: string): string {
  const normalized = text.replace(/\r/g, '').replace(/^﻿/, '');
  if (normalized.startsWith('WEBVTT')) return normalized;
  const body = normalized
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/(\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/\{\\an\d\}/g, '');
  return `WEBVTT\n\n${body}`;
}

export function VideoPlayer({ stream, onBack, title, subtitle, media, season, seasonNum = 1, episodeNum = 1, mediaType, onNavigateEpisode, scrapeStatus, segments, tmdbId, sourceLabel, canTryNextSource, onTryNextSource, allSourceResults, currentSourceIndex: propSourceIndex, onSelectSource, scrapeErrorTitle, scrapeErrorDescription, scrapeErrorActionLabel, onScrapeErrorAction, showTokenNotice, tokenNoticeText, tokenNoticeActionLabel, onTokenNoticeAction, tokenNoticeSettingsLabel, onTokenNoticeSettings, tokenNoticeDismissLabel, onTokenNoticeDismiss, tokenNoticePermanentDismissLabel, tokenNoticePermanentDismissHint, onTokenNoticePermanentDismiss, fullViewport = false, initialSeekTime = 0, externalCaptions = [] }: PlayerProps) {
  const WATCH_PARTY_CODE_KEY = 'nexvid-watch-party-code';

  const videoRef = useRef<HTMLVideoElement>(null);
  const hasReportedSuccessRef = useRef(false);
  const externalAudioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const {
    isPlaying, currentTime, duration, buffered, volume, isMuted,
    isFullscreen, isLoading, error, currentQuality, availableQualities,
    captions, activeCaption, introOutro, showSkipIntro, showSkipOutro,
    controlsVisible, audioTracks, activeAudioTrack,
    setPlaying, setCurrentTime, setDuration, setBuffered, setVolume,
    toggleMute, setFullscreen, setLoading, setError, setQuality,
    setCaptions, setActiveCaption, setStream, showControls, hideControls,
    setAudioTracks, setActiveAudioTrack,
  } = usePlayerStore();

  const isLoadingRef = useRef(isLoading);
  const errorRef = useRef(error);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { errorRef.current = error; }, [error]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Handle VidLink messages
      if (event.origin === 'https://vidlink.pro') {
        if (event.data?.type === 'PLAYER_EVENT') {
          const { currentTime: time, duration: dur } = event.data.data;
          if (time && dur) {
            setCurrentTime(time);
            setDuration(dur);
          }
        }
        if (event.data?.type === 'MEDIA_DATA') {
          const { progress } = event.data.data;
          if (progress?.watched && progress?.duration) {
            setCurrentTime(progress.watched);
            setDuration(progress.duration);
          }
        }
      }

      // Handle Videasy messages
      if (event.origin === 'https://player.videasy.net') {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          // Videasy sends: { progress, timestamp, duration, ... }
          if (data && typeof data.timestamp === 'number' && typeof data.duration === 'number') {
            setCurrentTime(data.timestamp);
            setDuration(data.duration);
          }
        } catch {
          // ignore malformed JSON
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setCurrentTime, setDuration]);

  const { skipIntro, skipOutro, autoSkipSegments, autoSwitchSource, autoPlay, autoNext, idlePauseOverlay, playerVolume, introDbApiKey, defaultQuality, subtitleLanguage, febboxApiKey, disableEmbeds } = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const hasAnyFebboxToken = Boolean(String(febboxApiKey || '').trim());
  const effectiveShowTokenNotice = typeof showTokenNotice === 'boolean' ? showTokenNotice : !hasAnyFebboxToken;
  const effectiveTokenNoticeText = tokenNoticeText || 'No own FebBox token configured. Playback may still work, but often with much worse quality and stability.';
  const effectiveTokenNoticeActionLabel = tokenNoticeActionLabel || (isPublicFebboxToken(febboxApiKey) ? undefined : 'Use public token now');
  const effectiveTokenNoticeSettingsLabel = tokenNoticeSettingsLabel || 'Settings';
  const effectiveTokenNoticeDismissLabel = tokenNoticeDismissLabel || 'Dismiss for this title';
  const handleTokenNoticeAction = onTokenNoticeAction || (!isPublicFebboxToken(febboxApiKey)
    ? () => {
        updateSettings({ febboxApiKey: PUBLIC_FEBBOX_TOKEN_PLACEHOLDER });
      }
    : undefined);

  const [settingsPanel, setSettingsPanel] = useState<'main' | 'quality' | 'speed' | 'subtitles' | 'subAppearance' | 'episodes' | 'info' | 'segments' | 'playback' | 'skip' | 'watchParty' | 'alternative' | 'sources' | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [captionTrackUrls, setCaptionTrackUrls] = useState<Record<string, string>>({});
  const [subFontSize, setSubFontSize] = useState(20);
  const [subColor, setSubColor] = useState('#ffffff');
  const [subBg, setSubBg] = useState('rgba(0,0,0,0.75)');
  const [subVertical, setSubVertical] = useState(88);
  const [subDelayMs, setSubDelayMs] = useState(0);
  const [renderedSubtitle, setRenderedSubtitle] = useState('');
  const [captionTouchedByUser, setCaptionTouchedByUser] = useState(false);
  const [submitType, setSubmitType] = useState<'intro' | 'recap' | 'credits' | 'preview'>('intro');
  const [submitStart, setSubmitStart] = useState('');
  const [submitEnd, setSubmitEnd] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [episodePanelSeason, setEpisodePanelSeason] = useState(seasonNum);
  const [episodePanelEpisodes, setEpisodePanelEpisodes] = useState<Episode[]>(season?.episodes || []);
  const [episodePanelLoading, setEpisodePanelLoading] = useState(false);
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [nextCountdown, setNextCountdown] = useState(8);
  const [embedLockState, setEmbedLockState] = useState<'locked' | 'unlocked'>('locked');
  const [externalAudioUrl, setExternalAudioUrl] = useState<string | null>(null);
  const [watchPartyRoomId, setWatchPartyRoomId] = useState('');
  const [watchPartyJoinCode, setWatchPartyJoinCode] = useState('');
  const [watchPartyRole, setWatchPartyRole] = useState<WatchPartyRole | null>(null);
  const [watchPartyHostToken, setWatchPartyHostToken] = useState('');
  const [watchPartyParticipantId, setWatchPartyParticipantId] = useState('');
  const [watchPartyStatus, setWatchPartyStatus] = useState('Not connected');
  const [watchPartySyncAt, setWatchPartySyncAt] = useState('');
  const [watchPartyGuestPollMs, setWatchPartyGuestPollMs] = useState(10000);
  const [watchPartyBusy, setWatchPartyBusy] = useState(false);
  const [watchPartyForceSyncUntil, setWatchPartyForceSyncUntil] = useState(0);
  const [watchPartyNowTs, setWatchPartyNowTs] = useState(0);
  const [watchPartyServerDiff, setWatchPartyServerDiff] = useState(0);
  const [watchPartyLastSyncTs, setWatchPartyLastSyncTs] = useState(0);
  const [showInfoWatchlistMenu, setShowInfoWatchlistMenu] = useState(false);
  const [isEpisodeNavigating, setIsEpisodeNavigating] = useState(false);
  const [showIdlePauseOverlay, setShowIdlePauseOverlay] = useState(false);
  const [isEmbedNoticeDismissed, setIsEmbedNoticeDismissed] = useState(false);
  const [idleSnapshot, setIdleSnapshot] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const nextPromptDismissedForRef = useRef<string | null>(null);
  const nextPromptHandledForRef = useRef<string | null>(null);
  const lastAutoSkippedSegmentRef = useRef('');
  const lastAutoSkipAtRef = useRef(0);
  const lastInteractionAtRef = useRef(Date.now());
  const attemptedAutoPlayRef = useRef(false);
  const lastProgressSaveRef = useRef(0);
  const targetTimeRef = useRef<number | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const watchPartyApplyingRemoteRef = useRef(false);
  const watchPartyLastHostPushMsRef = useRef(0);
  const watchPartyAutoJoinAttemptedRef = useRef(false);
  const watchPartyForcePausedRef = useRef(false);
  const hlsAutoSwitchAttemptedRef = useRef(false);
  const autoSourceSwitchAttemptedRef = useRef(false);
  const autoSourceTimeoutRef = useRef<number | null>(null);
  const username = useAuthStore((s) => s.user?.username) || 'Guest';
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const sessionToken = useAuthStore((s) => s.authToken);
  const { addItem, getByTmdbId, setStatus: setWatchlistStatus } = useWatchlistStore();

  const mediaTmdbId = tmdbId || (media?.id ? String(media.id) : '');
  const infoWatchlistItem = mediaTmdbId ? getByTmdbId(mediaTmdbId) : undefined;
  const watchPartyForceSyncCooldownSec = Math.max(0, Math.ceil((watchPartyForceSyncUntil - watchPartyNowTs) / 1000));
  const currentEpisodeInfo = mediaType === 'show'
    ? (season?.episodes || []).find((ep) => ep.episodeNumber === episodeNum) || null
    : null;
  const infoSummaryText = mediaType === 'show'
    ? (currentEpisodeInfo?.overview || media?.overview || '')
    : (media?.overview || '');

  const normalizedFileQualities = useMemo(() => {
    if (!stream || stream.type !== 'file') return [] as NormalizedQualityEntry[];
    return getNormalizedQualityEntries(stream.qualities as Record<string, { url: string } | undefined>);
  }, [stream]);

  const watchPartyMediaKey = useMemo(() => {
    const normalizedType = mediaType === 'show' ? 'show' : 'movie';
    const baseId = tmdbId || media?.id || title || 'unknown';
    if (normalizedType === 'show') {
      return `${normalizedType}:${baseId}:s${seasonNum}:e${episodeNum}`;
    }
    return `${normalizedType}:${baseId}`;
  }, [mediaType, tmdbId, media?.id, title, seasonNum, episodeNum]);

  const sourceResults = allSourceResults || [];
  const safeSourceResults = allSourceResults ?? sourceResults;
  const currentSourceIndex = Math.max(0, Math.min(typeof propSourceIndex === 'number' ? propSourceIndex : 0, Math.max(sourceResults.length - 1, 0)));

  const formatSourceName = useCallback((sourceId?: string) => {
    if (!sourceId) return 'Source';
    if (sourceId === 'vixsrc') return 'VixSrc';
    if (sourceId === 'febbox') return 'FebBox';
    if (sourceId === 'videasy') return 'Videasy';
    if (sourceId === 'vidlink') return 'VidLink';
    return sourceId;
  }, []);

  const sourceCatalog = useMemo(() => {
    const catalog: Array<{ id: string; name: string; resultIndex: number; available: boolean }> = [];
    const seen = new Set<string>();

    for (const sourceId of KNOWN_SOURCE_ORDER) {
      const resultIndex = sourceResults.findIndex((result) => result.sourceId === sourceId);
      catalog.push({
        id: sourceId,
        name: formatSourceName(sourceId),
        resultIndex,
        available: resultIndex >= 0,
      });
      seen.add(sourceId);
    }

    sourceResults.forEach((result, index) => {
      if (seen.has(result.sourceId)) return;
      catalog.push({
        id: result.sourceId,
        name: formatSourceName(result.sourceId),
        resultIndex: index,
        available: true,
      });
    });

    return catalog;
  }, [sourceResults, formatSourceName]);

  const canOpenSourceSelector = sourceCatalog.length > 0;

  const buildHlsProxyUrl = useCallback((url: string, headers?: Record<string, string>) => {
    const params = new URLSearchParams({ url });
    if (headers && typeof headers === 'object' && Object.keys(headers).length > 0) {
      params.set('headers', JSON.stringify(headers));
    }
    return `/api/hls-proxy?${params.toString()}`;
  }, []);

  const selectableQualities = useMemo(
    () => normalizedFileQualities.map((entry) => entry.quality),
    [normalizedFileQualities]
  );

  const applyFileQuality = useCallback((quality: StreamQuality, opts?: { persistDefault?: boolean }) => {
    if (!stream || stream.type !== 'file' || !videoRef.current) return;
    const target = normalizedFileQualities.find((entry) => entry.quality === quality);
    if (!target?.url) return;

    const video = videoRef.current;
    const wasPaused = video.paused;
    const atTime = video.currentTime;

    if (video.src === target.url && currentQuality === quality) return;

    video.src = target.url;
    video.currentTime = atTime;
    video.load();
    if (!wasPaused) video.play().catch(() => {});

    setQuality(quality);

    const persistDefault = opts?.persistDefault ?? true;
    if (persistDefault) {
      updateSettings({ defaultQuality: quality });
    }
  }, [stream, normalizedFileQualities, currentQuality, setQuality, updateSettings]);

  useEffect(() => {
    setEmbedLockState('locked');
  }, [stream && stream.type === 'embed' ? stream.url : null]);

  useEffect(() => {
    setEpisodePanelSeason(seasonNum);
    setEpisodePanelEpisodes(season?.episodes || []);
  }, [seasonNum, season]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cachedRaw = localStorage.getItem(SUBTITLE_APPEARANCE_CACHE_KEY);
      if (!cachedRaw) return;
      const cached = JSON.parse(cachedRaw) as {
        subFontSize?: number;
        subColor?: string;
        subBg?: string;
        subVertical?: number;
        subDelayMs?: number;
      };
      if (typeof cached.subFontSize === 'number') setSubFontSize(Math.max(14, Math.min(42, cached.subFontSize)));
      if (typeof cached.subColor === 'string') setSubColor(cached.subColor);
      if (typeof cached.subBg === 'string') setSubBg(cached.subBg);
      if (typeof cached.subVertical === 'number') setSubVertical(Math.max(65, Math.min(106, cached.subVertical)));
      if (typeof cached.subDelayMs === 'number') setSubDelayMs(Math.max(SUB_DELAY_MIN_MS, Math.min(SUB_DELAY_MAX_MS, cached.subDelayMs)));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        SUBTITLE_APPEARANCE_CACHE_KEY,
        JSON.stringify({ subFontSize, subColor, subBg, subVertical, subDelayMs })
      );
    } catch {}
  }, [subFontSize, subColor, subBg, subVertical, subDelayMs]);

  // ---- Initialize HLS / Source ----
  useEffect(() => {
    if (!stream || !videoRef.current) return;
    const video = videoRef.current;

    hlsAutoSwitchAttemptedRef.current = false;
    autoSourceSwitchAttemptedRef.current = false;
    if (autoSourceTimeoutRef.current) {
      clearTimeout(autoSourceTimeoutRef.current);
      autoSourceTimeoutRef.current = null;
    }

    attemptedAutoPlayRef.current = false;
    setCaptionTouchedByUser(false);
    setActiveCaption(null);
    setRenderedSubtitle('');
    setAudioTracks([]);
    setActiveAudioTrack(null);
    setExternalAudioUrl(null);
    setStream(stream);
    video.volume = playerVolume;
    setVolume(playerVolume);
    video.playbackRate = playbackSpeed;

    if (stream.type === 'embed') {
      // Embed streams are handled by iframe, no video setup needed
      setLoading(false);
      return;
    }

    if (autoSwitchSource && canTryNextSource && onTryNextSource) {
      autoSourceTimeoutRef.current = window.setTimeout(() => {
        if (!videoRef.current) return;
        if (autoSourceSwitchAttemptedRef.current) return;
        if (!isLoadingRef.current && !errorRef.current) return;

        autoSourceSwitchAttemptedRef.current = true;
        setError('Current source is taking too long to load. Switching to next source...');
        toast('Switching source...', 'info');
        onTryNextSource();
      }, 20000);
    }

    if (stream.type === 'hls') {
      loadHls(stream.playlist, video, stream.headers);
    } else if (stream.type === 'file') {
      const entries = getNormalizedQualityEntries(stream.qualities as Record<string, { url: string } | undefined>);
      const selected = getPreferredManualQuality(entries, defaultQuality);

      const selectedEntry = selected ? entries.find((entry) => entry.quality === selected) : null;

      if (selectedEntry?.url) {
        video.src = selectedEntry.url;
        video.load();
        setQuality(selectedEntry.quality);

        if (Array.isArray(stream.audioTracks) && stream.audioTracks.length > 0) {
          setAudioTracks(stream.audioTracks);
          const defaultTrack = stream.audioTracks.find((track) => track.isDefault) || stream.audioTracks[0];
          setActiveAudioTrack(defaultTrack?.id ?? null);
          if (defaultTrack?.url) setExternalAudioUrl(defaultTrack.url);
        }

        // Detect native audio tracks from MP4/MKV (Safari, Chrome flag)
        const detectNativeAudioTracks = () => {
          const nativeTracks = (video as any).audioTracks;
          if (nativeTracks && nativeTracks.length > 1) {
            const tracks: AudioTrack[] = [];
            for (let i = 0; i < nativeTracks.length; i++) {
              const t = nativeTracks[i];
              tracks.push({
                id: i,
                name: t.label || t.language || `Track ${i + 1}`,
                lang: t.language || '',
                isDefault: t.enabled || false,
              });
            }
            setAudioTracks(tracks);
            const activeIdx = Array.from(nativeTracks as any).findIndex((t: any) => t.enabled);
            setActiveAudioTrack(activeIdx >= 0 ? activeIdx : 0);
          }
        };
        video.addEventListener('loadedmetadata', detectNativeAudioTracks, { once: true });

        if (autoPlay && !attemptedAutoPlayRef.current) {
          attemptedAutoPlayRef.current = true;
          video.play().catch(async () => {
            const prevMuted = video.muted;
            video.muted = true;
            try {
              await video.play();
              if (!prevMuted) {
                setTimeout(() => {
                  video.muted = false;
                }, 120);
              }
            } catch {
              video.muted = prevMuted;
            }
          });
        }
      }
    }

    return () => {
      // Destroy HLS instance if present
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Pause and unload video element
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      // Pause and unload external audio element
      const audio = externalAudioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      if (autoSourceTimeoutRef.current) {
        clearTimeout(autoSourceTimeoutRef.current);
        autoSourceTimeoutRef.current = null;
      }
      setPlaying(false);
      setLoading(false);
    };
  }, [stream, defaultQuality, playerVolume, playbackSpeed, autoPlay, canTryNextSource, onTryNextSource]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = externalAudioRef.current;
    if (!video || !audio) return;

    if (stream?.type !== 'file' || !externalAudioUrl) {
      audio.pause();
      if (audio.src) {
        audio.removeAttribute('src');
        audio.load();
      }
      return;
    }

    if (audio.src !== externalAudioUrl) {
      audio.src = externalAudioUrl;
      audio.load();
      if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
        try {
          audio.currentTime = video.currentTime;
        } catch {}
      }
    }

    audio.playbackRate = video.playbackRate;
    audio.muted = isMuted;
    audio.volume = isMuted ? 0 : volume;

    if (!video.paused) {
      audio.play().catch(() => {});
    }
  }, [externalAudioUrl, stream, isMuted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = externalAudioRef.current;
    if (!video || !audio || stream?.type !== 'file' || !externalAudioUrl) return;

    const syncTime = () => {
      const drift = Math.abs((audio.currentTime || 0) - (video.currentTime || 0));
      if (drift > 0.35 && Number.isFinite(video.currentTime)) {
        try {
          audio.currentTime = video.currentTime;
        } catch {}
      }
    };

    const syncPlay = () => {
      audio.playbackRate = video.playbackRate;
      audio.muted = isMuted;
      audio.volume = isMuted ? 0 : volume;
      audio.play().catch(() => {});
    };

    const syncPause = () => {
      audio.pause();
    };

    const syncRate = () => {
      audio.playbackRate = video.playbackRate;
    };

    const syncVolume = () => {
      audio.muted = isMuted;
      audio.volume = isMuted ? 0 : volume;
    };

    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('seeked', syncTime);
    video.addEventListener('play', syncPlay);
    video.addEventListener('pause', syncPause);
    video.addEventListener('ratechange', syncRate);
    video.addEventListener('volumechange', syncVolume);

    return () => {
      video.removeEventListener('timeupdate', syncTime);
      video.removeEventListener('seeked', syncTime);
      video.removeEventListener('play', syncPlay);
      video.removeEventListener('pause', syncPause);
      video.removeEventListener('ratechange', syncRate);
      video.removeEventListener('volumechange', syncVolume);
    };
  }, [stream, externalAudioUrl, isMuted, volume]);

  useEffect(() => {
    // Sync external captions to the player store
    // We don't include 'captions' in deps to avoid infinite loops
    setCaptions(externalCaptions);
  }, [externalCaptions, setCaptions]);

  useEffect(() => {
    if (captions.length === 0) {
      setManualCues([]);
      setRenderedSubtitle('');
      if (activeCaption) setActiveCaption(null);
      return;
    }

    if (captionTouchedByUser) return;

    const preferred = normalizeLanguageCode(subtitleLanguage || 'pl');
    if (preferred === 'off') {
      if (activeCaption) setActiveCaption(null);
      return;
    }

    if (!activeCaption || !captions.some((caption) => caption.id === activeCaption)) {
      const preferredCaption = captions.find((caption) => normalizeLanguageCode(caption.language) === preferred);
      const polish = captions.find((caption) => normalizeLanguageCode(caption.language) === 'pl');
      const english = captions.find((caption) => normalizeLanguageCode(caption.language) === 'en');
      setActiveCaption((preferredCaption || polish || english || captions[0]).id);
    }
  }, [captions, activeCaption, captionTouchedByUser, subtitleLanguage]);

  const [manualCues, setManualCues] = useState<{ start: number; end: number; text: string }[]>([]);

  useEffect(() => {
    if (!activeCaption || !captions.length) {
      setManualCues([]);
      setRenderedSubtitle('');
      return;
    }

    const caption = captions.find(c => c.id === activeCaption);
    if (!caption) return;

    let cancelled = false;
    const loadManualSubs = async () => {
      try {
        const proxiedUrl = `/api/subtitle?url=${encodeURIComponent(caption.url)}`;
        const response = await fetch(proxiedUrl);
        if (!response.ok) throw new Error('Fetch failed');
        const text = await response.text();
        if (cancelled) return;

        // Simple VTT/SRT Parser
        const parseSubtitles = (rawText: string) => {
          const normalized = rawText.replace(/\r/g, '').replace(/^﻿/, '');
          const blocks = normalized.split(/\n\s*\n/);
          const result: { start: number; end: number; text: string }[] = [];

          const timeToSec = (t: string) => {
            const parts = t.trim().split(':');
            if (parts.length < 2) return 0;
            const s = parts.length === 3
              ? parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'))
              : parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
            return s;
          };

          for (const block of blocks) {
            const lines = block.trim().split('\n');
            let timeLine = '';
            const textLines: string[] = [];

            for (const line of lines) {
              if (line.includes('-->')) {
                timeLine = line;
              } else if (timeLine) {
                textLines.push(line);
              }
            }

            if (timeLine) {
              const [startStr, endStr] = timeLine.split('-->');
              const text = textLines.join('\n').replace(/<[^>]*>/g, '').trim();
              if (text) {
                result.push({
                  start: timeToSec(startStr),
                  end: timeToSec(endStr),
                  text
                });
              }
            }
          }
          return result;
        };

        setManualCues(parseSubtitles(text));
      } catch (err) {
        console.error('Manual subtitle load error:', err);
        setManualCues([]);
      }
    };

    loadManualSubs();
    return () => { cancelled = true; };
  }, [activeCaption, captions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateSubtitleText = () => {
      if (!activeCaption || manualCues.length === 0 || !videoRef.current) {
        setRenderedSubtitle('');
        return;
      }

      const shiftedTime = videoRef.current.currentTime - (subDelayMs / 1000);
      const active = manualCues.filter(c => shiftedTime >= c.start && shiftedTime <= c.end);

      const newText = active.map(a => a.text).join('\n');
      if (newText !== renderedSubtitle) {
        setRenderedSubtitle(newText);
      }
    };

    const interval = window.setInterval(updateSubtitleText, 250);
    return () => window.clearInterval(interval);
  }, [activeCaption, manualCues, subDelayMs, renderedSubtitle]);

  async function loadHls(url: string, video: HTMLVideoElement, headers?: Record<string, string>) {
    try {
      const proxiedUrl = buildHlsProxyUrl(url, headers);
      const Hls = (await import('hls.js')).default;
      if (Hls.isSupported()) {
        if (hlsRef.current) hlsRef.current.destroy();
        const hls = new Hls({
          maxBufferLength: 60,
          maxMaxBufferLength: 90,
          enableWorker: true,
          lowLatencyMode: false
        });
        hlsRef.current = hls;
        hls.loadSource(proxiedUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          if (autoPlay) video.play().catch(() => {});
          // Expose audio tracks from manifest
          if (hls.audioTracks && hls.audioTracks.length > 1) {
            const tracks = hls.audioTracks.map((t: any) => ({
              id: t.id,
              name: t.name || t.lang || `Track ${t.id}`,
              lang: t.lang || '',
              isDefault: t.default || false,
            }));
            setAudioTracks(tracks);
            setActiveAudioTrack(hls.audioTrack);
          } else {
            setAudioTracks([]);
            setActiveAudioTrack(null);
          }
        });
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_: any, data: any) => {
          setActiveAudioTrack(data.id);
        });
        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data.fatal) {
            reportPlayerError(mediaType || '', tmdbId || '', data.type, data.details || 'Fatal HLS error', false, febboxApiKey).catch(() => {});
            if (autoSwitchSource && canTryNextSource && onTryNextSource && !hlsAutoSwitchAttemptedRef.current) {
              hlsAutoSwitchAttemptedRef.current = true;
              autoSourceSwitchAttemptedRef.current = true;
              if (autoSourceTimeoutRef.current) {
                clearTimeout(autoSourceTimeoutRef.current);
                autoSourceTimeoutRef.current = null;
              }
              setError('Current source is blocked or unavailable. Switching source...');
              toast('Switching source...', 'info');
              onTryNextSource();
              return;
            }
            setError(`Playback error: ${data.type}`);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxiedUrl;
        video.addEventListener('loadedmetadata', () => {
          setLoading(false);
          if (autoPlay) video.play().catch(() => {});
        });
      }
    } catch {
      setError('Failed to load video player');
    }
  }

  const pushWatchPartyHostStateNow = useCallback(() => {
    if (watchPartyRole !== 'host' || !watchPartyRoomId || !watchPartyHostToken || !watchPartyMediaKey || !videoRef.current) return;
    if (watchPartyApplyingRemoteRef.current) return;

    const video = videoRef.current;
    watchPartyLastHostPushMsRef.current = Date.now();
    updateWatchPartyState({
      roomId: watchPartyRoomId,
      hostToken: watchPartyHostToken,
      paused: video.paused,
      time: video.currentTime,
      playbackRate: video.playbackRate,
      mediaKey: watchPartyMediaKey,
    }).catch(() => {
      setWatchPartyStatus('Sync warning: host update failed');
    });
  }, [watchPartyRole, watchPartyRoomId, watchPartyHostToken, watchPartyMediaKey]);

  // ---- Video Event Handlers ----
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  }, []);
  const handleDurationChange = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  }, []);
  const handleProgress = useCallback(() => {
    if (!videoRef.current) return;
    const buf = videoRef.current.buffered;
    if (buf.length > 0) setBuffered(buf.end(buf.length - 1));
  }, []);
  const handlePlay = useCallback(() => {
    setPlaying(true);
    if (!hasReportedSuccessRef.current) {
      hasReportedSuccessRef.current = true;
      reportPlayerSuccess(febboxApiKey).catch(() => {});
    }
    if (externalAudioRef.current && externalAudioUrl) {
      externalAudioRef.current.play().catch(() => {});
    }
    pushWatchPartyHostStateNow();
  }, [externalAudioUrl, pushWatchPartyHostStateNow]);
  const handlePause = useCallback(() => {
    setPlaying(false);
    if (externalAudioRef.current) {
      externalAudioRef.current.pause();
    }
    pushWatchPartyHostStateNow();
  }, [pushWatchPartyHostStateNow]);
  const handleWaiting = useCallback(() => {
    setLoading(true);

    if (!autoSwitchSource || !canTryNextSource || !onTryNextSource || autoSourceSwitchAttemptedRef.current) return;

    if (autoSourceTimeoutRef.current) {
      clearTimeout(autoSourceTimeoutRef.current);
      autoSourceTimeoutRef.current = null;
    }
    autoSourceTimeoutRef.current = window.setTimeout(() => {
      if (!videoRef.current) return;
      if (autoSourceSwitchAttemptedRef.current) return;
      if (!isLoadingRef.current && !errorRef.current) return;

      autoSourceSwitchAttemptedRef.current = true;
      setError('Current source is taking too long to load. Switching to next source...');
      toast('Switching source...', 'info');
      onTryNextSource();
    }, 20000);
  }, [autoSwitchSource, canTryNextSource, onTryNextSource, setError]);
  const handleCanPlay = useCallback(() => {
    if (autoSourceTimeoutRef.current) {
      clearTimeout(autoSourceTimeoutRef.current);
      autoSourceTimeoutRef.current = null;
    }
    autoSourceSwitchAttemptedRef.current = false;

    setLoading(false);
    if (videoRef.current && initialSeekTime > 1 && videoRef.current.currentTime < 1) {
      videoRef.current.currentTime = initialSeekTime;
    }
    if (watchPartyRole === 'guest' && watchPartyForcePausedRef.current && videoRef.current) {
      videoRef.current.pause();
      return;
    }
    if (autoPlay && videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(async () => {
        if (!videoRef.current) return;
        const prevMuted = videoRef.current.muted;
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
          if (!prevMuted) {
            setTimeout(() => {
              if (videoRef.current) videoRef.current.muted = isMuted;
            }, 120);
          }
        } catch {
          if (videoRef.current) videoRef.current.muted = prevMuted;
        }
      });
    }
  }, [autoPlay, initialSeekTime, isMuted, watchPartyRole]);
  const navigateNextEpisode = useCallback(() => {
    if (!onNavigateEpisode || mediaType !== 'show' || !season?.episodes?.length) return;
    const nextEpisode = season.episodes.find((ep) => ep.episodeNumber === episodeNum + 1);
    if (nextEpisode) {
      setIsEpisodeNavigating(true);
      onNavigateEpisode(seasonNum, nextEpisode.episodeNumber);
    }
  }, [onNavigateEpisode, mediaType, season, episodeNum, seasonNum]);

  const navigatePrevEpisode = useCallback(() => {
    if (!onNavigateEpisode || mediaType !== 'show' || !season?.episodes?.length || episodeNum <= 1) return;
    setIsEpisodeNavigating(true);
    onNavigateEpisode(seasonNum, episodeNum - 1);
  }, [onNavigateEpisode, mediaType, season, episodeNum, seasonNum]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setIsFinished(true);
    // Auto-next logic when video actually ends
    if (mediaType === 'show' && autoNext) {
      setTimeout(() => {
        // Only navigate if still on the end screen
        if (videoRef.current?.ended || videoRef.current?.currentTime === videoRef.current?.duration) {
          navigateNextEpisode();
        }
      }, 3000);
    }
  }, [mediaType, autoNext, navigateNextEpisode]);

  const handleError = useCallback(() => {
    setPlaying(false);
    setError('Video playback error');
    const msg = videoRef.current?.error?.message || 'Unknown video error';
    const code = String(videoRef.current?.error?.code || 'unknown');
    reportPlayerError(mediaType || '', tmdbId || '', code, msg, false, febboxApiKey).catch(() => {});

    if (!autoSwitchSource || !canTryNextSource || !onTryNextSource || autoSourceSwitchAttemptedRef.current) return;

    autoSourceSwitchAttemptedRef.current = true;
    if (autoSourceTimeoutRef.current) {
      clearTimeout(autoSourceTimeoutRef.current);
      autoSourceTimeoutRef.current = null;
    }
    setError('Current source is unavailable. Switching to next source...');
    toast('Switching source...', 'info');
    onTryNextSource();
  }, [autoSwitchSource, canTryNextSource, mediaType, onTryNextSource, tmdbId, febboxApiKey]);

  // ---- Controls ----
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, []);

  const seek = useCallback((time: number) => {
    if (!videoRef.current) return;
    const clampedTime = Math.max(0, Math.min(time, duration || 999999));

    // Update ref immediately for accumulation
    targetTimeRef.current = clampedTime;
    setCurrentTime(clampedTime); // Update UI immediately

    // Debounce the actual heavy seek operation
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);

    seekTimeoutRef.current = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = clampedTime;
        if (duration && clampedTime < duration - 1) setIsFinished(false);
      }
      if (externalAudioRef.current && externalAudioUrl) {
        try { externalAudioRef.current.currentTime = clampedTime; } catch {}
      }
      pushWatchPartyHostStateNow();
      targetTimeRef.current = null;
    }, 100);
  }, [duration, externalAudioUrl, pushWatchPartyHostStateNow, setCurrentTime]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    seek(pos * duration);
  }, [duration]);

  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    setHoverProgress(pos * duration);
  }, [duration]);

  const changeVolume = useCallback((newVol: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    videoRef.current.volume = clamped;
    if (externalAudioRef.current) {
      externalAudioRef.current.volume = clamped;
      externalAudioRef.current.muted = clamped === 0 || isMuted;
    }
    setVolume(clamped);
  }, [isMuted]);

  const promptKey = `${seasonNum}-${episodeNum}`;
  const effectiveSegments: MediaSegments = segments ?? {
    intro: [],
    recap: [],
    credits: [],
    preview: [],
  };

  useEffect(() => {
    setShowNextPrompt(false);
    setNextCountdown(8);
    setIsEpisodeNavigating(false);
  }, [promptKey]);

  useEffect(() => {
    if (scrapeStatus === 'loading') {
      setIsEpisodeNavigating(false);
    }
  }, [scrapeStatus]);

  useEffect(() => {
    if (!onNavigateEpisode || mediaType !== 'show' || !season?.episodes?.length || !duration || !currentTime) {
      if (showNextPrompt) setShowNextPrompt(false);
      return;
    }

    const nextEpisode = season.episodes.find((ep) => ep.episodeNumber === episodeNum + 1);
    if (!nextEpisode) {
      if (showNextPrompt) setShowNextPrompt(false);
      return;
    }

    if (nextPromptDismissedForRef.current === promptKey) {
      if (showNextPrompt) setShowNextPrompt(false);
      return;
    }

    const remaining = Math.max(0, duration - currentTime);
    const shouldPrompt = remaining <= 12 || (duration > 0 && currentTime / duration >= 0.985);

    if (shouldPrompt) {
      if (!showNextPrompt) setShowNextPrompt(true);

      if (
        autoNext &&
        nextCountdown <= 0 &&
        nextPromptHandledForRef.current !== promptKey
      ) {
        nextPromptHandledForRef.current = promptKey;
        setIsEpisodeNavigating(true);
        onNavigateEpisode(seasonNum, nextEpisode.episodeNumber);
      }
    } else {
      if (showNextPrompt) setShowNextPrompt(false);
      setNextCountdown(8);
      nextPromptHandledForRef.current = null;
    }
  }, [currentTime, duration, autoNext, nextCountdown, mediaType, onNavigateEpisode, season, seasonNum, episodeNum, showNextPrompt, promptKey]);

  useEffect(() => {
    if (!showNextPrompt || !autoNext) return;
    const timer = setInterval(() => {
      setNextCountdown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [showNextPrompt, autoNext]);

  useEffect(() => {
    if (!autoSkipSegments || stream?.type === 'embed' || !duration || !currentTime) {
      lastAutoSkippedSegmentRef.current = '';
      return;
    }

    const timelineSegments = [
      ...effectiveSegments.intro.map((segment, index) => ({
        key: `intro-${index}-${segment.startMs}-${segment.endMs}`,
        startSec: segment.startMs / 1000,
        endSec: segment.endMs / 1000,
      })),
      ...effectiveSegments.recap.map((segment, index) => ({
        key: `recap-${index}-${segment.startMs}-${segment.endMs}`,
        startSec: segment.startMs / 1000,
        endSec: segment.endMs / 1000,
      })),
      ...effectiveSegments.credits.map((segment, index) => ({
        key: `credits-${index}-${segment.startMs}-${segment.endMs}`,
        startSec: segment.startMs / 1000,
        endSec: segment.endMs / 1000,
      })),
      ...effectiveSegments.preview.map((segment, index) => ({
        key: `preview-${index}-${segment.startMs}-${segment.endMs}`,
        startSec: segment.startMs / 1000,
        endSec: segment.endMs / 1000,
      })),
    ];

    if (introOutro?.introEnd && introOutro.introEnd > 0) {
      timelineSegments.push({ key: `legacy-intro-${introOutro.introEnd}`, startSec: 0, endSec: introOutro.introEnd });
    }
    if (introOutro?.outroStart && introOutro?.outroEnd && introOutro.outroEnd > introOutro.outroStart) {
      timelineSegments.push({
        key: `legacy-outro-${introOutro.outroStart}-${introOutro.outroEnd}`,
        startSec: introOutro.outroStart,
        endSec: introOutro.outroEnd,
      });
    }

    const activeSegment = timelineSegments.find((segment) => currentTime >= segment.startSec && currentTime < segment.endSec - 0.35);
    if (!activeSegment) return;

    const now = Date.now();
    if (lastAutoSkippedSegmentRef.current === activeSegment.key || now - lastAutoSkipAtRef.current < 900) return;

    lastAutoSkippedSegmentRef.current = activeSegment.key;
    lastAutoSkipAtRef.current = now;
    toast('Skipping segment...', 'info');
    seek(Math.min(activeSegment.endSec + 0.1, duration));
  }, [autoSkipSegments, stream?.type, duration, currentTime, introOutro, effectiveSegments, seek]);

  useEffect(() => {
    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
      setShowIdlePauseOverlay(false);
    };
    window.addEventListener('mousemove', markInteraction, { passive: true });
    window.addEventListener('mousedown', markInteraction, { passive: true });
    window.addEventListener('touchstart', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction);
    return () => {
      window.removeEventListener('mousemove', markInteraction);
      window.removeEventListener('mousedown', markInteraction);
      window.removeEventListener('touchstart', markInteraction);
      window.removeEventListener('keydown', markInteraction);
    };
  }, []);

  useEffect(() => {
    if (!idlePauseOverlay || stream?.type === 'embed') {
      if (showIdlePauseOverlay) setShowIdlePauseOverlay(false);
      return;
    }

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || isLoading || isPlaying || !video.paused) {
        if (showIdlePauseOverlay) setShowIdlePauseOverlay(false);
        return;
      }
      if (Date.now() - lastInteractionAtRef.current >= PAUSE_IDLE_OVERLAY_MS) {
        setShowIdlePauseOverlay(true);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [idlePauseOverlay, stream?.type, isLoading, isPlaying, showIdlePauseOverlay]);

  useEffect(() => {
    if (!showIdlePauseOverlay) {
      setIdleSnapshot(null);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      const vw = Math.max(1, video.videoWidth || 1280);
      const vh = Math.max(1, video.videoHeight || 720);
      // scale down a bit for performance
      const maxW = 1920;
      const scale = Math.min(1, maxW / vw);
      canvas.width = Math.max(320, Math.floor(vw * scale));
      canvas.height = Math.max(180, Math.floor(vh * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setIdleSnapshot(dataUrl);
      }
    } catch {
      setIdleSnapshot(null);
    }
  }, [showIdlePauseOverlay]);

  const loadSeasonEpisodes = useCallback(async (targetSeason: number) => {
    if (!tmdbId || mediaType !== 'show') return;
    setEpisodePanelSeason(targetSeason);
    setEpisodePanelLoading(true);
    try {
      const seasonData = await getSeasonDetails(tmdbId, targetSeason);
      setEpisodePanelEpisodes(seasonData.episodes || []);
    } catch {
      setEpisodePanelEpisodes([]);
    } finally {
      setEpisodePanelLoading(false);
    }
  }, [tmdbId, mediaType]);

  const handleInfoWatchlistAction = useCallback((status: WatchlistStatus) => {
    if (!media || !mediaTmdbId) return;

    if (infoWatchlistItem) {
      setWatchlistStatus(infoWatchlistItem.id, status);
    } else {
      addItem({
        mediaType: mediaType === 'show' ? 'show' : 'movie',
        tmdbId: mediaTmdbId,
        title: media.title,
        posterPath: media.posterPath,
        status,
      });
    }

    setShowInfoWatchlistMenu(false);
  }, [media, mediaTmdbId, infoWatchlistItem, setWatchlistStatus, addItem, mediaType]);

  const applyWatchPartyState = useCallback((state?: WatchPartyPlaybackState, serverNowIso?: string) => {
    if (!state || !videoRef.current) return;
    const video = videoRef.current;
    watchPartyApplyingRemoteRef.current = true;

    // Calculate server time drift compensation
    let compensatedTime = state.time;
    if (!state.paused && serverNowIso && state.updatedAt) {
      const updatedAtMs = Date.parse(state.updatedAt);
      const serverNowMs = Date.parse(serverNowIso);
      const elapsedSinceUpdate = (serverNowMs - updatedAtMs) / 1000;
      if (elapsedSinceUpdate > 0 && elapsedSinceUpdate < 300) {
        compensatedTime += elapsedSinceUpdate * (state.playbackRate || 1);
      }
    }

    const drift = Math.abs(video.currentTime - compensatedTime);
    const isBuffering = video.readyState < 3; // HAVE_FUTURE_DATA

    // Hard sync (seek) if drift is large.
    // Use a much larger threshold if buffering (8.5s vs 3.5s) to avoid seek loops on slow connections.
    const hardSyncThreshold = isBuffering ? 8.5 : 3.5;

    if (drift > hardSyncThreshold) {
      video.currentTime = compensatedTime;
    }
    // Soft sync (adjust playback rate) if drift is small (0.6s - threshold)
    // Only adjust rate if not currently buffering to avoid stuttering on low-end PCs
    else if (!state.paused && !isBuffering && drift > 0.6) {
      const isAhead = video.currentTime > compensatedTime;
      const baseRate = state.playbackRate || 1;
      // Adjust rate by 5% to catch up or wait (gentler than 10%)
      const adjustedRate = isAhead ? Math.max(0.5, baseRate - 0.05) : Math.min(2.0, baseRate + 0.05);
      video.playbackRate = adjustedRate;
      setPlaybackSpeed(adjustedRate);
    } else {
      // Very close, paused, or buffering: use original rate
      video.playbackRate = state.playbackRate || 1;
      setPlaybackSpeed(state.playbackRate || 1);
    }

    if (state.paused) {
      watchPartyForcePausedRef.current = true;
      if (!video.paused) video.pause();
    } else {
      watchPartyForcePausedRef.current = false;
      if (video.paused) video.play().catch(() => {});
    }

    window.setTimeout(() => {
      watchPartyApplyingRemoteRef.current = false;
    }, 400);
  }, []);

  const forceSyncGuestNow = useCallback(async () => {
    if (watchPartyRole !== 'guest' || !watchPartyRoomId || watchPartyForceSyncCooldownSec > 0) return;
    try {
      setWatchPartyStatus('Force syncing...');
      const response = await loadWatchPartyState(watchPartyRoomId);
      if (response.state) {
        applyWatchPartyState(response.state);
      }
      if (response.updatedAt) setWatchPartySyncAt(response.updatedAt);
      setWatchPartyGuestPollMs(response.recommendedGuestPollMs || 10000);
      setWatchPartyStatus('Force sync complete');
      setWatchPartyForceSyncUntil(Date.now() + 30000);
    } catch {
      setWatchPartyStatus('Force sync failed');
    }
  }, [watchPartyRole, watchPartyRoomId, watchPartyForceSyncCooldownSec, applyWatchPartyState]);

  const leaveWatchPartySession = useCallback(async () => {
    if (!watchPartyRoomId || !watchPartyParticipantId) {
      setWatchPartyRole(null);
      setWatchPartyHostToken('');
      setWatchPartyParticipantId('');
      setWatchPartySyncAt('');
      setWatchPartyStatus('Not connected');
      return;
    }

    try {
      await leaveWatchParty({ roomId: watchPartyRoomId, participantId: watchPartyParticipantId });
    } catch {
      // best effort leave
    }

    setWatchPartyRole(null);
    setWatchPartyHostToken('');
    setWatchPartyParticipantId('');
    setWatchPartySyncAt('');
    setWatchPartyRoomId('');
    setWatchPartyJoinCode('');
    watchPartyForcePausedRef.current = false;
    setWatchPartyStatus('Not connected');

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(WATCH_PARTY_CODE_KEY);
      } catch {}

      const nextUrl = new URL(window.location.href);
      if (nextUrl.searchParams.has('party')) {
        nextUrl.searchParams.delete('party');
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      }
    }
  }, [watchPartyRoomId, watchPartyParticipantId]);

  const createWatchPartyRoom = useCallback(async () => {
    if (watchPartyBusy) return;
    if (!isLoggedIn) {
      setWatchPartyStatus('Sign in required for Watch Together');
      return;
    }
    setWatchPartyBusy(true);
    setWatchPartyStatus('Creating room...');
    try {
      const video = videoRef.current;
      const response = await createWatchParty({
        mediaKey: watchPartyMediaKey,
        mediaType: mediaType || undefined,
        mediaId: tmdbId || (media?.id ? String(media.id) : undefined),
        season: mediaType === 'show' ? seasonNum : undefined,
        episode: mediaType === 'show' ? episodeNum : undefined,
        title,
        name: username,
        paused: video ? video.paused : true,
        time: video ? video.currentTime : 0,
        playbackRate: video ? video.playbackRate : 1,
      });

      setWatchPartyRoomId(response.roomId);
      setWatchPartyJoinCode(response.roomId);
      setWatchPartyRole('host');
      setWatchPartyHostToken(response.hostToken);
      setWatchPartyParticipantId(response.participantId);
      setWatchPartySyncAt(response.state.updatedAt);
      setWatchPartyGuestPollMs(response.recommendedGuestPollMs || 10000);
      setWatchPartyStatus(`Hosting room ${response.roomId}`);
    } catch (error: any) {
      setWatchPartyStatus(error?.message || 'Failed to create room');
    } finally {
      setWatchPartyBusy(false);
    }
  }, [watchPartyBusy, watchPartyMediaKey, mediaType, tmdbId, media?.id, seasonNum, episodeNum, title, username, isLoggedIn]);

  const joinWatchPartyRoom = useCallback(async (roomCode?: string) => {
    if (watchPartyBusy) return;
    if (!isLoggedIn) {
      setWatchPartyStatus('Sign in required for Watch Together');
      return;
    }
    const code = String(roomCode || watchPartyJoinCode || '').trim().toUpperCase();
    if (!code) {
      setWatchPartyStatus('Enter a room code');
      return;
    }

    setWatchPartyBusy(true);
    setWatchPartyStatus(`Joining ${code}...`);
    try {
      const response = await joinWatchParty({
        roomId: code,
        mediaKey: watchPartyMediaKey,
        name: username,
      });

      setWatchPartyRoomId(response.roomId);
      setWatchPartyJoinCode(response.roomId);
      setWatchPartyRole(response.role);
      setWatchPartyHostToken('');
      setWatchPartyParticipantId(response.participantId);
      setWatchPartySyncAt(response.updatedAt || response.state?.updatedAt || '');
      setWatchPartyGuestPollMs(response.recommendedGuestPollMs || 10000);
      setWatchPartyStatus(`Connected to ${response.roomId} (${response.hostName})`);
      applyWatchPartyState(response.state, response.serverNow);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(WATCH_PARTY_CODE_KEY);
        } catch {}
      }
    } catch (error: any) {
      setWatchPartyStatus(error?.message || 'Failed to join room');
    } finally {
      setWatchPartyBusy(false);
    }
  }, [watchPartyBusy, watchPartyJoinCode, watchPartyMediaKey, username, applyWatchPartyState, isLoggedIn]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isLoggedIn) return;
    if (watchPartyRole) return;
    if (watchPartyAutoJoinAttemptedRef.current) return;
    watchPartyAutoJoinAttemptedRef.current = true;

    const url = new URL(window.location.href);
    const codeFromUrl = String(url.searchParams.get('party') || '').trim().toUpperCase();
    const codeFromStorage = String(localStorage.getItem(WATCH_PARTY_CODE_KEY) || '').trim().toUpperCase();
    const code = codeFromUrl || codeFromStorage;
    if (!code) return;
    setWatchPartyJoinCode(code);
    joinWatchPartyRoom(code);
  }, [watchPartyRole, joinWatchPartyRoom, isLoggedIn]);

  useEffect(() => {
    if (watchPartyRole !== 'host' || !watchPartyRoomId || !watchPartyHostToken || !watchPartyMediaKey) return;

    const interval = window.setInterval(() => {
      if (watchPartyApplyingRemoteRef.current || !videoRef.current) return;

      const now = Date.now();
      if (now - watchPartyLastHostPushMsRef.current < 4000) return;
      watchPartyLastHostPushMsRef.current = now;

      pushWatchPartyHostStateNow();
    }, 1200);

    return () => window.clearInterval(interval);
  }, [watchPartyRole, watchPartyRoomId, watchPartyHostToken, watchPartyMediaKey, pushWatchPartyHostStateNow]);

  useEffect(() => {
    if (watchPartyRole !== 'guest' || !watchPartyRoomId) return;

    let canceled = false;
    const poll = async () => {
      try {
        const response = await loadWatchPartyState(watchPartyRoomId, watchPartySyncAt || undefined);
        if (canceled) return;

        setWatchPartyGuestPollMs(response.recommendedGuestPollMs || 10000);
        if (response.updatedAt) setWatchPartySyncAt(response.updatedAt);

        if (response.changed && response.state) {
          setWatchPartyStatus(`Synced with ${response.hostName || 'host'}`);
          applyWatchPartyState(response.state, response.serverNow);
        }
      } catch {
        if (!canceled) setWatchPartyStatus('Sync warning: guest poll failed');
      }
    };

    poll();
    const interval = window.setInterval(poll, Math.max(5000, watchPartyGuestPollMs));
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [watchPartyRole, watchPartyRoomId, watchPartySyncAt, watchPartyGuestPollMs, applyWatchPartyState]);

  useEffect(() => {
    setWatchPartyNowTs(Date.now());
    const timer = window.setInterval(() => {
      setWatchPartyNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (watchPartyRoomId && watchPartyParticipantId) {
        leaveWatchParty({ roomId: watchPartyRoomId, participantId: watchPartyParticipantId }).catch(() => {});
      }
    };
  }, [watchPartyRoomId, watchPartyParticipantId]);

  const hasSkipSegments = Boolean(
    introOutro?.introEnd || introOutro?.outroEnd ||
    effectiveSegments.intro.length > 0 || effectiveSegments.credits.length > 0,
  );

  const isShowWithEpisodes = mediaType === 'show' && Boolean(season?.episodes?.length);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  }, []);

  const changeSpeed = useCallback((speed: number) => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
    pushWatchPartyHostStateNow();
    setSettingsPanel(null);
  }, [pushWatchPartyHostStateNow]);

  const skipForward = useCallback(() => {
    const start = targetTimeRef.current !== null ? targetTimeRef.current : currentTime;
    seek(start + 10);
  }, [currentTime, seek]);

  const skipBackward = useCallback(() => {
    const start = targetTimeRef.current !== null ? targetTimeRef.current : currentTime;
    seek(start - 10);
  }, [currentTime, seek]);
  const handleSkipIntro = useCallback(() => { if (introOutro?.introEnd) seek(introOutro.introEnd); }, [introOutro]);
  const handleSkipOutro = useCallback(() => { if (introOutro?.outroEnd) seek(introOutro.outroEnd); }, [introOutro]);

  const selectQuality = useCallback((quality: StreamQuality) => {
    applyFileQuality(quality, { persistDefault: true });
    setSettingsPanel(null);
  }, [applyFileQuality]);

  const closeMenus = useCallback(() => {
    setSettingsPanel(null);
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        case 'ArrowRight': e.preventDefault(); skipForward(); break;
        case 'ArrowLeft': e.preventDefault(); skipBackward(); break;
        case 'ArrowUp': e.preventDefault(); changeVolume(volume + 0.1); break;
        case 'ArrowDown': e.preventDefault(); changeVolume(volume - 0.1); break;
        case 'm': e.preventDefault(); toggleMute(); break;

        case ',': e.preventDefault(); { const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed); if (idx > 0) changeSpeed(PLAYBACK_SPEEDS[idx - 1]); } break;
        case '.': e.preventDefault(); { const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed); if (idx < PLAYBACK_SPEEDS.length - 1) changeSpeed(PLAYBACK_SPEEDS[idx + 1]); } break;
        case 'Escape': closeMenus(); break;
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [togglePlay, toggleFullscreen, skipForward, skipBackward, volume, playbackSpeed]);

  const handleMouseMove = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
    setShowIdlePauseOverlay(false);
    showControls();
  }, [showControls]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const isNowFullscreen = Boolean(document.fullscreenElement);
      setFullscreen(isNowFullscreen);
      if (isNowFullscreen) {
        showControls();
      }
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, [setFullscreen, showControls]);

  useEffect(() => {
    if (isFullscreen) {
      showControls();
    }
  }, [isFullscreen, showControls]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferProgress = duration > 0 ? (buffered / duration) * 100 : 0;
  const hoverPercent = hoverProgress !== null && duration > 0 ? (hoverProgress / duration) * 100 : null;
  const subtitleBottomPercent = Math.max(-6, Math.min(35, 100 - subVertical));

  return (
    <div
      ref={containerRef}
      className={cn(
        'player-container nexvid-player group relative bg-black',
        fullViewport && 'full-viewport h-full w-full rounded-none',
        isFullscreen && 'is-fullscreen fixed inset-0 z-50 rounded-none',
        controlsVisible && 'controls-visible'
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={hideControls}
    >
      {/* Embed iframe or native video */}
      {stream?.type === 'embed' ? (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            src={stream.url}
            title="Embedded video player"
            className={cn('h-full w-full border-0', embedLockState !== 'unlocked' && 'pointer-events-none')}
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="origin"
          />
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="h-full w-full nexvid-video"
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
            onWaiting={handleWaiting}
            onCanPlay={handleCanPlay}
            onEnded={handleEnded}
            onError={handleError}
            onClick={togglePlay}
            onDoubleClick={toggleFullscreen}
            muted={isMuted}
            autoPlay={autoPlay}
          >
          </video>
          <audio ref={externalAudioRef} className="hidden" preload="auto" />

        </>
      )}

      {stream?.type !== 'embed' && activeCaption && renderedSubtitle && (
        <div
          className="pointer-events-none absolute inset-x-0 z-[12] flex justify-center px-5"
          style={{ bottom: `${subtitleBottomPercent}%` }}
        >
          <div
            className="max-w-[92%] whitespace-pre-line break-words text-center leading-tight shadow-lg"
            style={{
              fontSize: `${subFontSize}px`,
              color: subColor,
              background: subBg,
              padding: '4px 12px',
              borderRadius: '14px',
            }}
          >
            {renderedSubtitle}
          </div>
        </div>
      )}

      {stream?.type === 'embed' && !isEmbedNoticeDismissed && embedLockState === 'locked' && (
        <div className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="rounded-[20px] bg-black/85 p-5 backdrop-blur-2xl flex flex-col items-center gap-4 max-w-sm border border-white/10 shadow-[0_32px_64px_rgba(0,0,0,0.8)] animate-scale-in">
            <div className="flex flex-col items-center gap-1">
              <p className="text-center text-[13px] font-semibold text-white">Embed Interaction Locked</p>
              <p className="text-center text-[11px] text-white/50 leading-relaxed px-4">
                Clicks are restricted to prevent malicious redirects and popups from the provider.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 w-full">
              <button
                onClick={() => setEmbedLockState('unlocked')}
                className="flex items-center justify-center gap-2 rounded-[12px] bg-accent px-3 py-2.5 text-[11px] text-white font-bold hover:brightness-110 transition-all shadow-lg shadow-accent/25"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                Enable Clicks
              </button>

              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 rounded-[12px] bg-white/10 px-3 py-2.5 text-[11px] text-white font-bold hover:bg-white/15 transition-all border border-white/5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" suppressHydrationWarning><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Native Player
              </button>

              <a
                href={stream.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-[12px] bg-white/10 px-3 py-2.5 text-[11px] text-white font-bold hover:bg-white/15 transition-all border border-white/5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                Open in Tab
              </a>

              <button
                onClick={() => setIsEmbedNoticeDismissed(true)}
                className="flex items-center justify-center gap-2 rounded-[12px] bg-white/5 px-3 py-2.5 text-[11px] text-white/40 font-bold hover:bg-white/10 hover:text-white/60 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                Hide Notice
              </button>
            </div>

            {sourceLabel && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--accent-glow)]" />
                <p className="text-[10px] font-bold text-white/40 tracking-wider uppercase">{formatSourceName(sourceLabel)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Embed unlocked — centered lock button */}
      {stream?.type === 'embed' && embedLockState === 'unlocked' && (
        <div className="absolute inset-x-0 bottom-20 z-30 flex justify-center">
          <button
            onClick={() => setEmbedLockState('locked')}
            className="rounded-full bg-black/60 px-4 py-1.5 text-[11px] text-white/60 hover:bg-black/80 hover:text-white/90 backdrop-blur-sm transition-all flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Lock clicks
          </button>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && stream?.type !== 'embed' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
        </div>
      )}

      {/* Scrape status overlay */}
      {scrapeStatus === 'loading' && !stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none z-10">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <p className="text-[13px] text-white/60">Finding sources...</p>
        </div>
      )}
      {scrapeStatus === 'error' && !stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-[13px] text-white/60">{scrapeErrorTitle || 'No sources found'}</p>
          {scrapeErrorDescription && (
            <p className="max-w-[440px] px-4 text-center text-[11px] text-white/50">{scrapeErrorDescription}</p>
          )}
          {(onScrapeErrorAction || onBack) && (
            <div className="mt-2 flex items-center gap-2 pointer-events-auto">
              {onScrapeErrorAction && scrapeErrorActionLabel && (
                <button
                  onClick={onScrapeErrorAction}
                  className="btn-glass rounded-[10px] px-4 py-2 text-[13px] text-accent"
                >
                  {scrapeErrorActionLabel}
                </button>
              )}
              {onBack && (
                <button onClick={onBack} className="rounded-[8px] bg-white/10 px-4 py-2 text-[13px] text-white hover:bg-white/20 transition-colors">
                  Go Back
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {effectiveShowTokenNotice && (
        <div className="absolute left-1/2 top-16 z-30 w-[min(92%,740px)] -translate-x-1/2 px-2 pointer-events-none">
          <div className="pointer-events-auto p-3 sm:p-4 rounded-[16px] bg-black/80 backdrop-blur-[60px] backdrop-saturate-[200%] shadow-[0_12px_48px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.08)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-accent/20 text-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-accent/90">FebBox token</p>
                <p className="mt-0.5 text-[13px] font-medium text-white">Playback quality warning</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/60">{effectiveTokenNoticeText}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {effectiveTokenNoticeActionLabel && handleTokenNoticeAction && (
                <button
                  onClick={handleTokenNoticeAction}
                  className="btn-glass rounded-[10px] px-3 py-1.5 text-[11px] text-accent"
                >
                  {effectiveTokenNoticeActionLabel}
                </button>
              )}
              {onTokenNoticeSettings && (
                <button
                  onClick={onTokenNoticeSettings}
                  className="rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/20 transition-colors"
                >
                  {effectiveTokenNoticeSettingsLabel}
                </button>
              )}
              {onTokenNoticeDismiss && (
                <button
                  onClick={onTokenNoticeDismiss}
                  className="rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/20 transition-colors"
                >
                  {effectiveTokenNoticeDismissLabel}
                </button>
              )}
              {onTokenNoticePermanentDismiss && (
                <div className="ml-auto flex items-center gap-2">
                  {tokenNoticePermanentDismissHint && (
                    <span className="text-[10px] text-white/45">{tokenNoticePermanentDismissHint}</span>
                  )}
                  <button
                    onClick={onTokenNoticePermanentDismiss}
                    className="rounded-[8px] bg-red-500/12 px-3 py-1.5 text-[11px] font-medium text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    {tokenNoticePermanentDismissLabel || 'Dismiss sitewide'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Skip Intro */}
      {stream?.type !== 'embed' && showSkipIntro && skipIntro && (
        <button onClick={handleSkipIntro} className="skip-btn animate-fade-in">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-1.5"><path d="m11.5 16 6-4-6-4v8z" /><path d="M5 16l6-4-6-4v8z" /></svg>
          Skip Intro
        </button>
      )}

      {/* Skip Outro */}
      {stream?.type !== 'embed' && showSkipOutro && skipOutro && (
        <button onClick={handleSkipOutro} className="skip-btn animate-fade-in">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-1.5"><path d="m11.5 16 6-4-6-4v8z" /><path d="M5 16l6-4-6-4v8z" /></svg>
          Skip Outro
        </button>
      )}

      {/* Top Bar - shown for all stream types */}
      <div className={cn(
        'absolute top-0 left-0 right-0 flex items-center gap-3 px-3 sm:px-5 pt-4 pb-12 z-[40]',
        'bg-gradient-to-b from-black/80 to-transparent',
        'transition-opacity duration-300',
        (stream?.type === 'embed' || controlsVisible || scrapeStatus === 'error' || (error && !stream)) ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        {onBack && (
          <button onClick={onBack} className="rounded-[8px] p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {title && <p className="text-[13px] font-semibold text-white truncate">{title}</p>}
            {media && (
              <button
                onClick={() => setSettingsPanel(settingsPanel === 'info' ? null : 'info')}
                className={cn(
                  'shrink-0 rounded-[8px] p-1.5 transition-colors',
                  settingsPanel === 'info' ? 'text-accent' : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
                title="Info"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                </svg>
              </button>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-white/60 truncate">{subtitle}</p>}
        </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Restore Locked Notice button if hidden */}
            {stream?.type === 'embed' && isEmbedNoticeDismissed && embedLockState === 'locked' && (
              <button
                onClick={() => setIsEmbedNoticeDismissed(false)}
                className="rounded-[8px] p-2 text-amber-400/80 hover:bg-white/10 hover:text-amber-400 transition-colors"
                title="Show interaction notice"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                </svg>
              </button>
            )}

            {playbackSpeed !== 1 && stream?.type !== 'embed' && (
              <span className="rounded-[6px] bg-accent/80 px-2 py-0.5 text-[11px] font-bold text-white">{playbackSpeed}x</span>
            )}
            </div>
            </div>      {stream?.type === 'embed' ? null : (
      <>
      {/* Bottom Controls */}
      <div className={cn(
        'player-controls',
        'transition-opacity duration-300',
        controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        {/* Progress Bar */}
        <div
          ref={progressRef}
          className="player-progress"
          onClick={handleProgressClick}
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverProgress(null)}
        >
          <div className="player-progress-buffer" style={{ width: `${bufferProgress}%` }} />
          {/* Segment markers */}
          {segments && duration > 0 && (
            <>
              {segments.intro.map((s, i) => {
                const left = (s.startMs / 1000 / duration) * 100;
                const width = ((s.endMs - s.startMs) / 1000 / duration) * 100;
                return <div key={`intro-${i}`} className="absolute top-0 h-full bg-yellow-400/50 rounded-sm z-[1]" style={{ left: `${left}%`, width: `${width}%` }} title="Intro" />;
              })}
              {segments.recap.map((s, i) => {
                const left = (s.startMs / 1000 / duration) * 100;
                const width = ((s.endMs - s.startMs) / 1000 / duration) * 100;
                return <div key={`recap-${i}`} className="absolute top-0 h-full bg-blue-400/50 rounded-sm z-[1]" style={{ left: `${left}%`, width: `${width}%` }} title="Recap" />;
              })}
              {segments.credits.map((s, i) => {
                const left = (s.startMs / 1000 / duration) * 100;
                const width = ((s.endMs - s.startMs) / 1000 / duration) * 100;
                return <div key={`credits-${i}`} className="absolute top-0 h-full bg-gray-400/50 rounded-sm z-[1]" style={{ left: `${left}%`, width: `${width}%` }} title="Credits" />;
              })}
              {segments.preview.map((s, i) => {
                const left = (s.startMs / 1000 / duration) * 100;
                const width = ((s.endMs - s.startMs) / 1000 / duration) * 100;
                return <div key={`preview-${i}`} className="absolute top-0 h-full bg-green-400/50 rounded-sm z-[1]" style={{ left: `${left}%`, width: `${width}%` }} title="Preview" />;
              })}
            </>
          )}
          <div className="player-progress-fill" style={{ width: `${progress}%` }} />
          {hoverPercent !== null && (
            <div className="absolute -top-8 rounded bg-black/80 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm pointer-events-none" style={{ left: `${hoverPercent}%`, transform: 'translateX(-50%)' }}>
              {formatTime(hoverProgress!)}
            </div>
          )}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-accent shadow-lg shadow-accent/30 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${progress}%`, marginLeft: '-7px' }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex flex-wrap items-center justify-between gap-y-1.5">
          <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            <button onClick={togglePlay} className="rounded-[8px] p-2 text-white hover:bg-white/10 transition-colors" title={isPlaying ? 'Pause (K)' : 'Play (K)'}>
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
              )}
            </button>
            <button onClick={skipForward} className="hidden rounded-[8px] p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors sm:inline-flex" title="Forward 10s">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m11.5 16 6-4-6-4v8z" /><path d="M5 16l6-4-6-4v8z" /></svg>
            </button>
            <div className="flex items-center gap-1 group/vol">
              <button onClick={() => toggleMute()} className="rounded-[8px] p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors" title="Mute (M)">
                {isMuted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                ) : volume < 0.5 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                )}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={(e) => changeVolume(parseFloat(e.target.value))} className="w-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 accent-accent" />
            </div>
            <span className="ml-1 hidden text-[11px] text-white/70 tabular-nums sm:ml-2 sm:inline">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            {isShowWithEpisodes && (
              <>
                <button onClick={navigatePrevEpisode} className="hidden rounded-[8px] p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed sm:inline-flex" disabled={episodeNum <= 1} title="Previous Episode">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <button onClick={navigateNextEpisode} className="hidden rounded-[8px] p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors sm:inline-flex" title="Next Episode">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </>
            )}

            {/* Episodes Button (shows only) */}
            {mediaType === 'show' && season && (
              <div className="relative">
                <button
                  onClick={() => setSettingsPanel(settingsPanel === 'episodes' ? null : 'episodes')}
                  className={cn(
                    'rounded-[8px] p-2 transition-colors',
                    settingsPanel === 'episodes' ? 'text-accent' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                  title="Episodes"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="5" rx="1" /><rect x="2" y="10" width="20" height="5" rx="1" /><rect x="2" y="17" width="20" height="5" rx="1" />
                  </svg>
                </button>

                {/* Episodes Panel */}
                {settingsPanel === 'episodes' && (
                  <div className="absolute bottom-full right-0 mb-2 w-[min(92vw,20rem)] rounded-[16px] bg-black/80 backdrop-blur-[60px] backdrop-saturate-[200%] shadow-[0_12px_48px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.08)] p-3 animate-scale-in max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-semibold text-white/80">Episodes</p>
                      {(media as Show)?.seasons && (media as Show).seasons.length > 1 && (
                        <select
                          value={episodePanelSeason}
                          onChange={(e) => loadSeasonEpisodes(parseInt(e.target.value))}
                          className="rounded-[8px] bg-white/10 px-2 py-1 text-[11px] text-white border-none outline-none shadow-[0_0_0_0.5px_rgba(255,255,255,0.08)]"
                        >
                          {(media as Show).seasons.map((s) => (
                            <option key={s.seasonNumber} value={s.seasonNumber} className="bg-[#0a0a0a]">
                              Season {s.seasonNumber}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="space-y-1">
                      {episodePanelLoading && <p className="px-3 py-3 text-[11px] text-white/50">Loading episodes...</p>}
                      {!episodePanelLoading && episodePanelEpisodes.map((ep) => (
                        <button
                          key={ep.episodeNumber}
                          onClick={() => { onNavigateEpisode?.(episodePanelSeason, ep.episodeNumber); setSettingsPanel(null); }}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all duration-200',
                            episodePanelSeason === seasonNum && ep.episodeNumber === episodeNum
                              ? 'bg-accent/15 text-accent shadow-[0_0_0_1px_var(--accent-muted)]'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <span className="text-[11px] font-bold tabular-nums w-6 shrink-0">E{ep.episodeNumber}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] truncate">{ep.name || `Episode ${ep.episodeNumber}`}</p>
                            {ep.runtime && <p className="text-[10px] text-white/40">{ep.runtime} min</p>}
                          </div>
                          {episodePanelSeason === seasonNum && ep.episodeNumber === episodeNum && (
                            <span className="text-[10px] font-bold text-accent">NOW</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Info Panel */}
            {settingsPanel === 'info' && media && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4" onClick={() => setSettingsPanel(null)}>
                <div
                  className="w-full max-w-2xl overflow-hidden animate-scale-in max-h-[80vh] overflow-y-auto rounded-[20px] bg-black/80 backdrop-blur-[60px] backdrop-saturate-[200%] shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_0_0.5px_rgba(255,255,255,0.08)]"
                  onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-gradient-to-r from-accent/15 via-white/5 to-transparent px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[14px] font-semibold text-white">About</p>
                          <p className="mt-0.5 text-[11px] text-white/55">Details for the currently playing media</p>
                        </div>
                        <button onClick={() => setSettingsPanel(null)} className="rounded-[6px] p-1 text-white/60 hover:bg-white/10 hover:text-white">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex gap-4">
                        {media.posterPath && (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${media.posterPath}`}
                            alt={media.title}
                            className="h-36 w-24 shrink-0 rounded-[12px] object-cover shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
                          />
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-[18px] font-semibold text-white">{media.title}</p>
                          {mediaType === 'show' ? (
                            <p className="mt-1 text-[13px] text-white/65">
                              {`Season ${seasonNum} • Episode ${episodeNum}`}
                              {currentEpisodeInfo?.name ? ` • ${currentEpisodeInfo.name}` : ''}
                            </p>
                          ) : (
                            media.tagline && <p className="mt-1 text-[13px] text-white/65">{media.tagline}</p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            {media.releaseYear && (
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                                {media.releaseYear}
                              </span>
                            )}
                            {mediaType === 'show' && currentEpisodeInfo?.airDate && (
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                                {currentEpisodeInfo.airDate}
                              </span>
                            )}
                            {mediaType === 'show' && currentEpisodeInfo?.runtime && (
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                                {currentEpisodeInfo.runtime} min
                              </span>
                            )}
                            {media.rating && (
                              <span className="flex items-center gap-1 rounded-full bg-yellow-400/10 px-2 py-0.5 text-yellow-300 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>
                                {media.rating.toFixed(1)}
                              </span>
                            )}
                          </div>

                          {media.genres && media.genres.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {media.genres.slice(0, 8).map((g) => (
                                <span key={g.id} className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                                  {g.name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <div className="relative">
                              <button onClick={() => setShowInfoWatchlistMenu((value) => !value)} className="inline-flex items-center gap-1.5 rounded-[10px] bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/20 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                                {infoWatchlistItem ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                                )}
                                {infoWatchlistItem ? infoWatchlistItem.status : 'Add to List'}
                              </button>
                            </div>

                            {tmdbId && (
                              <a
                                href={`https://www.themoviedb.org/${mediaType === 'show' ? 'tv' : 'movie'}/${tmdbId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-[10px] bg-teal-500/15 px-3 py-1.5 text-[11px] font-semibold text-teal-300 hover:bg-teal-500/25 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                TMDB
                              </a>
                            )}

                            {tmdbId && mediaType === 'show' && media?.title && (
                              <a
                                href={`https://seriesgraph.com/show/${tmdbId}-${media.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-[10px] bg-violet-500/15 px-3 py-1.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/25 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                                SeriesGraph
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {infoSummaryText && (
                        <div className="mt-4 rounded-[12px] bg-white/[0.03] p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                          <p className="text-[13px] leading-relaxed text-white/75">{infoSummaryText}</p>
                        </div>
                      )}
                    </div>

                    {showInfoWatchlistMenu && (
                      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4" onClick={() => setShowInfoWatchlistMenu(false)}>
                        <div className="w-full max-w-xs rounded-[14px] bg-black/90 p-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.75)]" onClick={(e) => e.stopPropagation()}>
                          <p className="px-2 pb-1.5 text-[11px] font-semibold text-white/70">Add to List</p>
                          {(['Planned', 'Watching', 'Completed', 'Dropped', 'On-Hold'] as WatchlistStatus[]).map((status) => (
                            <button
                              key={status}
                              onClick={() => handleInfoWatchlistAction(status)}
                              className={cn(
                                'w-full rounded-[9px] px-3 py-2 text-left text-[12px] capitalize transition-colors',
                                infoWatchlistItem?.status === status ? 'bg-accent/20 text-accent' : 'text-white/80 hover:bg-white/10'
                              )}
                            >
                              {status.replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            )}

            {/* Unified Settings Button */}
            <div className="relative">
              <button
                onClick={() => setSettingsPanel(settingsPanel ? null : 'main')}
                className={cn(
                  'rounded-[8px] p-2 transition-colors',
                  settingsPanel ? 'text-accent' : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
                title="Settings"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>

              {/* Unified Settings Panel */}
              {settingsPanel && !['info', 'episodes'].includes(settingsPanel) && (
                <div className="absolute bottom-full right-0 mb-2 w-[min(90vw,18rem)] rounded-[16px] bg-black/80 backdrop-blur-[60px] backdrop-saturate-[200%] shadow-[0_12px_48px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.08)] p-3 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                  {/* Main Grid */}
                  {settingsPanel === 'main' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {/* Quality Tile */}
                        <button
                          onClick={() => setSettingsPanel('quality')}
                          className="flex flex-col items-center gap-1.5 rounded-[12px] bg-white/5 p-3 hover:bg-white/10 transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                            <path d="M2 6h4M18 6h4M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                            <path d="M12 10v4" />
                          </svg>
                          <span className="text-[10px] text-white/60">Quality</span>
                          <span className="text-[10px] font-semibold text-accent">
                            {getQualityLabel(currentQuality)}
                          </span>
                        </button>

                        {/* Sources Tile */}
                        <button
                          onClick={() => setSettingsPanel('sources')}
                          className="flex flex-col items-center gap-1.5 rounded-[12px] bg-white/5 p-3 hover:bg-white/10 transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                            <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6" y2="6"/><line x1="6" y1="18" x2="6" y2="18"/>
                          </svg>
                          <span className="text-[10px] text-white/60">Sources</span>
                          <span className="text-[10px] font-semibold text-accent truncate max-w-full">
                            {formatSourceName(sourceResults[currentSourceIndex]?.sourceId)}
                          </span>
                        </button>
                        {/* Subtitles Tile */}
                        <button
                          onClick={() => setSettingsPanel('subtitles')}
                          className="flex flex-col items-center gap-1.5 rounded-[12px] bg-white/5 p-3 hover:bg-white/10 transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M7 12h4M13 12h4M7 16h10" />
                          </svg>
                          <span className="text-[10px] text-white/60">Subtitles</span>
                          <span className={cn("text-[10px] font-semibold", activeCaption ? "text-accent" : "text-white/80")}>{activeCaption ? 'On' : 'Off'}</span>
                        </button>

                        {/* Segments Tile */}
                        <button
                          onClick={() => setSettingsPanel('segments')}
                          className="flex flex-col items-center gap-1.5 rounded-[12px] bg-white/5 p-3 hover:bg-white/10 transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                            <rect x="2" y="6" width="5" height="12" rx="1" />
                            <rect x="9" y="6" width="6" height="12" rx="1" />
                            <rect x="17" y="6" width="5" height="12" rx="1" />
                          </svg>
                          <span className="text-[10px] text-white/60">Segments</span>
                          <span className="text-[10px] font-semibold text-white/80">
                            {[effectiveSegments.intro.length, effectiveSegments.recap.length, effectiveSegments.credits.length, effectiveSegments.preview.length].reduce((a, b) => a + b, 0)}
                          </span>
                        </button>

                        {/* Playback Tile */}
                        <button
                          onClick={() => setSettingsPanel('playback')}
                          className="flex flex-col items-center gap-1.5 rounded-[12px] bg-white/5 p-3 hover:bg-white/10 transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="10 8 16 12 10 16 10 8" />
                          </svg>
                          <span className="text-[10px] text-white/60">Playback</span>
                          <span className="text-[10px] font-semibold text-white/80">Auto</span>
                        </button>

                        {/* Watch Together Tile */}
                        <button
                          onClick={() => setSettingsPanel('watchParty')}
                          className="flex flex-col items-center gap-1.5 rounded-[12px] bg-white/5 p-3 hover:bg-white/10 transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80">
                            <path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5 1.34 3.5 3 3.5z" />
                            <path d="M8 11c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11z" />
                            <path d="M2 20v-1c0-2.2 2.69-4 6-4" />
                            <path d="M22 20v-1c0-2.2-2.69-4-6-4" />
                            <path d="M8 20v-1c0-2.2 1.79-4 4-4s4 1.8 4 4v1" />
                          </svg>
                          <span className="text-[10px] text-white/60">Watch</span>
                          <span className={cn('text-[10px] font-semibold', watchPartyRole ? 'text-accent' : 'text-white/80')}>
                            {watchPartyRole ? watchPartyRole : 'Off'}
                          </span>
                        </button>

                      </div>
                    </div>
                  )}

                  {/* Playback Sub-panel */}
                  {settingsPanel === 'playback' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-2 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Playback
                      </button>
                      <div className="space-y-1 rounded-[12px] bg-white/[0.02] p-2">
                        <PlayerToggle label="Auto-play" checked={autoPlay} onChange={(v) => updateSettings({ autoPlay: v })} />
                        <PlayerToggle label="Auto-next" checked={autoNext} onChange={(v) => updateSettings({ autoNext: v })} />
                        <PlayerToggle label="Auto-skip segments" checked={autoSkipSegments} onChange={(v) => updateSettings({ autoSkipSegments: v })} />
                        <PlayerToggle label="Auto-switch source" checked={autoSwitchSource} onChange={(v) => updateSettings({ autoSwitchSource: v })} />
                        <PlayerToggle label="Idle pause overlay" checked={idlePauseOverlay} onChange={(v) => updateSettings({ idlePauseOverlay: v })} />
                      </div>
                    </div>
                  )}

                  {/* Skip Sub-panel */}
                  {settingsPanel === 'skip' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-2 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Skip
                      </button>
                      <div className="space-y-1 rounded-[12px] bg-white/[0.02] p-2">
                        <PlayerToggle label="Skip Intro" checked={skipIntro} onChange={(v) => updateSettings({ skipIntro: v })} />
                        <PlayerToggle label="Skip Outro" checked={skipOutro} onChange={(v) => updateSettings({ skipOutro: v })} />
                      </div>
                    </div>
                  )}

                  {/* Watch Together Sub-panel */}
                  {settingsPanel === 'watchParty' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-2 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Watch Together
                      </button>

                      <div className="space-y-2 rounded-[12px] bg-white/[0.02] p-2">
                        {!isLoggedIn && (
                          <p className="rounded-[8px] bg-white/5 px-2 py-2 text-[11px] text-white/70">Sign in to use Watch Together.</p>
                        )}

                        {!watchPartyRole ? (
                          <>
                            <button
                              onClick={createWatchPartyRoom}
                              disabled={watchPartyBusy || !isLoggedIn}
                              className="w-full rounded-[10px] bg-gradient-to-r from-accent to-accent-hover px-3 py-2.5 text-[12px] font-semibold text-white shadow-[0_0_18px_var(--accent-glow)] hover:brightness-110 disabled:opacity-50"
                            >
                              {watchPartyBusy ? 'Creating...' : 'Create Room'}
                            </button>
                            <div className="flex gap-2">
                              <input
                                value={watchPartyJoinCode}
                                onChange={(e) => setWatchPartyJoinCode(e.target.value.toUpperCase())}
                                placeholder="Room code"
                                className="flex-1 rounded-[8px] bg-white/10 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 outline-none"
                              />
                              <button
                                onClick={() => joinWatchPartyRoom()}
                                disabled={watchPartyBusy || !isLoggedIn}
                                className="rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/20 disabled:opacity-50"
                              >
                                Join
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="rounded-[8px] bg-white/5 px-2 py-2">
                              <div className="text-[11px] text-white/80">Room: <span className="font-semibold text-accent">{watchPartyRoomId}</span></div>
                              <div className="text-[10px] text-white/55">Role: {watchPartyRole}</div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (typeof window === 'undefined' || !watchPartyRoomId) return;
                                  const shareUrl = new URL(window.location.href);
                                  shareUrl.searchParams.set('party', watchPartyRoomId);
                                  navigator.clipboard.writeText(shareUrl.toString()).then(() => {
                                    setWatchPartyStatus('Invite link copied');
                                  }).catch(() => {
                                    setWatchPartyStatus('Could not copy link');
                                  });
                                }}
                                className="flex-1 rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/20"
                              >
                                Copy Invite Link
                              </button>
                              <button
                                onClick={leaveWatchPartySession}
                                className="rounded-[8px] bg-red-500/20 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/30"
                              >
                                Leave
                              </button>
                            </div>
                            {watchPartyRole === 'guest' && (
                              <button
                                onClick={forceSyncGuestNow}
                                disabled={watchPartyForceSyncCooldownSec > 0}
                                className="w-full rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/20 disabled:opacity-50"
                              >
                                {watchPartyForceSyncCooldownSec > 0 ? `Force Sync (${watchPartyForceSyncCooldownSec}s)` : 'Force Sync'}
                              </button>
                            )}
                          </>
                        )}

                        <p className="text-[10px] text-white/55">{watchPartyStatus}</p>
                      </div>
                    </div>
                  )}

                  {/* Quality Sub-panel */}
                  {settingsPanel === 'quality' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-2 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Quality
                      </button>
                      <div className="space-y-0.5">
                        {selectableQualities.length > 0 ? selectableQualities.map((q) => (
                          <button key={q} onClick={() => selectQuality(q)} className={cn('w-full rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors', currentQuality === q ? 'bg-accent/20 text-accent' : 'text-white/60 hover:bg-white/10')}>
                            {getQualityLabel(q)}
                          </button>
                        )) : (
                          <p className="px-3 py-2 text-[11px] text-white/40">Single quality stream</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sources Sub-panel */}
                  {settingsPanel === 'sources' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-2 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Sources
                      </button>
                      <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar px-1 -mx-1">
                        {/* Direct Sources */}
                        {sourceResults.filter(r => r.stream.type !== 'embed').map((res, i) => {
                          const isSelected = currentSourceIndex === sourceResults.indexOf(res);
                          return (
                            <button
                              key={res.sourceId}
                              onClick={() => { onSelectSource?.(sourceResults.indexOf(res)); setSettingsPanel(null); }}
                              className={cn(
                                "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] transition-all duration-300 text-left border-none",
                                isSelected ? "bg-accent/20 text-accent" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn(
                                  "h-1.5 w-1.5 rounded-full transition-all duration-500",
                                  isSelected ? "bg-accent shadow-[0_0_8px_var(--accent-glow)]" : "bg-white/20"
                                )} />
                                <p className={cn("text-[12px] font-semibold truncate", isSelected ? "text-accent" : "text-white")}>
                                  {formatSourceName(res.sourceId)}
                                </p>
                              </div>
                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", isSelected ? "bg-accent/20 text-accent" : "bg-white/5 text-white/30")}>Direct</span>
                            </button>
                          );
                        })}

                        {/* External Embeds */}
                        {sourceResults.filter(r => r.stream.type === 'embed').map((res, i) => {
                          const isSelected = currentSourceIndex === sourceResults.indexOf(res);
                          return (
                            <button
                              key={res.sourceId}
                              onClick={() => { onSelectSource?.(safeSourceResults.indexOf(res)); setSettingsPanel(null); }}
                              className={cn(
                                "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] transition-all duration-300 text-left border-none",
                                isSelected ? "bg-accent/20 text-accent" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn(
                                  "h-1.5 w-1.5 rounded-full transition-all duration-500",
                                  isSelected ? "bg-accent shadow-[0_0_8px_var(--accent-glow)]" : "bg-white/20"
                                )} />
                                <p className={cn("text-[12px] font-semibold truncate", isSelected ? "text-accent" : "text-white")}>
                                  {formatSourceName(res.sourceId)}
                                </p>
                              </div>
                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", isSelected ? "bg-accent/20 text-accent" : "bg-white/5 text-white/30")}>Embed</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Subtitles Sub-panel */}
                  {settingsPanel === 'subtitles' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-2 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Subtitles
                      </button>
                      <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
                        <button onClick={() => { setCaptionTouchedByUser(true); setActiveCaption(null); setRenderedSubtitle(''); setSettingsPanel('main'); }} className={cn('w-full rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors', !activeCaption ? 'bg-accent/20 text-accent font-bold' : 'text-white/60 hover:bg-white/10')}>Off</button>

                        {captions
                          .filter(cap => {
                            const code = normalizeLanguageCode(cap.language);
                            return code !== 'unknown' && languageLabel(code) !== 'Unknown';
                          })
                          .map((cap) => (
                          <button
                            key={cap.id}
                            onClick={() => {
                              setCaptionTouchedByUser(true);
                              setActiveCaption(cap.id);
                              setSettingsPanel('main');
                            }}
                            className={cn('w-full rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors flex items-center justify-between', activeCaption === cap.id ? 'bg-accent/20 text-accent font-bold' : 'text-white/60 hover:bg-white/10')}
                          >
                            <div className="flex items-center">
                              <span className="mr-2 opacity-80">{languageFlag(cap.language)}</span>
                              {languageLabel(cap.language)}
                            </div>
                            {activeCaption === cap.id && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
                          </button>
                        ))}

                        {captions.length === 0 && (
                          <p className="px-3 py-2 text-[11px] text-white/40 italic">No external subtitles found</p>
                        )}
                      </div>
                      <hr className="my-2 border-white/[0.06]" />
                      <button onClick={() => setSettingsPanel('subAppearance')} className="w-full rounded-[8px] px-3 py-2 text-left text-[13px] text-white/60 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>
                        Subtitle Appearance
                      </button>
                    </div>
                  )}                  {/* Subtitle Appearance Sub-panel */}
                  {settingsPanel === 'subAppearance' && (
                    <div>
                      <button onClick={() => setSettingsPanel('subtitles')} className="flex items-center gap-2 mb-3 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Subtitle Appearance
                      </button>

                      {/* Font Size */}
                      <div className="mb-3">
                        <p className="text-[11px] text-white/50 mb-1.5">Font Size</p>
                        <div className="flex gap-1.5">
                          {[{ label: 'S', val: 14 }, { label: 'M', val: 20 }, { label: 'L', val: 28 }, { label: 'XL', val: 36 }].map((s) => (
                            <button key={s.val} onClick={() => setSubFontSize(s.val)} className={cn('flex-1 rounded-[8px] py-1.5 text-[11px] font-medium transition-colors', subFontSize === s.val ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/50 hover:bg-white/10')}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Text Color */}
                      <div className="mb-3">
                        <p className="text-[11px] text-white/50 mb-1.5">Text Color</p>
                        <div className="flex gap-1.5">
                          {[{ label: 'White', val: '#ffffff' }, { label: 'Yellow', val: '#ffd700' }, { label: 'Cyan', val: '#00ffff' }, { label: 'Green', val: '#00ff00' }].map((c) => (
                            <button key={c.val} onClick={() => setSubColor(c.val)} className={cn('flex-1 rounded-[8px] py-1.5 text-[11px] font-medium transition-colors', subColor === c.val ? 'ring-1 ring-accent' : 'bg-white/5 hover:bg-white/10')} style={{ color: c.val }}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Background */}
                      <div>
                        <p className="text-[11px] text-white/50 mb-1.5">Background</p>
                        <div className="flex gap-1.5">
                          {[{ label: 'Dark', val: 'rgba(0,0,0,0.75)' }, { label: 'Semi', val: 'rgba(0,0,0,0.4)' }, { label: 'None', val: 'transparent' }].map((b) => (
                            <button key={b.val} onClick={() => setSubBg(b.val)} className={cn('flex-1 rounded-[8px] py-1.5 text-[11px] font-medium transition-colors', subBg === b.val ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/50 hover:bg-white/10')}>
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] text-white/50 mb-1.5">Vertical Position</p>
                        <input
                          type="range"
                          min="65"
                          max="106"
                          step="1"
                          value={subVertical}
                          onChange={(e) => setSubVertical(Number(e.target.value))}
                          className="w-full accent-accent h-1"
                        />
                        <div className="mt-1 flex justify-between text-[10px] text-white/35">
                          <span>Higher</span>
                          <span>Lower</span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] text-white/50 mb-1.5">Subtitle Delay</p>
                        <input
                          type="range"
                          min={String(SUB_DELAY_MIN_MS)}
                          max={String(SUB_DELAY_MAX_MS)}
                          step="100"
                          value={subDelayMs}
                          onChange={(e) => setSubDelayMs(Number(e.target.value))}
                          className="w-full accent-accent h-1"
                        />
                        <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
                          <span>−10.0s</span>
                          <span>{(subDelayMs / 1000).toFixed(1)}s</span>
                          <span>+10.0s</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button onClick={() => setSubDelayMs((v) => Math.max(SUB_DELAY_MIN_MS, v - 500))} className="rounded-[6px] bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/20">-500ms</button>
                          <button onClick={() => setSubDelayMs(0)} className="rounded-[6px] bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/20">Reset</button>
                          <button onClick={() => setSubDelayMs((v) => Math.min(SUB_DELAY_MAX_MS, v + 500))} className="rounded-[6px] bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/20">+500ms</button>
                        </div>
                      </div>

                      {/* Preview */}
                      <div className="mt-3 rounded-[8px] bg-black/50 p-3 flex items-center justify-center">
                        <span style={{ fontSize: `${subFontSize}px`, color: subColor, background: subBg, padding: '2px 8px', borderRadius: '10px' }}>
                          Preview text
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Segments Sub-panel (TIDB) */}
                  {settingsPanel === 'segments' && (
                    <div>
                      <button onClick={() => setSettingsPanel('main')} className="flex items-center gap-2 mb-3 text-[11px] text-white/60 hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                        Segments
                      </button>

                      {/* Existing segments */}
                      <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                        {[
                          ...effectiveSegments.intro.map((s, i) => ({ ...s, type: 'Intro' as const, color: 'text-yellow-400', key: `i${i}` })),
                          ...effectiveSegments.recap.map((s, i) => ({ ...s, type: 'Recap' as const, color: 'text-blue-400', key: `r${i}` })),
                          ...effectiveSegments.credits.map((s, i) => ({ ...s, type: 'Credits' as const, color: 'text-gray-400', key: `c${i}` })),
                          ...effectiveSegments.preview.map((s, i) => ({ ...s, type: 'Preview' as const, color: 'text-green-400', key: `p${i}` })),
                        ].map((seg) => (
                          <div key={seg.key} className="flex items-center justify-between rounded-[8px] bg-white/5 px-3 py-1.5">
                            <span className={cn('text-[11px] font-medium', seg.color)}>{seg.type}</span>
                            <span className="text-[10px] text-white/50 tabular-nums">
                              {formatTime(seg.startMs / 1000)} – {formatTime(seg.endMs / 1000)}
                            </span>
                          </div>
                        ))}
                        {effectiveSegments.intro.length === 0 && effectiveSegments.recap.length === 0 && effectiveSegments.credits.length === 0 && effectiveSegments.preview.length === 0 && (
                          <p className="text-[11px] text-white/40 text-center py-2">No segments found</p>
                        )}
                      </div>

                      {/* Submit new segment */}
                      <hr className="my-2 border-white/[0.06]" />
                      <p className="text-[11px] text-white/50 mb-2">Submit a segment</p>
                      <div className="space-y-2">
                        <select value={submitType} onChange={(e) => setSubmitType(e.target.value as any)} className="w-full rounded-[8px] bg-white/10 px-2 py-1.5 text-[11px] text-white border-none outline-none">
                          <option value="intro" className="bg-[#0a0a0f]">Intro</option>
                          <option value="recap" className="bg-[#0a0a0f]">Recap</option>
                          <option value="credits" className="bg-[#0a0a0f]">Credits</option>
                          <option value="preview" className="bg-[#0a0a0f]">Preview</option>
                        </select>
                        <div className="flex gap-2">
                          <input type="text" value={submitStart} onChange={(e) => setSubmitStart(e.target.value)} placeholder="Start (sec)" className="flex-1 rounded-[8px] bg-white/10 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 outline-none" />
                          <button onClick={() => setSubmitStart(String(Math.floor(currentTime)))} className="rounded-[8px] bg-white/10 px-2 py-1.5 text-[10px] text-accent hover:bg-white/15 transition-colors" title="Use current time">Now</button>
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={submitEnd} onChange={(e) => setSubmitEnd(e.target.value)} placeholder="End (sec)" className="flex-1 rounded-[8px] bg-white/10 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 outline-none" />
                          <button onClick={() => setSubmitEnd(String(Math.floor(currentTime)))} className="rounded-[8px] bg-white/10 px-2 py-1.5 text-[10px] text-accent hover:bg-white/15 transition-colors" title="Use current time">Now</button>
                        </div>
                        <button
                          disabled={!introDbApiKey || submitStatus === 'sending' || !submitStart || !submitEnd}
                          onClick={async () => {
                            if (!introDbApiKey || !tmdbId) return;
                            setSubmitStatus('sending');
                            const res = await submitSegment({
                              apiKey: introDbApiKey,
                              tmdbId,
                              type: mediaType === 'movie' ? 'movie' : 'show',
                              segment: submitType,
                              startSec: parseFloat(submitStart),
                              endSec: parseFloat(submitEnd),
                              season: seasonNum,
                              episode: episodeNum,
                              sessionToken: sessionToken || undefined,
                            });
                            setSubmitStatus(res.ok ? 'ok' : 'error');
                            setTimeout(() => setSubmitStatus('idle'), 2000);
                          }}
                          className={cn(
                            'w-full rounded-[8px] px-3 py-2 text-[11px] font-medium transition-colors',
                            submitStatus === 'ok' ? 'bg-green-500/20 text-green-400' :
                            submitStatus === 'error' ? 'bg-red-500/20 text-red-400' :
                            'bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed'
                          )}
                        >
                          {submitStatus === 'sending' ? 'Submitting...' : submitStatus === 'ok' ? 'Submitted!' : submitStatus === 'error' ? 'Failed' : !introDbApiKey ? 'Add API key in Settings' : 'Submit'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="rounded-[8px] p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors" title="Fullscreen (F)">
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {showNextPrompt && isShowWithEpisodes && (
        <div className="absolute right-4 bottom-20 z-30 w-[320px] rounded-[16px] bg-black/80 backdrop-blur-[60px] backdrop-saturate-[200%] shadow-[0_12px_48px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.08)] p-4 animate-slide-up">
          <p className="text-[13px] font-semibold text-white">Next episode ready</p>          <p className="text-[11px] text-white/60 mt-1">
            {isEpisodeNavigating ? 'Loading next episode…' : autoNext ? `Auto-play in ${nextCountdown}s` : 'Auto-next is off'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                nextPromptHandledForRef.current = promptKey;
                navigateNextEpisode();
              }}
              disabled={isEpisodeNavigating}
              className="rounded-[8px] bg-accent/25 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/35 disabled:opacity-60"
            >
              {isEpisodeNavigating ? 'Loading…' : 'Play next now'}
            </button>
            {autoNext && (
              <button
                onClick={() => {
                  nextPromptDismissedForRef.current = promptKey;
                  setShowNextPrompt(false);
                  setNextCountdown(8);
                }}
                className="rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/20"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* End Screen / Finished Overlay */}
      {isFinished && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="text-center max-w-md px-6 animate-scale-in">
            <p className="text-[13px] font-bold uppercase tracking-widest text-accent mb-2">Finished</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6">
              {mediaType === 'show' ? `Completed S${seasonNum}:E${episodeNum}` : 'Movie Finished'}
            </h2>

            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
              {mediaType === 'show' && season?.episodes?.some(ep => ep.episodeNumber === episodeNum + 1) && (
                <button
                  onClick={() => {
                    setIsFinished(false);
                    navigateNextEpisode();
                  }}
                  disabled={isEpisodeNavigating}
                  className="w-full sm:w-auto btn-accent rounded-[14px] px-8 py-3 text-[14px]"
                >
                  {isEpisodeNavigating ? 'Loading...' : 'Next Episode'}
                </button>
              )}
              <button
                onClick={() => {
                  setIsFinished(false);
                  seek(0);
                  videoRef.current?.play().catch(() => {});
                }}
                className="w-full sm:w-auto rounded-[14px] bg-white/10 px-8 py-3 text-[14px] font-bold text-white hover:bg-white/15 transition-all"
              >
                Rewatch
              </button>
              <button
                onClick={onBack}
                className="w-full sm:w-auto rounded-[14px] border border-white/10 px-8 py-3 text-[14px] font-bold text-white/70 hover:text-white transition-all"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {showIdlePauseOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-5" onClick={() => setShowIdlePauseOverlay(false)}>
          <div className="absolute inset-0">
            {idleSnapshot ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${idleSnapshot})`, filter: 'blur(6px) brightness(0.45) contrast(0.85)' }}
              />
            ) : (
              <div className="absolute inset-0 bg-black/60" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
          </div>

          <div className="relative w-full max-w-[1100px] p-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-white/60">Now Watching</p>
            <h1 className="mt-2 text-5xl font-extrabold text-white leading-tight">{title || media?.title || 'Now playing'}</h1>

            {mediaType === 'show' && (
              <div className="mt-2 flex items-center gap-4">
                <p className="text-[15px] font-semibold text-white/70">Season {seasonNum}</p>
                <p className="text-[15px] text-white/80">{currentEpisodeInfo?.name ? `${currentEpisodeInfo.name}` : `Episode ${episodeNum}`}</p>
              </div>
            )}

            {subtitle && <p className="mt-3 text-[13px] text-white/65">{subtitle}</p>}

            {infoSummaryText && <p className="mt-4 max-w-[60%] line-clamp-3 text-[14px] text-white/70">{infoSummaryText}</p>}
          </div>

          <div className="absolute right-6 bottom-6 text-[12px] text-white/70">Paused</div>
        </div>
      )}

      <style jsx global>{`
        .nexvid-player video.nexvid-video::cue {
          font-size: ${subFontSize}px;
          color: ${subColor};
          background: transparent;
        }
      `}</style>
      </>
      )}
    </div>
  );
}

/* ── Inline Player Toggle ── */
function PlayerToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] hover:bg-white/5 transition-colors"
    >
      <span className="text-[11px] text-white/60">{label}</span>
      <div className={cn('relative w-7 h-4 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-white/15')}>
        <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-3.5' : 'translate-x-0.5')} />
      </div>
    </button>
  );
}
