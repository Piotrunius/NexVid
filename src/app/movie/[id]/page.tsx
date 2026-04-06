import MoviePageClient from '@/components/pages/MoviePageClient';
import { loadPublicBlockedMedia } from '@/lib/cloudSync';
import { getMovieDetails, getRecommendations, getSimilar } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const runtime = 'edge';
const SITE_URL = (process.env.APP_BASE_URL || 'https://nexvid.online').replace(/\/$/, '');

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const blockedRes = await loadPublicBlockedMedia();
    const isBlocked = (blockedRes.items || []).some(
      (item: any) => item.tmdbId === id && item.mediaType === 'movie'
    );
    if (isBlocked) return { title: 'Not Found' };
  } catch (err) {}

  try {
    const movie = await getMovieDetails(id);
    const releaseSuffix = movie.releaseYear ? ` (${movie.releaseYear})` : '';
    const title = `Watch - ${movie.title}${releaseSuffix} for free on NexVid`;
    const description = (movie.overview || `Watch ${movie.title} online for free on NexVid. See cast, details, and recommendations.`).slice(0, 160);
    const imagePath = movie.backdropPath || movie.posterPath;
    const imageUrl = imagePath ? tmdbImage(imagePath, 'w1280') : `${SITE_URL}/opengraph-image`;

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
        canonical: `/movie/${id}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/movie/${id}`,
        type: 'video.movie',
        images: [{ url: imageUrl, width: 1280, height: 720, alt: movie.title, type: 'image/jpeg' }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch {
    return {
      title: 'Watch Movies for free on NexVid',
      description: 'Watch movie details, cast, and recommendations on NexVid.',
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
        canonical: `/movie/${id}`,
      },
      openGraph: {
        title: 'Watch Movies for free on NexVid',
        description: 'Watch movie details, cast, and recommendations on NexVid.',
        url: `${SITE_URL}/movie/${id}`,
        type: 'video.movie',
        images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'NexVid', type: 'image/png' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Watch Movies for free on NexVid',
        description: 'Watch movie details, cast, and recommendations on NexVid.',
        images: [`${SITE_URL}/opengraph-image`],
      },
    };
  }
}

export default async function MoviePage({ params }: PageProps) {
  const { id } = await params;

  // Blocked content check
  try {
    const blockedRes = await loadPublicBlockedMedia();
    const isBlocked = (blockedRes.items || []).some(
      (item: any) => item.tmdbId === id && item.mediaType === 'movie'
    );
    if (isBlocked) return notFound();
  } catch (err) {
    console.error('Failed to check blocked status:', err);
  }

  try {
    const [movie, recommendations, similar] = await Promise.all([
      getMovieDetails(id),
      getRecommendations('movie', id),
      getSimilar('movie', id),
    ]);

    return (
      <MoviePageClient
        initialMovie={movie}
        initialRecommendations={recommendations}
        initialSimilar={similar}
      />
    );
  } catch (err) {
    console.error('Failed to fetch movie details:', err);
    return <MoviePageClient />;
  }
}
