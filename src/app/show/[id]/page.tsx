import ShowPageClient from '@/components/pages/ShowPageClient';
import { getRecommendations, getShowDetails, getSimilar } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/utils';
import type { Metadata } from 'next';

export const runtime = 'edge';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nexvid.online').replace(/\/$/, '');

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const show = await getShowDetails(id);
    const releaseSuffix = show.releaseYear ? ` (${show.releaseYear})` : '';
    const title = `Watch - ${show.title}${releaseSuffix} free on NexVid`;
    const description = (show.overview || `Watch ${show.title} online free on NexVid. Explore episodes, cast, and recommendations.`).slice(0, 160);
    const imagePath = show.backdropPath || show.posterPath;

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
        type: 'video.tv_show',
        images: imagePath
          ? [{ url: tmdbImage(imagePath, 'w780'), width: 780, height: 439, alt: show.title }]
          : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: imagePath ? [tmdbImage(imagePath, 'w780')] : undefined,
      },
    };
  } catch {
    return {
      title: 'Watch TV Shows free on NexVid',
      description: 'Watch show details, episodes, cast, and recommendations on NexVid.',
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
    };
  }
}

export default async function ShowPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const [show, recommendations, similar] = await Promise.all([
      getShowDetails(id),
      getRecommendations('tv', id),
      getSimilar('tv', id),
    ]);

    return (
      <ShowPageClient 
        initialShow={show} 
        initialRecommendations={recommendations} 
        initialSimilar={similar} 
      />
    );
  } catch (err) {
    console.error('Failed to fetch show details:', err);
    return <ShowPageClient />;
  }
}
