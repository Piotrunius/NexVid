import WatchPageClient from '@/components/pages/WatchPageClient';
import { getMovieDetails, getShowDetails } from '@/lib/tmdb';
import { loadPublicBlockedMedia } from '@/lib/cloudSync';
import { notFound } from 'next/navigation';

type PageProps = {
  params: Promise<{ type: string; id: string }>;
};

export const runtime = 'edge';

export default async function WatchPage({ params }: PageProps) {
  const { type, id } = await params;

  // Blocked content check
  try {
    const blockedRes = await loadPublicBlockedMedia();
    const normalizedType = type === 'show' ? 'tv' : 'movie';
    const isBlocked = (blockedRes.items || []).some(
      (item: any) => item.tmdbId === id && item.mediaType === normalizedType
    );
    if (isBlocked) return notFound();
  } catch (err) {
    console.error('Failed to check blocked status:', err);
  }

  try {
    const isShow = type === 'show';
    const media = isShow ? await getShowDetails(id) : await getMovieDetails(id);

    return <WatchPageClient initialMedia={media} />;
  } catch (err) {
    console.error('Failed to pre-fetch media for player:', err);
    return <WatchPageClient />;
  }
}
