import MoviePageClient from '@/components/pages/MoviePageClient';
import { getMovieDetails, getRecommendations, getSimilar } from '@/lib/tmdb';
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
    };
  }
}

export default async function MoviePage({ params }: PageProps) {
  const { id } = await params;

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
