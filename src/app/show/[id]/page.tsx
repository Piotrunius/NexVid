import ShowPageClient from "@/components/pages/ShowPageClient";
import { loadPublicBlockedMedia } from "@/lib/cloudSync";
import { getRecommendations, getShowDetails, getSimilar } from "@/lib/tmdb";
import { tmdbImage } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const runtime = "edge";
const SITE_URL = (process.env.APP_BASE_URL || "https://nexvid.online").replace(
  /\/$/,
  "",
);

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const blockedRes = await loadPublicBlockedMedia();
    const isBlocked = (blockedRes.items || []).some(
      (item: any) => item.tmdbId === id && item.mediaType === "tv",
    );
    if (isBlocked) return { title: "Not Found" };
  } catch (err) {}

  try {
    const show = await getShowDetails(id);
    const releaseSuffix = show.releaseYear ? ` (${show.releaseYear})` : "";
    const title = `Watch - ${show.title}${releaseSuffix} for free on NexVid`;
    const description = (
      show.overview ||
      `Watch ${show.title} online for free on NexVid. Explore episodes, cast, and recommendations.`
    ).slice(0, 160);
    const imagePath = show.backdropPath || show.posterPath;
    const imageUrl = imagePath
      ? tmdbImage(imagePath, "w1280")
      : `${SITE_URL}/opengraph-image`;

    return {
      title,
      description,
      robots: {
        index: false,
        follow: true,
        googleBot: {
          index: false,
          follow: true,
          noimageindex: true,
        },
      },
      alternates: {
        canonical: `/show/${id}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/show/${id}`,
        type: "video.tv_show",
        images: [
          {
            url: imageUrl,
            width: 1280,
            height: 720,
            alt: show.title,
            type: "image/jpeg",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch {
    return {
      title: "Watch TV Shows for free on NexVid",
      description:
        "Watch show details, episodes, cast, and recommendations on NexVid.",
      robots: {
        index: false,
        follow: true,
        googleBot: {
          index: false,
          follow: true,
          noimageindex: true,
        },
      },
      alternates: {
        canonical: `/show/${id}`,
      },
      openGraph: {
        title: "Watch TV Shows for free on NexVid",
        description:
          "Watch show details, episodes, cast, and recommendations on NexVid.",
        url: `${SITE_URL}/show/${id}`,
        type: "video.tv_show",
        images: [
          {
            url: `${SITE_URL}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: "NexVid",
            type: "image/png",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: "Watch TV Shows for free on NexVid",
        description:
          "Watch show details, episodes, cast, and recommendations on NexVid.",
        images: [`${SITE_URL}/opengraph-image`],
      },
    };
  }
}

export default async function ShowPage({ params }: PageProps) {
  const { id } = await params;

  // Blocked content check
  try {
    const blockedRes = await loadPublicBlockedMedia();
    const isBlocked = (blockedRes.items || []).some(
      (item: any) => item.tmdbId === id && item.mediaType === "tv",
    );
    if (isBlocked) return notFound();
  } catch (err) {
    console.error("Failed to check blocked status:", err);
  }

  try {
    const [show, recommendations, similar] = await Promise.all([
      getShowDetails(id),
      getRecommendations("tv", id),
      getSimilar("tv", id),
    ]);

    const { detectAnime } = await import("@/lib/animeDetect");
    const { searchAnime } = await import("@/lib/anilist");
    const isAnime = await detectAnime(id, show.title, show.releaseYear, show.originCountry);
    
    if (isAnime) {
      const searchRes = await searchAnime(show.title, 1);
      const showTitleNorm = show.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      const exactMatch = searchRes.results.find(
        (res) => res.title.toLowerCase().replace(/[^a-z0-9]/g, "") === showTitleNorm
      ) || searchRes.results[0];

      if (exactMatch && exactMatch.tmdbId && String(exactMatch.tmdbId).startsWith("al-")) {
        const { redirect } = await import("next/navigation");
        return redirect(`/anime/${exactMatch.tmdbId.toString().replace("al-", "")}`);
      }
    }

    return (
      <ShowPageClient
        initialShow={show}
        initialRecommendations={recommendations}
        initialSimilar={similar}
      />
    );
  } catch (err) {
    console.error("Failed to fetch show details:", err);
    return <ShowPageClient />;
  }
}
