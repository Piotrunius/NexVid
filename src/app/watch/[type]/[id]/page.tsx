import WatchPageClient from "@/components/pages/WatchPageClient";
import { mapAniListToMediaItem } from "@/lib/anilist";
import { loadPublicBlockedMedia } from "@/lib/cloudSync";
import { getMovieDetails, getShowDetails, searchMedia, getTmdbEpisodesForAnime } from "@/lib/tmdb";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ type: string; id: string }>;
};

// Must be nodejs (not edge) to support AniList fetch with next.revalidate
export const runtime = "edge";

export default async function WatchPage({ params }: PageProps) {
  const { type, id } = await params;
  const normalizedType =
    type === "show" || type === "tv" || type === "series" ? "show" : "movie";

  const isAnimeRoute = type === "anime" || id.startsWith("al-");

  // Blocked content check (skip for AniList items — no TMDB ID to check)
  if (!isAnimeRoute) {
    try {
      const blockedRes = await loadPublicBlockedMedia();
      const blockedType = normalizedType === "show" ? "tv" : "movie";
      const isBlocked = (blockedRes.items || []).some(
        (item: any) => item.tmdbId === id && item.mediaType === blockedType,
      );
      if (isBlocked) return notFound();
    } catch (err) {
      console.error("Failed to check blocked status:", err);
    }
  }

  try {
    // AniList anime — fetch from AniList GraphQL instead of TMDB
    if (isAnimeRoute) {
      const anilistId = id.startsWith("al-") ? parseInt(id.replace("al-", ""), 10) : parseInt(id, 10);
      if (!anilistId) return <WatchPageClient />;

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
                averageScore
                popularity
                episodes
                genres
                status
                season
                format
                studios(isMain: true) { nodes { name } }
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
              }
            }
          `,
          variables: { id: anilistId },
        }),
        cache: "no-store",
      });

      if (!res.ok) return <WatchPageClient />;
      const json = await res.json();
      const media = json?.data?.Media;
      if (!media) return <WatchPageClient />;

      const mediaItem = mapAniListToMediaItem(media) as any;
      const coverImg = media.coverImage?.extraLarge || media.coverImage?.large;
      const bannerImg = media.bannerImage;
      const animeOverview = media.description?.replace(/<[^>]+>/g, "") || "";

      let tmdbIdFromSearch: string | null = null;
      try {
        const searchRes = await searchMedia(media.title?.english || media.title?.romaji || media.title?.native || "", 1, "tv");
        if (searchRes.results && searchRes.results.length > 0) {
          const bestMatch = media.startDate?.year
            ? searchRes.results.find((r) => r.releaseYear === media.startDate.year) || searchRes.results[0]
            : searchRes.results[0];
          if (bestMatch && bestMatch.tmdbId) {
            tmdbIdFromSearch = String(bestMatch.tmdbId);
          }
        }
      } catch { /* ignore */ }

      if (tmdbIdFromSearch) {
        mediaItem.externalTmdbId = tmdbIdFromSearch;
      }

      // Fetch precisely aligned TMDB episodes based on air_date
      let tmdbEpisodesList: any[] = [];
      if (tmdbIdFromSearch) {
        const startDateStr = media.startDate?.year
          ? `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, "0")}-${String(media.startDate.day || 1).padStart(2, "0")}`
          : null;
        const tmdbData = await getTmdbEpisodesForAnime(tmdbIdFromSearch, startDateStr, media.episodes || 12);
        tmdbEpisodesList = tmdbData.episodes;
      }

      // Helper: build episodes for one media entry
      function buildEps(entry: any, seasonNum: number) {
        const epCount = entry.episodes || 0;
        const entryBanner = entry.bannerImage || bannerImg;
        const entryCover = entry.coverImage?.extraLarge || entry.coverImage?.large || coverImg;
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
            airDate: entry.startDate?.year?.toString() || "",
            runtime: 24,
            voteAverage: 0,
          };
        });
      }

      const titleStr = media.title?.english || media.title?.romaji || media.title?.native;
      const seasons = [
        {
          id: 1,
          seasonNumber: 1,
          name: titleStr,
          overview: animeOverview,
          posterPath: coverImg,
          episodes: buildEps({ ...media, bannerImage: bannerImg, coverImage: media.coverImage }, 1),
        },
      ];

      mediaItem.seasons = seasons;
      mediaItem.totalEpisodes = seasons.reduce((sum: number, s: any) => sum + (s.episodes?.length || 0), 0);
      mediaItem.networks = media.studios?.nodes?.map((s: any) => s.name) || [];

      return <WatchPageClient initialMedia={mediaItem} />;
    }


    // Standard TMDB fetch
    const isShow = normalizedType === "show";
    const media = isShow
      ? await getShowDetails(id)
      : await getMovieDetails(id);

    return <WatchPageClient initialMedia={media} />;
  } catch (err) {
    console.error("Failed to pre-fetch media for player:", err);
    return <WatchPageClient />;
  }
}
