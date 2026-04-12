import { NextRequest, NextResponse } from "next/server";
import { configure, searchSubtitles } from "wyzie-lib";

// Edge Runtime is required for Cloudflare Pages
export const runtime = "edge";
export const dynamic = "force-dynamic";

// Use the latest stable domain
configure({ baseUrl: "https://sub.wyzie.io" });

function hashSuffix(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 12);
}

function normalizeLanguage(input: string) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return "en";
  const base = value.includes("-")
    ? value.split("-")[0]
    : value.includes("_")
      ? value.split("_")[0]
      : value;
  const compact = base.replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    // Portuguese
    pb: "br",
    br: "br",
    ptbr: "br",
    por: "pt",
    // English
    eng: "en",
    gb: "en",
    us: "en",
    // Greek
    ell: "el",
    gre: "el",
    // Persian
    per: "fa",
    farsi: "fa",
    // Hebrew
    iw: "he",
    heb: "he",
    // Japanese
    jp: "ja",
    jpn: "ja",
    // Korean
    kr: "ko",
    kor: "ko",
    // Ukrainian
    ua: "uk",
    ukr: "uk",
    // Chinese — wyzie uses zt (traditional), ze (bilingual), yue/yc/zc (Cantonese)
    zt: "zh",
    ze: "zh",
    zhs: "zh",
    zht: "zh",
    zhb: "zh",
    yue: "yue",
    yc: "yue",
    zc: "yue",
    zcy: "yue",
    // Spanish variants — wyzie uses "sp" for Spanish (EU), "ea" for Spanish (LA)
    sp: "es",
    ea: "mx",
    spl: "es",
    "es-la": "mx",
    "es-419": "mx",
    // Iberian regional languages — Catalan, Galician, Basque
    ca: "es",
    gl: "es",
    eu: "es",
    // Serbian
    scc: "sr",
    scr: "sr",
    // Norwegian
    nb: "no",
    nn: "no",
    nob: "no",
    nno: "no",
  };
  return aliases[compact] || aliases[base] || base;
}

export async function GET(request: NextRequest) {
  const imdbId = request.nextUrl.searchParams.get("imdbId");
  const tmdbId = request.nextUrl.searchParams.get("tmdbId");
  const type = request.nextUrl.searchParams.get("type");
  const season = request.nextUrl.searchParams.get("season");
  const episode = request.nextUrl.searchParams.get("episode");

    const title = request.nextUrl.searchParams.get("title");

    if (!imdbId && !tmdbId && !title) {
      return NextResponse.json(
        { subtitles: [], error: "Missing ID or title" },
        { status: 200 },
      );
    }

  try {
    const params: any = {
      source: "opensubtitles",
      key: process.env.NEXT_PUBLIC_WYZIE_KEY || process.env.WYZIE_KEY,
    };

    if (
      imdbId &&
      imdbId !== "undefined" &&
      imdbId !== "null" &&
      imdbId.startsWith("tt")
    ) {
      params.imdb_id = imdbId;
    } else if (tmdbId && tmdbId.startsWith("al-") && title) {
      params.query = title;
    } else {
      const tmdbIdNum = tmdbId ? parseInt(tmdbId, 10) : NaN;
      if (!isNaN(tmdbIdNum)) {
        params.tmdb_id = tmdbIdNum;
      } else if (imdbId && imdbId !== "undefined" && imdbId !== "null") {
        params.imdb_id = imdbId;
      } else if (title) {
        params.query = title;
      } else {
        return NextResponse.json({ subtitles: [], error: "Invalid ID format" });
      }
    }

    if (type === "show" && season && episode) {
      params.season = parseInt(season, 10);
      params.episode = parseInt(episode, 10);
    }

    let results;
    try {
      results = await searchSubtitles(params);
    } catch (e) {
      // Retry with broader source if initial query fails
      params.source = "all";
      results = await searchSubtitles(params);
    }

    if (!Array.isArray(results) || results.length === 0) {
      if (params.source !== "all") {
        params.source = "all";
        results = await searchSubtitles(params);
      }
    }

    const items = Array.isArray(results) ? results : [];

    // Map results into normalized subtitle objects
    const mapped = items
      .map((item: any) => {
        const url = String(item?.url || "").trim();
        if (!url) return null;

        const lang = normalizeLanguage(
          String(item?.language || item?.display || "en"),
        );
        const label = String(
          item?.display ||
            item?.fileName ||
            (Array.isArray(item?.releases) && item.releases[0]) ||
            item?.release ||
            lang.toUpperCase(),
        );

        const type =
          url.toLowerCase().includes("format=vtt") ||
          url.toLowerCase().includes(".vtt")
            ? "vtt"
            : "srt";

        return {
          id: `wyzie-${lang}-${hashSuffix(url)}`,
          url,
          language: lang,
          type,
          label,
          flagUrl: item?.flagUrl || null,
          isHearingImpaired: Boolean(item?.isHearingImpaired),
          source: item?.source || null,
          release: item?.release || null,
          releases: Array.isArray(item?.releases) ? item.releases : null,
          origin: item?.origin || null,
          fileName: item?.fileName || null,
          downloadCount: Number(item?.downloadCount || 0),
          raw: item || null,
        };
      })
      .filter(Boolean) as Array<any>;

    // Deduplicate by URL (choose best candidate per URL)
    const byUrl = new Map<string, any>();
    for (const s of mapped) {
      if (!s || !s.url) continue;
      const key = s.url.trim();
      const existing = byUrl.get(key);
      if (!existing) {
        byUrl.set(key, s);
        continue;
      }

      // Prefer non-hearing-impaired over hearing-impaired when same URL
      if (existing.isHearingImpaired && !s.isHearingImpaired) {
        byUrl.set(key, s);
        continue;
      }
      if (!existing.isHearingImpaired && s.isHearingImpaired) {
        continue;
      }

      // Otherwise prefer higher download count
      if ((s.downloadCount || 0) > (existing.downloadCount || 0)) {
        byUrl.set(key, s);
        continue;
      }

      // If still tied, keep existing (stable)
    }

    const unique = Array.from(byUrl.values());

    // Sort results: preferred languages first, then language, then non-hearing-impaired,
    // then by downloadCount desc, then by label
    const preferred = ["en", "de", "es", "fr", "pl", "pt", "it", "ja"];
    unique.sort((a: any, b: any) => {
      const pa = preferred.indexOf(a.language);
      const pb = preferred.indexOf(b.language);
      if (pa !== pb) {
        if (pa === -1) return 1;
        if (pb === -1) return -1;
        return pa - pb;
      }

      if (a.language !== b.language) {
        return (a.language || "").localeCompare(b.language || "");
      }

      // Prefer non-hearing-impaired first
      if (a.isHearingImpaired !== b.isHearingImpaired) {
        return a.isHearingImpaired ? 1 : -1;
      }

      // Then by download count (desc)
      const da = Number(a.downloadCount || 0);
      const db = Number(b.downloadCount || 0);
      if (da !== db) return db - da;

      // Finally by label
      return String(a.label || "").localeCompare(String(b.label || ""));
    });

    // Limit to a reasonable number
    const sliced = unique.slice(0, 100);

    // Return all matching subtitles (deduped by URL), include isHearingImpaired so UI can show icon
    return NextResponse.json(
      { subtitles: sliced },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      { subtitles: [], error: error?.message || "Subtitle search failed" },
      { status: 200 },
    );
  }
}
