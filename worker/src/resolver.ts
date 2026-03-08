export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const target = String(url.searchParams.get('url') || '').trim();

    if (!/^https?:\/\//i.test(target)) {
      return new Response('Missing or invalid URL', { status: 400 });
    }

    const upstreamRequest = new Request(target, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0',
        Referer: 'https://vidlink.pro/',
        Origin: 'https://vidlink.pro',
        Accept: '*/*',
      },
    });

    const upstream = await fetch(upstreamRequest);
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Vary', 'Origin');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
