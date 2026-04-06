import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
  return NextResponse.json({ turnstileSiteKey }, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}
