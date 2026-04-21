export default function Loading() {
  return (
    <div className="relative min-h-screen overflow-hidden pb-10 pt-24">
      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
          <div className="skeleton h-10 w-40 rounded-xl" />
          <div className="skeleton mt-2 h-4 w-72 rounded-md" />
        </div>

        <div className="mb-7 mt-2 flex items-center justify-between gap-4">
          <div className="skeleton h-7 w-28 rounded-md" />
          <div className="skeleton h-9 w-[170px] rounded-xl" />
        </div>

        {/* Status Tabs Skeleton */}
        <div className="mb-8 flex gap-2 overflow-x-auto pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-28 flex-shrink-0 rounded-full" />
          ))}
        </div>

        {/* Continue Watching Skeleton */}
        <div className="mb-10">
          <div className="skeleton mb-4 h-6 w-40 rounded-lg" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-36 w-full rounded-2xl" />
            ))}
          </div>
        </div>

        {/* List Grid Skeleton */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
