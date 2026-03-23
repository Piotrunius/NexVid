import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  // Return unlimited usage mock to satisfy frontend
  return NextResponse.json({ 
    count: 0, 
    limit: 999999,
    remaining: 999999
  });
}
