import { NextRequest, NextResponse } from 'next/server';
import { isValidCloudSession } from '@/lib/auth-server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface Segment {
  startMs: number;
  endMs: number;
  confidence?: number;
  submissionCount?: number;
}

interface MediaSegments {
  intro: Segment[];
  recap: Segment[];
  credits: Segment[];
  preview: Segment[];
}

const EMPTY_SEGMENTS: MediaSegments = {
  intro: [],
  recap: [],
  credits: [],
  preview: [],
};

const cache = new Map<string, { expiresAt: number; value: { segments: MediaSegments; error?: string } }>();
const inflight = new Map<string, Promise<{ segments: MediaSegments; error?: string }>>();

function normalizeSegments(raw: any): Segment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => s && (s.start_ms != null || s.startMs != null))
    .map((s: any) => ({
      startMs: Number(s.start_ms ?? s.startMs ?? 0),
      endMs: Number(s.end_ms ?? s.endMs ?? 0),
      confidence: s.confidence != null ? Number(s.confidence) : undefined,
      submissionCount: s.submission_count ?? s.submissionCount,
    }))
    .filter((s: Segment) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs));
}

export async function GET(request: NextRequest) {
  const tmdbId = request.nextUrl.searchParams.get('tmdbId');
  const type = request.nextUrl.searchParams.get('type');
  const season = request.nextUrl.searchParams.get('season');
  const episode = request.nextUrl.searchParams.get('episode');

  if (!tmdbId || !/^\d+$/.test(tmdbId)) {
    return NextResponse.json({ segments: EMPTY_SEGMENTS, error: 'Invalid tmdbId' }, { status: 400 });
  }
  if (type !== 'movie' && type !== 'show') {
    return NextResponse.json({ segments: EMPTY_SEGMENTS, error: 'Invalid type' }, { status: 400 });
  }

  const cacheKey = `${type}:${tmdbId}:${season || '0'}:${episode || '0'}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value, { status: 200 });
  }

  const pending = inflight.get(cacheKey);
  if (pending) {
    const value = await pending;
    return NextResponse.json(value, { status: 200 });
  }

  const requestPromise = (async () => {
    try {
      const upstream = new URL('https://api.theintrodb.org/v2/media');
      upstream.searchParams.set('tmdb_id', tmdbId);
      upstream.searchParams.set('type', type === 'show' ? 'tv' : 'movie');
      if (type === 'show' && season) upstream.searchParams.set('season', season);
      if (type === 'show' && episode) upstream.searchParams.set('episode', episode);

      const providedApiKey = request.headers.get('x-introdb-api-key')?.trim();
      let apiKey = providedApiKey;

      if (providedApiKey === '__PUBLIC_TIDB_KEY__' || !providedApiKey) {
        // Verify session for public key use
        const isValidSession = await isValidCloudSession(request);

        if (isValidSession) {
          apiKey = process.env.TIDB_API_KEY;
        } else {
          apiKey = undefined; // No key for anonymous if no custom key provided
        }
      }
      const res = await fetch(upstream.toString(), {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data || typeof data !== 'object' || data.error) {
        const errorMessage = String(data?.error || data?.message || `Upstream ${res.status}`);
        const value = { segments: EMPTY_SEGMENTS, error: errorMessage };
        cache.set(cacheKey, { value, expiresAt: Date.now() + 2 * 60 * 1000 });
        return value;
      }

      const segments: MediaSegments = {
        intro: normalizeSegments(data.intro),
        recap: normalizeSegments(data.recap),
        credits: normalizeSegments(data.credits),
        preview: normalizeSegments(data.preview),
      };

      const hasAny = segments.intro.length || segments.recap.length || segments.credits.length || segments.preview.length;
      const ttl = hasAny ? 30 * 60 * 1000 : 5 * 60 * 1000;
      const value = { segments };
      cache.set(cacheKey, { value, expiresAt: Date.now() + ttl });
      return value;
    } catch (error: any) {
      const value = { segments: EMPTY_SEGMENTS, error: String(error?.message || 'Failed to fetch segments') };
      cache.set(cacheKey, { value, expiresAt: Date.now() + 60 * 1000 });
      return value;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, requestPromise);
  const value = await requestPromise;
  return NextResponse.json(value, { status: 200 });
}
