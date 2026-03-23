import { NextResponse } from 'next/server';

export const runtime = 'edge';

const WORKER_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://nexvid-proxy.piotrunius.workers.dev').trim().replace(/\/+$/, '');

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Forward the request to the Worker's consolidated AI endpoint
    const res = await fetch(`${WORKER_URL}/ai/recommend`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'X-NexVid-Activity': 'internal-api'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || `AI Assistant Error (${res.status})` }, 
        { status: res.status === 429 ? 429 : 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('AI Proxy Error:', error);
    return NextResponse.json({ error: 'Server Connection Error' }, { status: 500 });
  }
}
