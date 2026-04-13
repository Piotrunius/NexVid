import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * GET /api/anikuro/source?anilistId=33&server=animez&ep=2&mode=sub
 *
 * Proxies to: https://anikuro.to/api/getsources/?id={anilistId}&lol={server}&ep={ep}
 *
 * Real response shape from anikuro.to:
 * {
 *   sub: { default: "...m3u8", tracks: [{ url, kind, lang }], intro, outro, referer },
 *   dub: { default: "...m3u8", tracks: [...], intro, outro, referer }
 * }
 *
 * Valid servers: animez | allani | animekai | anigg
 */
const ANIKURO_SERVERS = ["animekai"] as const;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const anilistId = searchParams.get("anilistId")?.trim();
  const server = searchParams.get("server")?.trim() as string | null;
  const ep = searchParams.get("ep")?.trim();
  const mode = (searchParams.get("mode")?.trim() ?? "sub") as "sub" | "dub";

  if (!anilistId) {
    return NextResponse.json({ error: "anilistId is required" }, { status: 400 });
  }
  if (!ep) {
    return NextResponse.json({ error: "ep is required" }, { status: 400 });
  }

  // Determine which server(s) to try
  const serversToTry: string[] = server && ANIKURO_SERVERS.includes(server as any)
    ? [server]
    : [...ANIKURO_SERVERS];

  let lastError = "No source found";

  for (const srv of serversToTry) {
    try {
      const url = `https://anikuro.to/api/getsources/?id=${encodeURIComponent(anilistId)}&lol=${srv}&ep=${encodeURIComponent(ep)}`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://anikuro.to/",
          Accept: "application/json, text/plain, */*",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        lastError = `Server ${srv} returned ${res.status}`;
        continue;
      }

      const data = await res.json();

      // Actual shape: { sub: { default, tracks, intro, outro, referer } | "...url...", dub: ... }
      // Pick requested mode, fallback dub→sub if dub unavailable
      const preferred = data[mode];
      const fallback = mode === "dub" ? (data["sub"] ?? null) : null;
      const modeData = preferred ?? fallback;

      if (!modeData) {
        lastError = `Server ${srv}: no ${mode} stream available`;
        continue;
      }

      let playlist: string;
      let referer: string | undefined = undefined;
      let rawTracks: Array<{ url?: string; file?: string; kind?: string; lang?: string; label?: string }> = [];
      let intro: any = null;
      let outro: any = null;

      if (typeof modeData === "string") {
        playlist = modeData;
      } else if (typeof modeData === "object") {
        const potentialPlaylist = modeData.default || modeData.file || modeData.preferred?.url || (modeData.sources && Object.values(modeData.sources)[0] && (Object.values(modeData.sources)[0] as any).url);
        if (potentialPlaylist) {
          playlist = potentialPlaylist;
          referer = modeData.referer ?? undefined;
          rawTracks = Array.isArray(modeData.tracks) ? modeData.tracks : [];
          intro = modeData.intro ?? null;
          outro = modeData.outro ?? null;
        } else {
          lastError = `Server ${srv}: invalid stream format (no playlist found in object)`;
          continue;
        }
      } else {
        lastError = `Server ${srv}: invalid stream format`;
        continue;
      }

      // Normalise tracks: anikuro uses { url, kind, lang } or { file, kind, label } — map to { file, kind, label }
      const tracks = rawTracks.map((t) => ({
        file: t.url || t.file || "",
        kind: t.kind || "captions",
        label: t.lang || t.label || "English",
      })).filter(t => t.file);

      const headers: Record<string, string> | undefined = referer
        ? { Referer: referer }
        : undefined;

      return NextResponse.json(
        {
          success: true,
          server: srv,
          mode: preferred ? mode : "sub",
          playlist,
          tracks,
          skip: {
            intro,
            outro,
          },
          headers,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      continue;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
