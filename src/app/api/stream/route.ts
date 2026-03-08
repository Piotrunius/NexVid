/* ============================================
   Stream Resolution API Route
   Resolves TMDB title → FebBox video URLs
   ============================================ */

import { getFebBoxToken, resolveStream } from '@/lib/showbox';
import { getMovieDetails, getShowDetails } from '@/lib/tmdb';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

function normalizeType(rawType: string | null, season?: number, episode?: number): 'movie' | 'show' | null {
  const value = String(rawType || '').trim().toLowerCase();
  if (value === 'movie' || value === 'film') return 'movie';
  if (value === 'show' || value === 'tv' || value === 'series' || value === 'serial') return 'show';
  if (typeof season === 'number' || typeof episode === 'number') return 'show';
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : undefined;
  const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!, 10) : undefined;
  const sourceMode = String(searchParams.get('source') || searchParams.get('prefer') || 'auto').trim().toLowerCase();
  const normalizedSourceMode = sourceMode || 'auto';
  const tryFebbox = normalizedSourceMode === 'auto' || normalizedSourceMode === 'febbox';

  const tmdbId = searchParams.get('tmdbId') || searchParams.get('id') || searchParams.get('tmdb') || '';
  const type = normalizeType(searchParams.get('type') || searchParams.get('mediaType'), season, episode);

  let title = (searchParams.get('title') || searchParams.get('name') || searchParams.get('q') || '').trim();
  if (!title && tmdbId && type) {
    try {
      if (type === 'movie') {
        const movie = await getMovieDetails(tmdbId);
        title = String(movie?.title || '').trim();
      } else {
        const show = await getShowDetails(tmdbId);
        title = String(show?.title || '').trim();
      }
    } catch {
      // ignore TMDB fallback errors and validate below
    }
  }

  if (!tmdbId || !type || !title) {
    return NextResponse.json({
      error: 'Missing required params',
      required: ['tmdbId|id', 'type (movie|show|tv)', 'title|name'],
      received: {
        tmdbId: Boolean(tmdbId),
        type: type || null,
        title: Boolean(title),
        season,
        episode,
      },
    }, { status: 400 });
  }

  // UI cookie can come from client settings header or server env
  const headerCookie = request.headers.get('x-febbox-cookie') || '';
  const uiCookie = headerCookie || process.env.FEBBOX_UI_COOKIE || '';

  try {
    if (!tryFebbox) {
      return NextResponse.json({
        success: false,
        error: 'No streams found',
        logs: [{ step: 'febbox', status: 'fail', detail: `Source mode "${normalizedSourceMode}" disabled (FebBox-only mode)` }],
        diagnostics: { usingFebboxCookie: Boolean(uiCookie), source: normalizedSourceMode },
      });
    }

    const febboxResult = await resolveStream({
      title,
      tmdbId,
      type,
      season,
      episode,
      uiCookie: uiCookie || undefined,
    });

    if (!febboxResult.stream || febboxResult.stream.qualities.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No streams found',
        logs: febboxResult.logs,
        diagnostics: { usingFebboxCookie: Boolean(uiCookie), source: 'febbox' },
      });
    }

    return NextResponse.json({
      success: true,
      data: febboxResult.stream,
      logs: febboxResult.logs,
      diagnostics: { usingFebboxCookie: Boolean(uiCookie), source: 'febbox' },
    });
  } catch (error: any) {
    console.error('Stream resolution error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// POST /api/stream — validate FebBox token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'validate-febbox') {
      const clientId = process.env.FEBBOX_CLIENT_ID || body.clientId || '';
      const clientSecret = process.env.FEBBOX_CLIENT_SECRET || body.clientSecret || '';
      if (!clientId || !clientSecret) {
        return NextResponse.json({ valid: false, error: 'Missing FebBox credentials' });
      }
      const tokenRes = await getFebBoxToken(clientId, clientSecret);
      if (tokenRes.code === 1 && tokenRes.data?.access_token) {
        return NextResponse.json({
          valid: true,
          expiresIn: tokenRes.data.expires_in,
          tokenType: tokenRes.data.token_type,
        });
      }
      return NextResponse.json({ valid: false, error: tokenRes.msg });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
