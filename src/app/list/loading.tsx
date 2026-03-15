export default function Loading() {
  return (
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="skeleton h-10 w-48 rounded-xl" />
          <div className="skeleton h-10 w-32 rounded-lg" />
        </div>

        {/* Status Tabs Skeleton */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-28 rounded-full flex-shrink-0" />
          ))}
        </div>

        {/* Continue Watching Skeleton */}
        <div className="mb-10">
          <div className="skeleton h-6 w-40 rounded-lg mb-4" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-24 w-full rounded-2xl" />
            ))}
          </div>
        </div>

        {/* List Grid Skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
