import { NextResponse } from 'next/server';

export const runtime = 'edge';

const WORKER_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://nexvid-proxy.piotrunius.workers.dev').trim().replace(/\/+$/, '');

export async function GET(req: Request) {
  console.log('[AI-Usage] Target Worker:', WORKER_URL);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${WORKER_URL}/user/ai-limits`, {
      method: 'GET',
      headers: { 
        'Authorization': authHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
        const errorText = await res.text().catch(() => 'No error body');
        console.error(`[AI-Usage] Worker Limit Error (${res.status}):`, errorText);
        const snippet = errorText.substring(0, 100).replace(/<[^>]*>/g, '').trim();
        return NextResponse.json({ 
          error: `Failed to fetch usage (Worker Status: ${res.status}${snippet ? `: ${snippet}` : ''})` 
        }, { status: res.status });
    }    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
