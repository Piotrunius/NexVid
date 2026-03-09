import { getMovieDetails, getShowDetails } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/utils';
import type { Metadata } from 'next';

export const runtime = 'edge';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nexvid.online').replace(/\/$/, '');

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ type: string; id: string }>;
};

type MetadataProps = {
  params: Promise<{ type: string; id: string }>;
};

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { type, id } = await params;

  const isShow = type === 'show';

  try {
    const media = isShow ? await getShowDetails(id) : await getMovieDetails(id);
    const releaseSuffix = media.releaseYear ? ` (${media.releaseYear})` : '';
    const baseTitle = `${media.title}${releaseSuffix}`;
    const title = `Watch - ${baseTitle} free on NexVid`;
    const description = (media.overview || `Watch ${media.title} online free on NexVid.`).slice(0, 160);
    const canonicalPath = isShow ? `/watch/show/${id}` : `/watch/movie/${id}`;
    const imagePath = media.backdropPath || media.posterPath;
    const imageUrl = imagePath ? tmdbImage(imagePath, 'w780') : `${SITE_URL}/opengraph-image`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalPath,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        type: isShow ? 'video.tv_show' : 'video.movie',
        images: [{ url: imageUrl, width: 780, height: 439, alt: media.title }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch {
    const fallbackTitle = isShow ? 'Watch TV Episode free on NexVid' : 'Watch Movie free on NexVid';
    const fallbackCanonical = isShow ? `/watch/show/${id}` : `/watch/movie/${id}`;
    const fallbackDescription = 'Watch movies and TV shows online free on NexVid.';

    return {
      title: fallbackTitle,
      description: fallbackDescription,
      alternates: {
        canonical: fallbackCanonical,
      },
      openGraph: {
        title: fallbackTitle,
        description: fallbackDescription,
        url: `${SITE_URL}${fallbackCanonical}`,
        type: isShow ? 'video.tv_show' : 'video.movie',
        images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'NexVid' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: fallbackTitle,
        description: fallbackDescription,
        images: [`${SITE_URL}/opengraph-image`],
      },
    };
  }
}

export default async function WatchMetadataLayout({ children, params }: LayoutProps) {
  await params;
  return children;
}
