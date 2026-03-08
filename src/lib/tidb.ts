/* ============================================
   TheIntroDB (TIDB) v2 Client
   https://theintrodb.org/docs
   ============================================ */

export interface Segment {
  startMs: number;
  endMs: number;
  confidence?: number;
  submissionCount?: number;
}

export interface MediaSegments {
  intro: Segment[];
  recap: Segment[];
  credits: Segment[];
  preview: Segment[];
}

const TIDB_V2_BASE = 'https://api.theintrodb.org/v2';
const SEGMENTS_CACHE_TTL_MS = 30 * 60 * 1000;
const segmentsCache = new Map<string, { value: MediaSegments | null; expiresAt: number }>();
const inflightSegments = new Map<string, Promise<MediaSegments | null>>();

function toCacheKey(params: { tmdbId: string; type: 'movie' | 'show'; season?: number; episode?: number }) {
  return `${params.type}:${params.tmdbId}:${params.season ?? 0}:${params.episode ?? 0}`;
}

export async function getMediaSegments(params: {
  tmdbId: string;
  type: 'movie' | 'show';
  season?: number;
  episode?: number;
}): Promise<MediaSegments | null> {
  const cacheKey = toCacheKey(params);
  const cached = segmentsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = inflightSegments.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    try {
      const url = new URL(`${TIDB_V2_BASE}/media`);
      url.searchParams.set('tmdb_id', params.tmdbId);
      url.searchParams.set('type', params.type === 'show' ? 'tv' : 'movie');
      if (params.type === 'show' && params.season != null) {
        url.searchParams.set('season', String(params.season));
      }
      if (params.type === 'show' && params.episode != null) {
        url.searchParams.set('episode', String(params.episode));
      }

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(7000),
        cache: 'no-store',
      });
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || typeof data !== 'object') return null;

      const value: MediaSegments = {
        intro: normalizeSegments((data as any).intro),
        recap: normalizeSegments((data as any).recap),
        credits: normalizeSegments((data as any).credits),
        preview: normalizeSegments((data as any).preview),
      };

      return value;
    } catch {
      return null;
    } finally {
      inflightSegments.delete(cacheKey);
    }
  })();

  inflightSegments.set(cacheKey, request);
  const result = await request;
  segmentsCache.set(cacheKey, { value: result, expiresAt: Date.now() + SEGMENTS_CACHE_TTL_MS });
  return result;
}

function normalizeSegments(raw: any): Segment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => s && (s.start_ms != null || s.startMs != null))
    .map((s: any) => ({
      startMs: s.start_ms ?? s.startMs ?? 0,
      endMs: s.end_ms ?? s.endMs ?? 0,
      confidence: s.confidence,
      submissionCount: s.submission_count ?? s.submissionCount,
    }));
}

// ---- Submit segment (requires API key) ----

export interface SubmitSegmentParams {
  apiKey: string;
  tmdbId: string;
  type: 'movie' | 'show';
  segment: 'intro' | 'recap' | 'credits' | 'preview';
  startSec: number;
  endSec: number;
  season?: number;
  episode?: number;
  imdbId?: string;
}

export interface SubmitSegmentResult {
  ok: boolean;
  submission?: {
    id: string;
    status: string;
    weight: number;
  };
  error?: string;
}

export async function submitSegment(params: SubmitSegmentParams): Promise<SubmitSegmentResult> {
  try {
    const body: Record<string, any> = {
      tmdb_id: Number(params.tmdbId),
      type: params.type === 'movie' ? 'movie' : 'tv',
      segment: params.segment,
      start_sec: params.startSec,
      end_sec: params.endSec,
    };
    if (params.type === 'show' && params.season != null) body.season = params.season;
    if (params.type === 'show' && params.episode != null) body.episode = params.episode;
    if (params.imdbId) body.imdb_id = params.imdbId;

    const res = await fetch(`${TIDB_V2_BASE}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data?.ok) {
      return { ok: true, submission: data.submission };
    }
    return { ok: false, error: data?.message || data?.error || 'Unknown error' };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// Legacy wrapper for old code (IntroOutro format)
export async function getIntroOutro(params: {
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
}): Promise<{ introStart?: number; introEnd?: number; outroStart?: number; outroEnd?: number } | null> {
  if (!params.tmdbId) return null;
  const segments = await getMediaSegments({
    tmdbId: params.tmdbId,
    type: params.season != null ? 'show' : 'movie',
    season: params.season,
    episode: params.episode,
  });
  if (!segments) return null;

  return {
    introStart: segments.intro[0]?.startMs != null ? segments.intro[0].startMs / 1000 : undefined,
    introEnd: segments.intro[0]?.endMs != null ? segments.intro[0].endMs / 1000 : undefined,
    outroStart: segments.credits[0]?.startMs != null ? segments.credits[0].startMs / 1000 : undefined,
    outroEnd: segments.credits[0]?.endMs != null ? segments.credits[0].endMs / 1000 : undefined,
  };
}
