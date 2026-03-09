import MoviePageClient from '@/components/pages/MoviePageClient';
import { getMovieDetails } from '@/lib/tmdb';
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
    const movie = await getMovieDetails(id);
    const releaseSuffix = movie.releaseYear ? ` (${movie.releaseYear})` : '';
    const title = `Watch - ${movie.title}${releaseSuffix} free on NexVid`;
    const description = (movie.overview || `Watch ${movie.title} online free on NexVid. See cast, details, and recommendations.`).slice(0, 160);
    const imagePath = movie.backdropPath || movie.posterPath;

    return {
      title,
      description,
      alternates: {
        canonical: `/movie/${id}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/movie/${id}`,
        type: 'video.movie',
        images: imagePath
          ? [{ url: tmdbImage(imagePath, 'w780'), width: 780, height: 439, alt: movie.title }]
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
      title: 'Watch Movies free on NexVid',
      description: 'Watch movie details, cast, and recommendations on NexVid.',
      alternates: {
        canonical: `/movie/${id}`,
      },
    };
  }
}

export default function MoviePage() {
  return <MoviePageClient />;
}
