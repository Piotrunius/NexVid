import ShowPageClient from "@/components/pages/ShowPageClient";
import { notFound } from "next/navigation";
import type { Show, MediaItem } from "@/types";
import type { Metadata } from "next";

export const runtime = "edge";
const SITE_URL = (process.env.APP_BASE_URL || "https://nexvid.online").replace(
  /\/$/,
  "",
);

type PageProps = {
  params: Promise<{ id: string }>;
};

import { searchMedia, getTmdbEpisodesForAnime } from "@/lib/tmdb";

async function getAnimeDetailsFromAniList(id: number) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title { romaji english native }
            description
            coverImage { large extraLarge }
            bannerImage
            startDate { year }
            endDate { year }
            averageScore
            episodes
            genres
            status
            format
            trailer { id site thumbnail }
            studios(isMain: true) { nodes { name } }
            characters(perPage: 20, sort: ROLE) {
              edges {
                role
                node { id name { full } image { medium } }
              }
            }
            streamingEpisodes {
              title
              thumbnail
              url
              site
            }
            relations {
              edges {
                relationType
                node {
                  id
                  title { romaji english }
                  coverImage { large extraLarge }
                  episodes
                  startDate { year }
                  type
                  format
                  streamingEpisodes {
                    title
                    thumbnail
                  }
                }
              }
            }
            externalLinks {
              site
              url
              id
            }
            recommendations(sort: RATING_DESC, perPage: 12) {
              edges {
                node {
                  mediaRecommendation {
                    id
                    title { romaji english }
                    coverImage { large extraLarge }
                    bannerImage
                    averageScore
                    startDate { year }
                    format
                  }
                }
              }
            }
          }
        }
      `,
      variables: { id },
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Failed to fetch AniList data");
  const json = await res.json();
  const media = json?.data?.Media;
  if (!media) throw new Error("Anime not found");
  return media;
}


export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const anilistId = parseInt(id, 10);
  if (!anilistId) return { title: "Not Found" };

  try {
    const media = await getAnimeDetailsFromAniList(anilistId);
    const titleObj = media.title;
    const titleStr = titleObj.english || titleObj.romaji || titleObj.native;
    const releaseSuffix = media.startDate?.year ? ` (${media.startDate.year})` : "";
    const title = `Watch - ${titleStr}${releaseSuffix} for free on NexVid`;

    const plainOverview = media.description?.replace(/<[^>]+>/g, "") || "";
    const description = (
      plainOverview || `Watch ${titleStr} online for free on NexVid.`
    ).slice(0, 160);

    const imageUrl =
      media.bannerImage ||
      media.coverImage?.extraLarge ||
      media.coverImage?.large ||
      `${SITE_URL}/opengraph-image`;

    return {
      title,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: `/anime/${id}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/anime/${id}`,
        type: "video.tv_show",
        images: [{ url: imageUrl }],
      },
      twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
    };
  } catch {
    return { title: "Not Found" };
  }
}

export default async function AnimePage({ params }: PageProps) {
  const { id } = await params;
  const anilistId = parseInt(id, 10);

  if (!anilistId) return notFound();

  try {
    const media = await getAnimeDetailsFromAniList(anilistId);

    const titleObj = media.title;
    const titleStr = titleObj.english || titleObj.romaji || titleObj.native;
    const coverImg = media.coverImage?.extraLarge || media.coverImage?.large;
    const bannerImg = media.bannerImage;
    const animeOverview = media.description?.replace(/<[^>]+>/g, "") || "";

    // Find TMDB ID from TMDB API search (AniList externalLinks is unreliable for TMDB)
    let tmdbIdFromSearch: string | null = null;
    try {
      const searchRes = await searchMedia(titleStr, 1, "tv");
      if (searchRes.results && searchRes.results.length > 0) {
        // Find best match (prioritize year if available)
        const bestMatch = media.startDate?.year
          ? searchRes.results.find((r) => r.releaseYear === media.startDate.year) || searchRes.results[0]
          : searchRes.results[0];
        if (bestMatch && bestMatch.tmdbId) {
          tmdbIdFromSearch = String(bestMatch.tmdbId);
        }
      }
    } catch { /* ignore */ }

    // Fetch precisely aligned TMDB episodes based on air_date
    let tmdbEpisodesList: any[] = [];
    let imdbIdFromTmdb: string | null = null;
    if (tmdbIdFromSearch) {
      const startDateStr = media.startDate?.year
        ? `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, "0")}-${String(media.startDate.day || 1).padStart(2, "0")}`
        : null;
      const tmdbData = await getTmdbEpisodesForAnime(tmdbIdFromSearch, startDateStr, media.episodes || 12);
      tmdbEpisodesList = tmdbData.episodes;
      if (tmdbData.imdbId) imdbIdFromTmdb = tmdbData.imdbId;
    }

    // ── Helper: build episodes array for a given media entry ──
    function buildEpisodes(mediaEntry: any, seasonNum: number) {
      const epCount = mediaEntry.episodes || 0;
      const entryBanner = mediaEntry.bannerImage || bannerImg;
      const entryCover = mediaEntry.coverImage?.extraLarge || mediaEntry.coverImage?.large || coverImg;

      const count = epCount > 0 ? epCount : tmdbEpisodesList.length > 0 ? tmdbEpisodesList.length : 12;

      return Array.from({ length: count }).map((_, i) => {
        const epNum = i + 1;
        let epTitle = `Episode ${epNum}`;
        let epOverview = "";
        let stillPath = entryBanner || entryCover || null;

        // Enrich with precise TMDB metadata
        const tmdbEp = tmdbEpisodesList[i];
        if (tmdbEp) {
          if (tmdbEp.name && !tmdbEp.name.toLowerCase().startsWith("episode ")) {
            epTitle = tmdbEp.name;
          }
          if (tmdbEp.overview) {
            epOverview = tmdbEp.overview;
          }
          if (tmdbEp.still_path) {
            stillPath = `https://image.tmdb.org/t/p/w300${tmdbEp.still_path}`;
          }
        }

        return {
          id: epNum + (seasonNum - 1) * 1000,
          episodeNumber: epNum,
          name: epTitle,
          overview: epOverview,
          stillPath,
          airDate: mediaEntry.startDate?.year?.toString() || "",
          runtime: 24,
          voteAverage: 0,
        };
      });
    }

    // ── Build exactly 1 season for Anime (User requested no multiple seasons) ──
    const seasons = [
      {
        id: 1,
        seasonNumber: 1,
        name: titleStr,
        overview: animeOverview,
        posterPath: coverImg,
        episodes: buildEpisodes(
          {
            ...media,
            streamingEpisodes: media.streamingEpisodes,
            bannerImage: bannerImg,
            coverImage: media.coverImage,
          },
          1
        ),
      },
    ];

    // ── Cast ──
    const cast = (media.characters?.edges || [])
      .slice(0, 15)
      .map((edge: any, idx: number) => {
        const char = edge.node;
        return {
          id: char.id,
          name: char.name?.full || "Unknown",
          character:
            edge.role === "MAIN" ? "Main Character" : "Supporting Character",
          profilePath: char.image?.medium || null,
          order: idx,
        };
      })
      .filter(Boolean);

    // ── Build Show object ──
    // If we found a TMDB ID, set tmdbId so ShowPageClient can show TMDB/SeriesGraph buttons
    // We still keep al- prefix as the primary identifier
    const show: Show = {
      id: anilistId.toString(),
      tmdbId: `al-${anilistId}`,
      ...(imdbIdFromTmdb ? { imdbId: imdbIdFromTmdb } : {}),
      ...(tmdbIdFromSearch ? { externalTmdbId: tmdbIdFromSearch } : {}),
      title: titleStr,
      originalTitle: titleObj.native || titleStr,
      overview: animeOverview,
      posterPath: coverImg,
      backdropPath: bannerImg,
      releaseYear: media.startDate?.year,
      rating: media.averageScore ? media.averageScore / 10 : 0,
      type: "show",
      genres: media.genres?.map((g: string, i: number) => ({ id: i, name: g })) || [],
      tagline: "",
      status: media.status,
      totalEpisodes: seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0),
      certification: media.format,
      seasons,
      cast,
      networks: media.studios?.nodes?.map((s: any) => s.name) || [],
      videos: media.trailer?.id && media.trailer?.site === "youtube"
        ? [
            {
              id: media.trailer.id,
              key: media.trailer.id,
              name: "Trailer",
              site: "YouTube",
              type: "Trailer",
            },
          ]
        : [],
    } as any;

    // ── Recommendations ──
    const edges = media.recommendations?.edges || [];
    const recommendations: MediaItem[] = edges
      .map((e: any) => {
        const rec = e.node?.mediaRecommendation;
        if (!rec) return null;
        const recTitle = rec.title?.english || rec.title?.romaji || "Unknown";
        return {
          id: `al-${rec.id}`,
          tmdbId: `al-${rec.id}`,
          mediaType: "show" as const,
          title: recTitle,
          overview: "",
          posterPath: rec.coverImage?.extraLarge || rec.coverImage?.large,
          backdropPath: rec.bannerImage,
          releaseYear: rec.startDate?.year,
          rating: rec.averageScore ? rec.averageScore / 10 : 0,
        };
      })
      .filter(Boolean);

    return (
      <ShowPageClient
        initialShow={show}
        initialRecommendations={recommendations}
        initialSimilar={[]}
      />
    );
  } catch (err) {
    console.error("Failed to load anime:", err);
    return notFound();
  }
}

