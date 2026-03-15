import WatchPageClient from '@/components/pages/WatchPageClient';
import { getMovieDetails, getShowDetails } from '@/lib/tmdb';

type PageProps = {
  params: Promise<{ type: string; id: string }>;
};

export const runtime = 'edge';

export default async function WatchPage({ params }: PageProps) {
  const { type, id } = await params;

  try {
    const isShow = type === 'show';
    const media = isShow ? await getShowDetails(id) : await getMovieDetails(id);

    return <WatchPageClient initialMedia={media} />;
  } catch (err) {
    console.error('Failed to pre-fetch media for player:', err);
    return <WatchPageClient />;
  }
}
