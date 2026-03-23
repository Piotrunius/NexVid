import { NextResponse } from 'next/server';

export const runtime = 'edge';

const WORKER_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://nexvid-proxy.piotrunius.workers.dev').replace(/\/+$/, '');

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    // Try cookie if header missing
    // But usually frontend sends header.
    // Let's assume frontend sends header for now as it does for other endpoints.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${WORKER_URL}/user/ai-limits`, {
      method: 'GET',
      headers: { 'Authorization': authHeader }
    });
    
    if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch usage' }, { status: res.status });
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
