import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function normalizeBaseUrl(input: string): string | null {
  const trimmed = String(input || '')
    .trim()
    .replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') || '';
  const base = normalizeBaseUrl(rawUrl);

  if (!base) {
    return NextResponse.json({ ok: false, error: 'Invalid proxy URL' }, { status: 400 });
  }

  const paths = ['/health', '/'];
  const attempts: Array<{
    path: string;
    status?: number;
    ok: boolean;
    error?: string;
  }> = [];

  for (const path of paths) {
    const target = `${base}${path === '/' ? '' : path}`;
    try {
      const response = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': 'NexVid-Proxy-Tester/1.0',
        },
      });

      attempts.push({ path, status: response.status, ok: response.ok });

      if (response.ok) {
        return NextResponse.json({
          ok: true,
          path,
          status: response.status,
          attempts,
        });
      }
    } catch (error: any) {
      attempts.push({
        path,
        ok: false,
        error: error?.message || 'Network error',
      });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: 'Proxy did not respond with OK on /health or /',
      attempts,
    },
    { status: 502 },
  );
}
