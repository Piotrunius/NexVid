import { MediaRowSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* ── Movie Hero Skeleton ── */}
      <section className="relative h-[60vh] min-h-[400px] bg-black animate-pulse">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </section>

      {/* ── Movie Info Skeleton ── */}
      <div className="relative -mt-40 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex gap-8">
          {/* Poster Skeleton */}
          <div className="hidden flex-shrink-0 md:block">
            <div className="skeleton h-[360px] w-[240px] rounded-[24px]" />
          </div>

          {/* Info Skeleton */}
          <div className="flex-1 min-w-0 space-y-4 pt-10">
            <div className="skeleton h-10 w-3/4 rounded-xl" />
            <div className="flex gap-3">
              <div className="skeleton h-5 w-20 rounded-md" />
              <div className="skeleton h-5 w-16 rounded-md" />
              <div className="skeleton h-5 w-12 rounded-md" />
            </div>
            <div className="flex gap-2">
              <div className="skeleton h-7 w-20 rounded-full" />
              <div className="skeleton h-7 w-20 rounded-full" />
              <div className="skeleton h-7 w-20 rounded-full" />
            </div>
            <div className="space-y-2 pt-4">
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-2/3 rounded-md" />
            </div>
            <div className="flex gap-4 pt-6">
              <div className="skeleton h-12 w-40 rounded-[14px]" />
              <div className="skeleton h-12 w-32 rounded-[14px]" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Rows Skeleton ── */}
      <div className="mt-20 space-y-10 pb-20">
        <MediaRowSkeleton title="Recommended" />
        <MediaRowSkeleton title="Similar Movies" />
      </div>
    </div>
  );
}
