import { animekaiSource } from "@/lib/animekai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const linkId = req.nextUrl.searchParams.get("linkId")?.trim();
  if (!linkId) {
    return NextResponse.json({ error: "linkId is required" }, { status: 400 });
  }
  try {
    const result = await animekaiSource(linkId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Source resolution failed" },
      { status: 500 },
    );
  }
}
