import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const TIDB_V2_BASE = 'https://api.theintrodb.org/v2';
const PUBLIC_TIDB_API_KEY_PLACEHOLDER = '__PUBLIC_TIDB_KEY__';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const body = await request.json();
    const { apiKey, tmdb_id, type, segment, start_sec, end_sec, season, episode, imdb_id } = body;

    let effectiveApiKey = apiKey;
    if (apiKey === PUBLIC_TIDB_API_KEY_PLACEHOLDER || !apiKey) {
      // Verify session
      let isValidSession = false;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const baseUrl = process.env.APP_BASE_URL || new URL(request.url).origin;
          const meRes = await fetch(`${baseUrl}/api/proxy-health`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
          });
          if (meRes.ok) isValidSession = true;
        } catch {
          isValidSession = false;
        }
      }

      if (isValidSession) {
        effectiveApiKey = process.env.TIDB_API_KEY;
      } else {
        return NextResponse.json({ ok: false, error: 'Authorization required to use public key' }, { status: 401 });
      }
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
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
