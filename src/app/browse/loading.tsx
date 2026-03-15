import { MediaCardSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen pt-24 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="skeleton h-10 w-48 rounded-xl" />
          <div className="flex gap-2">
            <div className="skeleton h-10 w-24 rounded-full" />
            <div className="skeleton h-10 w-24 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
