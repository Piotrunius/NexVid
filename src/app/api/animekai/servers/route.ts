import { animekaiServers } from "@/lib/animekai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const epToken = req.nextUrl.searchParams.get("epToken")?.trim();
  if (!epToken) {
    return NextResponse.json({ error: "epToken is required" }, { status: 400 });
  }
  try {
    const result = await animekaiServers(epToken);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Servers fetch failed" },
      { status: 500 },
    );
  }
}
