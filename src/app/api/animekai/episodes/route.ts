import { animekaiEpisodes } from "@/lib/animekai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const aniId = req.nextUrl.searchParams.get("aniId")?.trim();
  if (!aniId) {
    return NextResponse.json({ error: "aniId is required" }, { status: 400 });
  }
  try {
    const episodes = await animekaiEpisodes(aniId);
    return NextResponse.json({ success: true, count: episodes.length, episodes });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Episodes fetch failed" },
      { status: 500 },
    );
  }
}
