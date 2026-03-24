import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imdbId = searchParams.get('i');
  const title = searchParams.get('t');
  const year = searchParams.get('y');
  const userApiKey = searchParams.get('apikey');

  const apiKey = (!userApiKey || userApiKey === '__PUBLIC_OMDB_KEY__') 
    ? (process.env.OMDB_API_KEY || process.env.NEXT_PUBLIC_OMDB_API_KEY)
    : userApiKey;

  if (!apiKey) {
    return NextResponse.json({ error: 'OMDB API key not configured' }, { status: 500 });
  }

  try {
    // 1. First try by IMDb ID (most precise)
    let apiUrl = `https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}&plot=short`;
    let res = await fetch(apiUrl);
    let data = await res.json();

    // 2. Fallback to Title + Year if ID search yielded only IMDb or nothing (common for series)
    const hasOnlyImdb = data.Response === 'True' && 
                       (!data.Ratings || data.Ratings.length <= 1) && 
                       (!data.Metascore || data.Metascore === 'N/A');

    if ((data.Response === 'False' || hasOnlyImdb) && title) {
      const fallbackUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year || ''}&apikey=${apiKey}`;
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      
      if (fallbackData.Response === 'True') {
        // Merge or replace if fallback is better
        const fallbackHasMore = (fallbackData.Ratings && fallbackData.Ratings.length > (data.Ratings?.length || 0));
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
