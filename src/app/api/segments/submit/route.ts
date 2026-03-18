import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const TIDB_V2_BASE = 'https://api.theintrodb.org/v2';
const PUBLIC_TIDB_API_KEY_PLACEHOLDER = '__PUBLIC_TIDB_KEY__';
// NOTE: This is a public (shared) key that is intentionally hardcoded so that
// users can submit segments without needing to supply their own API key.
// The client-side UI should still show the placeholder value to end users.
const PUBLIC_TIDB_API_KEY_HARDCODED =
  'theintrodb:user_3B7cSOVdPMaOgNF64iugv4b6yj5:ilo_pdil6Ojt-S_NHOy9K8-RrHTiLoLPPECA7HbbgQM';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, tmdb_id, type, segment, start_sec, end_sec, season, episode, imdb_id } = body;

    let effectiveApiKey = apiKey;
    if (apiKey === PUBLIC_TIDB_API_KEY_PLACEHOLDER || !apiKey) {
      // Use the hardcoded public key when the client is using the placeholder.
      // This keeps the placeholder visible on the client, but still allows submissions.
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
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
