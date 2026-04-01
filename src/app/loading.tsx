import { MediaRowSkeleton } from '@/components/media/MediaCard';

export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* ── Hero Skeleton ── */}
      <section className="relative h-[90vh] min-h-[640px] bg-black animate-pulse">
        <div className="absolute inset-0 flex items-center pt-20">
          <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10">
            <div className="max-w-2xl space-y-6">
              <div className="flex gap-3">
                <div className="skeleton h-5 w-20 rounded-md" />
                <div className="skeleton h-5 w-12 rounded-md" />
              </div>
              <div className="skeleton h-16 w-3/4 rounded-xl sm:h-20" />
              <div className="skeleton h-24 w-full rounded-xl" />
              <div className="flex gap-4 pt-4">
                <div className="skeleton h-12 w-40 rounded-[24px]" />
                <div className="skeleton h-12 w-32 rounded-[24px]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rows Skeleton ── */}
      <div className="relative z-10 -mt-32 space-y-4 pb-24 sm:-mt-36">
        <MediaRowSkeleton title="Trending This Week" />
        <MediaRowSkeleton title="Popular Movies" />
        <MediaRowSkeleton title="Top Rated Movies" />
      </div>
    </div>
  );
}
