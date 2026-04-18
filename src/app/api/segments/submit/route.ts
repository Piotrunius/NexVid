import { NextRequest, NextResponse } from 'next/server';
import { isValidCloudSession } from '@/lib/auth-server';

export const runtime = 'edge';

const TIDB_V2_BASE = 'https://api.theintrodb.org/v2';
const PUBLIC_TIDB_API_KEY_PLACEHOLDER = '__PUBLIC_TIDB_KEY__';
const PUBLIC_TIDB_API_KEY_HARDCODED = process.env.TIDB_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, tmdb_id, type, segment, start_sec, end_sec, season, episode, imdb_id } = body;

    let effectiveApiKey = apiKey;
    const isUsingPublicPlaceholder = apiKey === PUBLIC_TIDB_API_KEY_PLACEHOLDER || !apiKey;

    if (isUsingPublicPlaceholder) {
      // REQUIRE a valid session for using the shared/public TIDB key
      const isAuthorized = await isValidCloudSession(request);
      if (!isAuthorized) {
        return NextResponse.json(
          { ok: false, error: 'Authentication required to submit segments.' },
          { status: 401 },
        );
      }
      effectiveApiKey = PUBLIC_TIDB_API_KEY_HARDCODED;
    }

    if (!effectiveApiKey) {
      return NextResponse.json({ ok: false, error: 'No API key provided' }, { status: 400 });
    }

    const upstreamBody: Record<string, any> = {
      tmdb_id,
      type,
      segment,
      start_sec,
      end_sec,
    };
    if (season != null) upstreamBody.season = season;
    if (episode != null) upstreamBody.episode = episode;
    if (imdb_id) upstreamBody.imdb_id = imdb_id;

    const res = await fetch(`${TIDB_V2_BASE}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await res.json();

    // Sanitize upstream errors to avoid revealing validation details (prevents abuse automation)
    if (!res.ok) {
      const upstreamError = String(data?.error || '').toLowerCase();

      // Generic "Invalid data" for validation errors like overlaps/limits/tmdb checks
      if (
        upstreamError.includes('overlap') ||
        upstreamError.includes('tmdb') ||
        upstreamError.includes('validation')
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Submission failed: Invalid segment data or timing conflict.',
          },
          { status: 400 },
        );
      }

      // Preserve status but use generic error if not handled
      return NextResponse.json(
        { ok: false, error: data?.error || 'Failed to submit segment' },
        { status: res.status },
      );
    }

    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('[SegmentsSubmit] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Submission failed due to a server error.' },
      { status: 500 },
    );
  }
}
