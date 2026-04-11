import { NextResponse, NextRequest } from "next/server";
import { isValidCloudSession } from "@/lib/auth-server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const isAuthorized = await isValidCloudSession(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // Return unlimited usage mock to satisfy frontend
  return NextResponse.json({
    count: 0,
    limit: 999999,
    remaining: 999999,
  });
}
