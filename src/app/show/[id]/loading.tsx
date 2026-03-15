import { MediaRowSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* ── Show Hero Skeleton ── */}
      <section className="relative h-[55vh] min-h-[380px] bg-black animate-pulse">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </section>

      {/* ── Show Info Skeleton ── */}
      <div className="relative -mt-36 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex gap-8">
          {/* Poster Skeleton */}
          <div className="hidden flex-shrink-0 md:block">
            <div className="skeleton h-[330px] w-[220px] rounded-[24px]" />
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

      {/* ── Episode Selector Skeleton ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-20">
        <div className="skeleton h-8 w-32 rounded-lg mb-6" />
        <div className="flex gap-2 mb-8 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-28 rounded-full flex-shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>

      {/* ── Rows Skeleton ── */}
      <div className="mt-20 space-y-10 pb-20">
        <MediaRowSkeleton title="Recommended" />
        <MediaRowSkeleton title="Similar Shows" />
      </div>
    </div>
  );
}
