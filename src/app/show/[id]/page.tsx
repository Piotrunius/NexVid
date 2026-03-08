import ShowPageClient from '@/components/pages/ShowPageClient';
import { getShowDetails } from '@/lib/tmdb';
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
    const title = show.releaseYear
      ? `${show.title} (${show.releaseYear}) | NexVid`
      : `${show.title} | NexVid`;
    const description = (show.overview || 'Watch show details, episodes, cast, and recommendations on NexVid.').slice(0, 160);
    const imagePath = show.backdropPath || show.posterPath;

    return {
      title,
      description,
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
      title: 'Show | NexVid',
      description: 'Watch show details, episodes, cast, and recommendations on NexVid.',
      alternates: {
        canonical: `/show/${id}`,
      },
    };
  }
}

export default function ShowPage() {
  return <ShowPageClient />;
}
