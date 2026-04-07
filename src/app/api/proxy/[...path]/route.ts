import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const WORKER_URL = (process.env.API_URL || 'https://nexvid-proxy.piotrunius.workers.dev').replace(/\/+$/, '');

export async function ANY(req: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const path = params.path ? params.path.join('/') : '';
    const searchParams = req.nextUrl.search;
    const targetUrl = `${WORKER_URL}/${path}${searchParams}`;

    // Read token from the protected cookie
    const cookieToken = req.cookies.get('nexvid_session')?.value;
    const authHeader = req.headers.get('Authorization');
    
    // Check if the user has a legacy token stored in localstorage
    const isLegacyToken = !cookieToken && authHeader && authHeader.startsWith('Bearer ') && authHeader !== 'Bearer server-proxy-token';
    const legacyTokenStr = isLegacyToken ? authHeader.substring(7) : null;

    const headers = new Headers(req.headers);
    // Security: Host and Origin must be reset
    headers.set('Host', new URL(WORKER_URL).host);
    headers.delete('Cookie'); // Remove frontend cookies for purity

    if (cookieToken) {
      // Replace the dummy token with the real one from the cookie (new system)
      headers.set('Authorization', `Bearer ${cookieToken}`);
    } else if (!isLegacyToken) {
      // If it's a dummy token or an error, and the cookie is missing - strip the Bearer.
      headers.delete('Authorization');
    } // If isLegacyToken == true, KEEP the old Bearer to help with seamless migration!

    // Proxy request to the Worker
    const init: RequestInit = {
      method: req.method,
      headers,
      redirect: 'manual',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.text();
    }

    const workerResponse = await fetch(targetUrl, init);

    // Clone Worker response
    const responseHeaders = new Headers(workerResponse.headers);

    // [MOD] Seamless Session Migration
    if (isLegacyToken && workerResponse.ok) {
      // If a request with a legacy token was sent and the Worker approved it,
      // reward the user by migrating their session from insecure localStorage to a live Cookie.
      responseHeaders.set('X-Token-Migrated', 'server-proxy-token');
      // Control is intercepted here to edit cookies!
    }
    
    if ((path === 'auth/login' || path === 'auth/register' || path === 'auth/change-password') && workerResponse.ok) {
      const data = await workerResponse.json();
      
      if (data.token) {
        const tokenVal = data.token;
        data.token = 'server-proxy-token'; // Dummy - the client gets a safe truncated token "knowing" it is logged in
        
        const newResponse = NextResponse.json(data, {
          status: workerResponse.status,
          headers: responseHeaders,
        });

        // Set HttpOnly cookie for the entire frontend
        newResponse.cookies.set('nexvid_session', tokenVal, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV !== 'development',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });
        
        return newResponse;
      }

      return NextResponse.json(data, {
        status: workerResponse.status,
        headers: responseHeaders,
      });
    }

    // Handle logout
    if (path === 'auth/logout') {
      const resp = new NextResponse(workerResponse.body, {
        status: workerResponse.status,
        headers: responseHeaders,
      });
      resp.cookies.delete('nexvid_session');
      return resp;
    }

    // Forward the default response
    const finalResp = new NextResponse(workerResponse.body, {
      status: workerResponse.status,
      statusText: workerResponse.statusText,
      headers: responseHeaders,
    });

    if (isLegacyToken && workerResponse.ok && legacyTokenStr) {
        finalResp.cookies.set('nexvid_session', legacyTokenStr, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV !== 'development',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });
    }

    return finalResp;
  } catch (err: any) {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}

export const GET = ANY;
export const POST = ANY;
export const PUT = ANY;
export const DELETE = ANY;
export const PATCH = ANY;
