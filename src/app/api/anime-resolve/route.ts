import { NextRequest, NextResponse } from "next/server";
export const runtime = "edge";

/**
 * GET /api/anime-resolve?title=Frieren&year=2023
 * Returns { anilistId: 154587 } if the title matches an AniList anime,
 * or { anilistId: null } if not anime.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;

  if (!title) {
    return NextResponse.json({ anilistId: null }, { status: 400 });
  }

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `
          query ($search: String) {
            Page(perPage: 5) {
              media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
                id
                title { romaji english native }
                startDate { year }
              }
            }
          }
        `,
        variables: { search: title },
      }),
      cache: "no-store",
    });

    if (!res.ok) return NextResponse.json({ anilistId: null });
    const json = await res.json();
    const mediaList = json?.data?.Page?.media;
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
      return NextResponse.json({ anilistId: null });
    }

    const titleLower = title.toLowerCase();

    // Find the first media that matches title and year
    for (const media of mediaList) {
      const candidates = [
        media.title?.english,
        media.title?.romaji,
        media.title?.native,
      ].filter(Boolean) as string[];

      const matches = candidates.some((c) => {
        const cl = c.toLowerCase();
        return (
          cl === titleLower ||
          cl.includes(titleLower) ||
          titleLower.includes(cl) ||
          // Allow partial match for first 8 chars
          (cl.length > 8 && titleLower.startsWith(cl.slice(0, 8))) ||
          (titleLower.length > 8 && cl.startsWith(titleLower.slice(0, 8)))
        );
      });

      const yearOk =
        !year ||
        !media.startDate?.year ||
        Math.abs(media.startDate.year - year) <= 1;

      if (matches && yearOk) {
        return NextResponse.json(
          { anilistId: media.id },
          {
            headers: {
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          }
        );
      }
    }

    return NextResponse.json({ anilistId: null });
  } catch {
    return NextResponse.json({ anilistId: null });
  }
}
