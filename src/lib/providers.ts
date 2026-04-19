/* ============================================
   Source Provider Integration
  FebBox source integration (direct mp4)
  + embed fallback providers
   ============================================ */

import type {
  EmbedStream,
  FileBasedStream,
  HlsBasedStream,
  MediaType,
  ScrapeProgress,
  SourceMeta,
  SourceResult,
  StreamFile,
  StreamQuality,
} from '@/types';

interface ProviderConfig {
  proxyUrl?: string;
}

let config: ProviderConfig = {};

export function configureProviders(newConfig: ProviderConfig) {
  config = { ...config, ...newConfig };
}

export const SOURCES: SourceMeta[] = [
  { id: 'febbox', name: 'Alpha', rank: 1000, type: 'source' },
  { id: 'pobreflix', name: 'Beta', rank: 950, type: 'source' },
  { id: '02moviedownloader', name: 'Gamma', rank: 920, type: 'source' },
  { id: 'zxcstream', name: 'Delta', rank: 900, type: 'embed' },
  { id: 'cinesrc', name: 'Epsilon', rank: 850, type: 'embed' },
  { id: 'vidking', name: 'Zeta', rank: 800, type: 'embed' },
  { id: 'peachify', name: 'Sigma', rank: 110, type: 'embed' },
  { id: 'vidfast', name: 'Eta', rank: 104, type: 'embed' },
  { id: 'videasy', name: 'Theta', rank: 103, type: 'embed' },
  { id: 'vidsync', name: 'Iota', rank: 102, type: 'embed' },
  { id: 'vidlink', name: 'Kappa', rank: 101, type: 'embed' },
];

const SOURCE_LABELS: Record<string, string> = {
  febbox: 'Alpha',
  pobreflix: 'Beta',
  '02moviedownloader': 'Gamma',
  zxcstream: 'Delta',
  cinesrc: 'Epsilon',
  vidking: 'Zeta',
  vidfast: 'Eta',
  videasy: 'Theta',
  vidsync: 'Iota',
  vidlink: 'Kappa',
  peachify: 'Sigma',
};

export function mapQuality(raw: string): StreamQuality {
  const q = String(raw || '').toLowerCase();
  if (q.includes('4k') || q.includes('2160')) return '4k';
  if (q.includes('2k') || q.includes('1440')) return '2k';
  if (q.includes('1080')) return '1080';
  if (q.includes('720')) return '720';
  if (q.includes('480')) return '480';
  if (q.includes('360')) return '360';
  return 'unknown';
}

export interface ScrapeOptions {
  tmdbId: string;
  imdbId?: string;
  title: string;
  releaseYear: number;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  febboxCookie?: string;
  sessionToken?: string | null;
  accentColor?: string;
  idlePauseOverlay?: boolean;
  startAt?: number;
  episodeTmdbId?: string;
  seasonTmdbId?: string;
  seasonTitle?: string;
  episodeCount?: number;
  onProgress?: (progress: ScrapeProgress) => void;
  onSourceFound?: (result: SourceResult) => void;
  onDebugLog?: (entry: { step: string; source?: string; message: string; data?: any }) => void;
  autoPlay?: boolean;
  autoNext?: boolean;
  autoSkipSegments?: boolean;
  nextButton?: boolean;
  episodeSelector?: boolean;
  excludeSources?: string[];
}

function pushDebug(
  options: ScrapeOptions,
  entry: { step: string; source?: string; message: string; data?: any },
) {
  options.onDebugLog?.(entry);
}

