import { NextRequest, NextResponse } from 'next/server';
import { searchSubtitles, configure } from 'wyzie-lib';

// Edge Runtime is required for Cloudflare Pages
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Use the latest stable domain
configure({ baseUrl: 'https://sub.wyzie.io' });

function hashSuffix(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 12);
}

function normalizeLanguage(input: string) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'en';
  const base = value.includes('-') ? value.split('-')[0] : value.includes('_') ? value.split('_')[0] : value;
  const compact = base.replace(/[^a-z]/g, '');
  const aliases: Record<string, string> = {
    pb: 'pt', br: 'pt', ptbr: 'pt', por: 'pt',
    eng: 'en', gb: 'en', us: 'en',
    ell: 'el', gre: 'el',
    per: 'fa', farsi: 'fa',
    iw: 'he', heb: 'he',
    jp: 'ja', jpn: 'ja',
    kr: 'ko', kor: 'ko',
    ua: 'uk', ukr: 'uk',
  };
  return aliases[compact] || aliases[base] || base;
}

export async function GET(request: NextRequest) {
  const imdbId = request.nextUrl.searchParams.get('imdbId');
  const tmdbId = request.nextUrl.searchParams.get('tmdbId');
  const type = request.nextUrl.searchParams.get('type');
  const season = request.nextUrl.searchParams.get('season');
  const episode = request.nextUrl.searchParams.get('episode');

  if (!imdbId && !tmdbId) {
    return NextResponse.json({ subtitles: [], error: 'Missing ID' }, { status: 200 });
  }

  try {
    const params: any = {
      source: 'opensubtitles',
      key: process.env.WYZIE_KEY,
    };

    if (imdbId && imdbId !== 'undefined' && imdbId !== 'null' && imdbId.startsWith('tt')) {
      params.imdb_id = imdbId;
    } else {
      const tmdbIdNum = tmdbId ? parseInt(tmdbId, 10) : NaN;
      if (!isNaN(tmdbIdNum)) {
        params.tmdb_id = tmdbIdNum;
      } else if (imdbId && imdbId !== 'undefined' && imdbId !== 'null') {
        params.imdb_id = imdbId;
      } else {
        return NextResponse.json({ subtitles: [], error: 'Invalid ID format' });
      }
    }

    if (type === 'show' && season && episode) {
      params.season = parseInt(season, 10);
      params.episode = parseInt(episode, 10);
    }

    let results;
    try {
      results = await searchSubtitles(params);
    } catch (e) {
      params.source = 'all';
      results = await searchSubtitles(params);
    }
    
    if (!Array.isArray(results) || results.length === 0) {
      if (params.source !== 'all') {
        params.source = 'all';
        results = await searchSubtitles(params);
      }
    }
    
    const items = Array.isArray(results) ? results : [];

    const mapped = items
      .map((item: any) => {
        const url = String(item?.url || '').trim();
        if (!url) return null;

        const lang = normalizeLanguage(String(item?.language || item?.display || 'en'));
        const label = String(item?.display || item?.fileName || item?.release || lang.toUpperCase());

        return {
          id: `wyzie-${lang}-${hashSuffix(url)}`,
          url,
          language: lang,
          type: (url.toLowerCase().includes('format=vtt') || url.toLowerCase().includes('.vtt')) ? 'vtt' : 'srt',
          label: label,
          flagUrl: item?.flagUrl || null,
          isHearingImpaired: Boolean(item?.isHearingImpaired)
        };
      })
      .filter(Boolean);

    const best = new Map();
    for (const s of mapped) {
      if (!s) continue;
      const existing = best.get(s.language);
      if (!existing || (existing.isHearingImpaired && !s.isHearingImpaired)) {
        best.set(s.language, s);
      }
    }

    const preferred = ['pl', 'en', 'es', 'fr', 'de', 'it', 'ja'];
    const sorted = Array.from(best.values())
      .sort((a, b) => {
        const pa = preferred.indexOf(a.language);
        const pb = preferred.indexOf(b.language);
        if (pa !== -1 || pb !== -1) {
          if (pa === -1) return 1;
          if (pb === -1) return -1;
          return pa - pb;
        }
        return (a.label || '').localeCompare(b.label || '');
      })
      .slice(0, 50);

    return NextResponse.json(
      { subtitles: sorted },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );

  } catch (error: any) {
    return NextResponse.json({ subtitles: [], error: error?.message || 'Subtitle search failed' }, { status: 200 });
  }
}
