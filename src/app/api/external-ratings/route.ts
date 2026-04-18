import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imdbId = searchParams.get('i');
  const title = searchParams.get('t');
  const year = searchParams.get('y');
  const userApiKey = searchParams.get('apikey');

  // Robust key selection
  let apiKey = userApiKey?.trim();
  if (!apiKey || apiKey === '__PUBLIC_OMDB_KEY__' || apiKey === 'undefined' || apiKey === 'null') {
    apiKey = (process.env.OMDB_API_KEY || '').trim();
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'OMDB API key not configured' }, { status: 500 });
  }

  try {
    // 1. First try by IMDb ID (most precise)
    const url1 = new URL('https://www.omdbapi.com/');
    url1.searchParams.set('i', imdbId || '');
    url1.searchParams.set('apikey', apiKey);
    url1.searchParams.set('plot', 'short');

    let res = await fetch(url1.toString());
    let data = await res.json();

    // 2. Fallback to Title + Year if ID search yielded only IMDb or nothing (common for series)
    const hasOnlyImdb =
      data.Response === 'True' &&
      (!data.Ratings || data.Ratings.length <= 1) &&
      (!data.Metascore || data.Metascore === 'N/A');

    if ((data.Response === 'False' || hasOnlyImdb) && title) {
      const url2 = new URL('https://www.omdbapi.com/');
      url2.searchParams.set('t', title);
      if (year) url2.searchParams.set('y', String(year));
      url2.searchParams.set('apikey', apiKey);

      const fallbackRes = await fetch(url2.toString());
      const fallbackData = await fallbackRes.json();

      if (fallbackData.Response === 'True') {
        const fallbackHasMore =
          fallbackData.Ratings && fallbackData.Ratings.length > (data.Ratings?.length || 0);
        if (fallbackHasMore || data.Response === 'False') {
          data = fallbackData;
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('OMDB Proxy Error:', error);
    return NextResponse.json({ error: 'Failed to fetch from OMDB' }, { status: 500 });
  }
}
