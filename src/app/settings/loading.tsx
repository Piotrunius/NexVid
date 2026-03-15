export default function Loading() {
  return (
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="skeleton h-10 w-48 rounded-xl" />
        
        {/* Settings Sections Skeleton */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel-glass p-6 space-y-4 rounded-3xl">
            <div className="skeleton h-6 w-32 rounded-md" />
            <div className="space-y-3">
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
