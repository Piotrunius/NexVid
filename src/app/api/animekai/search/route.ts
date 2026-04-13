import { animekaiSearch } from "@/lib/animekai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword")?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }
  try {
    const results = await animekaiSearch(keyword);
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Search failed" },
      { status: 500 },
    );
  }
}
