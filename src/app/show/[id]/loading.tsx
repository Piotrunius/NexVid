import { MediaRowSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* ── Show Hero Skeleton ── */}
      <section className="relative h-[55vh] min-h-[380px] animate-pulse bg-black">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </section>

      {/* ── Show Info Skeleton ── */}
      <div className="relative -mt-36 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <div className="hidden md:block">
            <div className="skeleton h-[330px] w-[220px] rounded-[24px]" />
          </div>

          <div className="min-w-0 space-y-4 pt-8 md:pt-10">
            <div className="skeleton h-10 w-3/4 rounded-xl sm:h-12" />
            <div className="flex gap-3">
              <div className="skeleton h-5 w-20 rounded-md" />
              <div className="skeleton h-5 w-16 rounded-md" />
              <div className="skeleton h-5 w-12 rounded-md" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="skeleton h-6 w-24 rounded-full" />
              <div className="skeleton h-6 w-20 rounded-full" />
              <div className="skeleton h-6 w-28 rounded-full" />
            </div>
            <div className="space-y-2 pt-4">
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-2/3 rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
              <div className="skeleton h-20 rounded-[20px]" />
              <div className="skeleton h-20 rounded-[20px]" />
              <div className="skeleton h-20 rounded-[20px]" />
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <div className="skeleton h-11 w-40 rounded-[14px]" />
              <div className="skeleton h-11 w-28 rounded-[14px]" />
              <div className="skeleton h-11 w-28 rounded-[14px]" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Episode Selector Skeleton ── */}
      <div className="mt-20 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="skeleton mb-6 h-8 w-32 rounded-lg" />
        <div className="mb-8 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-28 flex-shrink-0 rounded-full" />
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