async function scrapeSource(
  options: ScrapeOptions,
  sourceId: string,
): Promise<SourceResult | null> {
  try {
    const sourceLabel = SOURCE_LABELS[sourceId] || sourceId;
    pushDebug(options, {
      step: sourceId,
      message: `Starting ${sourceLabel} resolution`,
    });

    // Videasy is a simple embed, can stay on client
    if (sourceId === 'videasy') {
      options.onProgress?.({ id: sourceId, percentage: 50, status: 'pending' });
      const baseUrl = 'https://player.videasy.net';
      let embedUrl = '';
      if (options.mediaType === 'movie') {
        embedUrl = `${baseUrl}/movie/${options.tmdbId}`;
      } else {
        embedUrl = `${baseUrl}/tv/${options.tmdbId}/${options.season || 1}/${options.episode || 1}`;
      }

      const url = new URL(embedUrl);
      const color = (options.accentColor || '6366f1').replace('#', '');
      url.searchParams.set('color', color);
      url.searchParams.set('nextEpisode', (options.nextButton ?? true) ? 'true' : 'false');
      url.searchParams.set('autoPlay', (options.autoPlay ?? true) ? 'true' : 'false');
      url.searchParams.set('autoplayNextEpisode', (options.autoNext ?? true) ? 'true' : 'false');
      url.searchParams.set('episodeSelector', (options.episodeSelector ?? true) ? 'true' : 'false');
      if (options.startAt && options.startAt > 0)
        url.searchParams.set('progress', Math.floor(options.startAt).toString());
      if (options.idlePauseOverlay) url.searchParams.set('overlay', 'true');

      const stream: EmbedStream = { type: 'embed', url: url.toString() };
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'success',
      });
      return { sourceId, stream };
    }

    // Vidlink is also a simple embed
    if (sourceId === 'vidlink') {
      options.onProgress?.({ id: sourceId, percentage: 50, status: 'pending' });
      const baseUrl = 'https://vidlink.pro';
      let embedUrl = '';
      if (options.mediaType === 'movie') {
        embedUrl = `${baseUrl}/movie/${options.tmdbId}`;
      } else {
        embedUrl = `${baseUrl}/tv/${options.tmdbId}/${options.season || 1}/${options.episode || 1}`;
      }

      const url = new URL(embedUrl);

      const color =
        options.accentColor && /^[0-9a-fA-F]{3,6}$/.test(options.accentColor)
          ? options.accentColor
          : '6366f1';

      url.searchParams.set('primaryColor', color);
      url.searchParams.set('secondaryColor', '000000');
      url.searchParams.set('nextbutton', (options.nextButton ?? true) ? 'true' : 'false');
      url.searchParams.set('autoplay', (options.autoPlay ?? true) ? 'true' : 'false');
      if (options.startAt && options.startAt > 0)
        url.searchParams.set('startAt', Math.floor(options.startAt).toString());

      const stream: EmbedStream = { type: 'embed', url: url.toString() };
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'success',
      });
      return { sourceId, stream };
    }

    const isGenericEmbed = [
      'vidfast',
      'vidsync',
      'vidking',
      'zxcstream',
      'cinesrc',
      'peachify',
    ].includes(sourceId);
    if (isGenericEmbed) {
      options.onProgress?.({ id: sourceId, percentage: 50, status: 'pending' });
      let embedUrl = '';

      const mType = options.mediaType;
      const tId = options.tmdbId;
      const sNum = options.season || 1;
      const eNum = options.episode || 1;
      const accent = (options.accentColor || '6366f1').replace('#', '').toUpperCase();

      const effId = options.tmdbId;

      switch (sourceId) {
        case 'vidfast': {
          const baseUrl =
            mType === 'movie'
              ? `https://vidfast.pro/movie/${effId}`
              : `https://vidfast.pro/tv/${effId}/${sNum}/${eNum}`;
          const params = new URLSearchParams();
          params.set('autoPlay', (options.autoPlay ?? true) ? 'true' : 'false');
          if (mType === 'show') {
            params.set('nextButton', (options.nextButton ?? true) ? 'true' : 'false');
            params.set('autoNext', (options.autoNext ?? true) ? 'true' : 'false');
          }
          if (options.startAt && options.startAt > 0)
            params.set('startAt', Math.floor(options.startAt).toString());
          params.set('title', 'true');
          params.set('poster', 'true');
          params.set('color', accent);
          params.set('primaryColor', accent);

          embedUrl = `${baseUrl}?theme=${accent}&${params.toString()}`;
          break;
        }
        case 'vidsync': {
          const u = new URL(
            mType === 'movie'
              ? `https://vidsync.xyz/embed/movie/${tId}`
              : `https://vidsync.xyz/embed/tv/${tId}/${sNum}/${eNum}`,
          );
          u.searchParams.set('autoPlay', (options.autoPlay ?? true) ? 'true' : 'false');
          u.searchParams.set('theme', accent);
          if (mType === 'show') {
            u.searchParams.set('nextButton', (options.nextButton ?? true) ? 'true' : 'false');
            u.searchParams.set('autoNext', (options.autoNext ?? true) ? 'true' : 'false');
          }
          embedUrl = u.toString();
          break;
        }
        case 'vidking': {
          const u = new URL(
            mType === 'movie'
              ? `https://www.vidking.net/embed/movie/${tId}`
              : `https://www.vidking.net/embed/tv/${tId}/${sNum}/${eNum}`,
          );
          u.searchParams.set('color', accent);
          u.searchParams.set('autoPlay', (options.autoPlay ?? true) ? 'true' : 'false');
          if (mType === 'show') {
            u.searchParams.set('nextEpisode', (options.nextButton ?? true) ? 'true' : 'false');
            u.searchParams.set(
              'episodeSelector',
              (options.episodeSelector ?? true) ? 'true' : 'false',
            );
          }
          if (options.startAt && options.startAt > 0)
            u.searchParams.set('progress', Math.floor(options.startAt).toString());
          embedUrl = u.toString();
          break;
        }
        case 'cinesrc': {
          const u = new URL(
            mType === 'movie'
              ? `https://cinesrc.st/embed/movie/${tId}`
              : `https://cinesrc.st/embed/tv/${tId}`,
          );
          if (mType === 'show') {
            u.searchParams.set('s', sNum.toString());
            u.searchParams.set('e', eNum.toString());
          }
          // color should be like #e50914, URL object will encode # to %23
          const color = options.accentColor?.startsWith('#')
            ? options.accentColor
            : `#${options.accentColor || '6366f1'}`;
          u.searchParams.set('color', color);
          u.searchParams.set('autoplay', (options.autoPlay ?? true) ? 'true' : 'false');
          u.searchParams.set('autonext', (options.autoNext ?? true) ? 'true' : 'false');
          u.searchParams.set('autoskip', (options.autoSkipSegments ?? false) ? 'true' : 'false');
          u.searchParams.set('back', 'close');
          if (options.startAt && options.startAt > 0)
            u.searchParams.set('t', Math.floor(options.startAt).toString());
          embedUrl = u.toString();
          break;
        }
        case 'zxcstream':
          embedUrl =
            mType === 'movie'
              ? `https://zxcstream.xyz/player/movie/${tId}?domainAd=nexvid.online&color=${accent}&autoplay=${(options.autoPlay ?? true) ? 'true' : 'false'}`
              : `https://zxcstream.xyz/player/tv/${tId}/${sNum}/${eNum}?domainAd=nexvid.online&color=${accent}&autoplay=${(options.autoPlay ?? true) ? 'true' : 'false'}`;
          break;
        case 'peachify': {
          const baseUrl = 'https://peachify.top';
          const path =
            mType === 'movie' ? `/embed/movie/${tId}` : `/embed/tv/${tId}/${sNum}/${eNum}`;
          const url = new URL(`${baseUrl}${path}`);
          url.searchParams.set('accent', accent);
          if (options.startAt && options.startAt > 0) {
            url.searchParams.set('startAt', Math.floor(options.startAt).toString());
          }
          // UI Toggles - Hide internal UI to use NexVid's overlay
          url.searchParams.set('pip', 'hide');
          url.searchParams.set('cast', 'hide');

          embedUrl = url.toString();
          break;
        }
      }

      const stream: EmbedStream = { type: 'embed', url: embedUrl };
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'success',
      });
      return { sourceId, stream };
    }

    // Integrated providers
    const params = new URLSearchParams({
      tmdbId: options.tmdbId,
      mediaType: options.mediaType,
      title: options.title,
      year: String(options.releaseYear),
    });

    if (options.mediaType === 'show') {
      params.set('season', String(options.season || 1));
      params.set('episode', String(options.episode || 1));
    }

    if (options.febboxCookie) params.set('febboxToken', options.febboxCookie);
    params.set('source', sourceId);

    options.onProgress?.({ id: sourceId, percentage: 30, status: 'pending' });

    const response = await fetch(`/api/stream?${params.toString()}`, {
      headers: {
        ...(options.febboxCookie ? { 'x-febbox-cookie': options.febboxCookie } : {}),
        ...(options.sessionToken ? { Authorization: `Bearer ${options.sessionToken}` } : {}),
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'notfound',
      });
      return null;
    }

    const data = await response.json();
    options.onProgress?.({ id: sourceId, percentage: 80, status: 'pending' });

    if (!data.success || !data.data) {
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'notfound',
      });
      return null;
    }

    const streamData = data.data;
    const captions = Array.isArray(streamData.captions || streamData.subtitles)
      ? (streamData.captions || streamData.subtitles)
          .map((subtitle: any) => {
            const url = String(subtitle?.url || '');
            if (!url) return null;
            const language = String(subtitle?.language || subtitle?.label || 'en').toLowerCase();
            const label = String(subtitle?.label || language.toUpperCase());
            const type = String(subtitle?.type || subtitle?.format || '')
              .toLowerCase()
              .includes('vtt')
              ? 'vtt'
              : 'srt';
            return {
              id: `sb-${language}-${label}-${Math.random().toString(36).slice(2, 6)}`,
              language,
              label,
              type,
              url,
            };
          })
          .filter(Boolean)
      : [];

    if (
      String(streamData.type || streamData.kind || '').toLowerCase() === 'hls' ||
      streamData.playlist
    ) {
      const streamUrl = String(streamData.playlist || streamData.url || '').trim();
      if (!streamUrl) {
        options.onProgress?.({
          id: sourceId,
          percentage: 100,
          status: 'notfound',
        });
        return null;
      }
      const stream: HlsBasedStream = {
        type: 'hls',
        id: `${sourceId}-hls-stream`,
        flags: [],
        captions,
        playlist: streamUrl,
        headers: streamData.headers,
      };
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'success',
      });
      return { sourceId, stream };
    }

    if (streamData.qualities && typeof streamData.qualities === 'object') {
      const qualities: Partial<Record<StreamQuality, StreamFile>> = {};

      if (Array.isArray(streamData.qualities)) {
        for (const q of streamData.qualities) {
          const mapped = mapQuality(q.quality || q.label || '');
          qualities[mapped] = { type: 'mp4', url: q.url };
        }
      } else {
        for (const [key, val] of Object.entries(streamData.qualities)) {
          const mapped = mapQuality(key);
          qualities[mapped] = { type: 'mp4', url: (val as any).url || val };
        }
      }

      const stream: FileBasedStream = {
        type: 'file',
        id: `${sourceId}-stream`,
        flags: [],
        captions,
        audioTracks: streamData.audioTracks,
        qualities,
      };
      options.onProgress?.({
        id: sourceId,
        percentage: 100,
        status: 'success',
      });
      return { sourceId, stream };
    }

    options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
    return null;
  } catch (error: any) {
    console.error(`[scrapeSource] ${sourceId} error:`, error);
    options.onProgress?.({ id: sourceId, percentage: 100, status: 'failure' });
    return null;
  }
}

export async function scrapeAllSources(options: ScrapeOptions): Promise<SourceResult[]> {
  const promises = SOURCES.map(async (source) => {
    if (options.excludeSources?.includes(source.id)) return null;

    if (source.id === 'febbox' && !options.febboxCookie) {
      return null;
    }

    const result = await scrapeSource(options, source.id);
    if (result) {
      options.onSourceFound?.(result);
      return result;
    } else if (source.id === 'febbox') {
      const placeholder: SourceResult = {
        sourceId: source.id,
        stream: {
          type: 'file',
          id: `${source.id}-placeholder`,
          flags: [],
          qualities: {},
          captions: [],
        },
      };
      options.onSourceFound?.(placeholder);
      return placeholder;
    }
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is SourceResult => r !== null);
}

export function getAvailableSources(): SourceMeta[] {
  return [...SOURCES];
}
