import { animekaiAnimeInfo } from "@/lib/animekai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  try {
    const info = await animekaiAnimeInfo(slug);
    return NextResponse.json({ success: true, ...info });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Info fetch failed" },
      { status: 500 },
    );
  }
}
