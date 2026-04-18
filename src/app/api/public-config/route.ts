import { isRequestFromAllowedSite } from '@/lib/request-verification';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  if (!isRequestFromAllowedSite(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const turnstileSiteKey = String(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '',
  ).trim();
  return NextResponse.json(
    { turnstileSiteKey },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
