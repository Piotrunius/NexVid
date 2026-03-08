import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CANONICAL_HOST = (process.env.NEXT_PUBLIC_CANONICAL_HOST || 'nexvid.online').toLowerCase();
const REDIRECT_HOSTS = new Set(['nexvid.pl', 'www.nexvid.pl', 'www.nexvid.online']);

export function middleware(request: NextRequest) {
  const hostHeader = request.headers.get('host') || '';
  const host = hostHeader.split(':')[0].toLowerCase();

  if (!host || host === CANONICAL_HOST) {
    return NextResponse.next();
  }

  if (!REDIRECT_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.protocol = 'https';
  targetUrl.host = CANONICAL_HOST;

  return NextResponse.redirect(targetUrl, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
