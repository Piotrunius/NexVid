export default function Loading() {
  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(255,255,255,0.09),transparent_70%)]" />

      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="skeleton h-10 w-44 rounded-xl" />
          <div className="mt-2 skeleton h-4 w-72 rounded-md" />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <div className="skeleton h-10 w-28 rounded-full" />
            <div className="skeleton h-10 w-24 rounded-full" />
            <div className="skeleton h-10 w-28 rounded-full" />
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-10 w-24 rounded-full" />
            <div className="skeleton h-10 w-32 rounded-full" />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-24 rounded-full" />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="w-full">
              <div className="skeleton aspect-[2/3] w-full rounded-[24px]" />
              <div className="mt-3 space-y-2 px-1">
                <div className="skeleton h-3.5 w-3/4 rounded-[8px]" />
                <div className="skeleton h-3 w-1/3 rounded-[8px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
