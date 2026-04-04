import { MediaCardSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen pt-24 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="skeleton h-14 w-full max-w-xl mx-auto rounded-[24px]" />
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
