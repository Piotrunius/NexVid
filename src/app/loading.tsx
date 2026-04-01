import { MediaRowSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* ── Hero Skeleton ── */}
      <section className="relative h-[90vh] min-h-[640px] bg-black animate-pulse">
        <div className="absolute inset-0 flex items-center justify-start pt-20">
          <div className="w-full px-6 sm:px-8 lg:px-10">
            <div className="max-w-[40rem] space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="skeleton h-7 w-16 rounded-full" />
                <div className="skeleton h-7 w-14 rounded-full" />
                <div className="skeleton h-7 w-24 rounded-full" />
              </div>
              <div className="skeleton h-14 w-3/4 rounded-xl sm:h-16 lg:h-20" />
              <div className="space-y-3">
                <div className="skeleton h-5 w-full rounded-xl" />
                <div className="skeleton h-5 w-11/12 rounded-xl" />
                <div className="skeleton h-5 w-4/5 rounded-xl" />
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <div className="skeleton h-14 w-40 rounded-[24px]" />
                <div className="skeleton h-14 w-32 rounded-[24px]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rows Skeleton ── */}
      <div className="relative z-10 -mt-32 space-y-4 pb-24 sm:-mt-36">
        <MediaRowSkeleton title="Continue Watching" />

        <section className="py-2">
          <div className="mb-3 px-4 sm:px-6 lg:px-8 w-full space-y-3">
            <div className="skeleton h-6 w-72 rounded-[8px]" />
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="skeleton h-8 w-28 rounded-full" />
              <div className="skeleton h-8 w-24 rounded-full" />
              <div className="skeleton h-8 w-32 rounded-full" />
            </div>
          </div>
          <div className="scroll-row px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="media-grid-item w-[180px] flex-shrink-0">
                <div className="skeleton rounded-[24px] aspect-[2/3] w-full" />
                <div className="mt-3 space-y-2 px-1">
                  <div className="skeleton h-3.5 w-3/4 rounded-[8px]" />
                  <div className="skeleton h-3 w-1/3 rounded-[8px]" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <MediaRowSkeleton title="Trending This Week" />
        <MediaRowSkeleton title="Popular Movies" />
        <MediaRowSkeleton title="Top Rated Movies" />
        <MediaRowSkeleton title="Top Rated TV Shows" />
      </div>
    </div>
  );
}
