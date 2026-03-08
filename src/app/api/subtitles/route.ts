import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function hashSuffix(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 12);
}

interface ExternalSubtitleItem {
  url?: string;
  language?: string;
  display?: string;
  format?: string;
  fileName?: string;
  downloadCount?: number;
  isHearingImpaired?: boolean;
}

interface SubtitleTrack {
  id: string;
  url: string;
  language: string;
  type: 'srt' | 'vtt';
  label?: string;
  score: number;
}

function normalizeLanguage(input: string) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'en';
  const base = value.includes('-') ? value.split('-')[0] : value.includes('_') ? value.split('_')[0] : value;
  const compact = base.replace(/[^a-z]/g, '');
  const aliases: Record<string, string> = {
    pb: 'pt',
    br: 'pt',
    ptbr: 'pt',
    por: 'pt',
    eng: 'en',
    gb: 'en',
    us: 'en',
    ell: 'el',
    gre: 'el',
    per: 'fa',
    farsi: 'fa',
    iw: 'he',
    heb: 'he',
    jp: 'ja',
    jpn: 'ja',
    kr: 'ko',
    kor: 'ko',
    ua: 'uk',
    ukr: 'uk',
  };
  return aliases[compact] || aliases[base] || base;
}

function scoreSubtitle(item: ExternalSubtitleItem, subtitleType: 'srt' | 'vtt') {
  const downloadScore = Number(item?.downloadCount || 0);
  const hearingPenalty = item?.isHearingImpaired ? -2000 : 0;
  const format = String(item?.format || '').toLowerCase();
  const typeBoost = subtitleType === 'vtt' ? 300 : subtitleType === 'srt' ? 220 : 80;
  const subPenalty = format === 'sub' ? -1500 : 0;
  return downloadScore + hearingPenalty + typeBoost + subPenalty;
}

export async function GET(request: NextRequest) {
  const imdbId = request.nextUrl.searchParams.get('imdbId');
  const type = request.nextUrl.searchParams.get('type');
  const season = request.nextUrl.searchParams.get('season');
  const episode = request.nextUrl.searchParams.get('episode');

  if (!imdbId || !/^tt\d+$/.test(imdbId)) {
    return NextResponse.json({ error: 'Invalid imdbId' }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ id: imdbId });
    if (type === 'show') {
      if (season) query.set('season', season);
      if (episode) query.set('episode', episode);
    }

    const upstreamUrl = `https://sub.wyzie.ru/search?${query.toString()}`;
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return NextResponse.json({ subtitles: [], error: `Upstream ${upstream.status}` }, { status: 200 });
    }

    const raw = await upstream.json();
    const items: ExternalSubtitleItem[] = Array.isArray(raw) ? raw : [];

    const mapped = items
      .map((item) => {
        const originalUrl = String(item?.url || '').trim();
        if (!originalUrl) return null;

        const loweredFormat = String(item?.format || '').toLowerCase();
        const typeFromFormat: 'srt' | 'vtt' | null = loweredFormat === 'vtt'
          ? 'vtt'
          : loweredFormat === 'srt' || loweredFormat === 'sub'
            ? 'srt'
            : null;

        const typeFromUrl: 'srt' | 'vtt' | null = originalUrl.toLowerCase().includes('format=vtt') || originalUrl.toLowerCase().endsWith('.vtt')
          ? 'vtt'
          : originalUrl.toLowerCase().includes('format=srt') || originalUrl.toLowerCase().includes('format=sub') || originalUrl.toLowerCase().endsWith('.srt') || originalUrl.toLowerCase().endsWith('.sub')
            ? 'srt'
            : null;

        const subtitleType = typeFromFormat || typeFromUrl;
        if (!subtitleType) return null;

        const language = normalizeLanguage(String(item?.language || item?.display || 'en'));
        const label = String(item?.display || item?.language || item?.fileName || language.toUpperCase());
        const score = scoreSubtitle(item, subtitleType);
        const urlHash = hashSuffix(originalUrl);

        return {
          id: `wyzie-${language}-${urlHash}`,
          url: originalUrl,
          language,
          type: subtitleType,
          label,
          score,
        } as SubtitleTrack;
      })
      .filter((entry): entry is SubtitleTrack => Boolean(entry));

    const deduped = new Map<string, SubtitleTrack>();
    for (const subtitle of mapped) {
      const key = `${subtitle.language}|${subtitle.url}`;
      if (!deduped.has(key)) deduped.set(key, subtitle);
    }

    const bestPerLanguage = new Map<string, SubtitleTrack>();
    for (const subtitle of deduped.values()) {
      const existing = bestPerLanguage.get(subtitle.language);
      if (!existing || subtitle.score > existing.score) {
        bestPerLanguage.set(subtitle.language, subtitle);
      }
    }

    const preferredOrder = ['pl', 'en', 'es', 'fr', 'de', 'it', 'pt'];
    const sorted = Array.from(bestPerLanguage.values()).sort((a, b) => {
      const aPreferred = preferredOrder.indexOf(a.language);
      const bPreferred = preferredOrder.indexOf(b.language);
      if (aPreferred !== -1 || bPreferred !== -1) {
        if (aPreferred === -1) return 1;
        if (bPreferred === -1) return -1;
        if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      }
      return b.score - a.score;
    });

    const limited = sorted.slice(0, 20).map(({ score, ...subtitle }) => subtitle);

    return NextResponse.json({ subtitles: limited });
  } catch (error: any) {
    return NextResponse.json({ subtitles: [], error: error?.message || 'Failed to fetch subtitles' }, { status: 200 });
  }
}
