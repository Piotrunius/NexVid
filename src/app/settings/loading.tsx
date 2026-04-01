export default function Loading() {
  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(80%_120%_at_50%_0%,rgba(255,255,255,0.09),transparent_72%)]" />

      <div className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="skeleton h-10 w-40 rounded-xl" />
          <div className="mt-2 skeleton h-4 w-64 rounded-md" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="glass-card rounded-[24px] border border-white/10 p-5 xl:col-span-4">
            <div className="skeleton h-6 w-28 rounded-md" />
            <div className="mt-4 space-y-3">
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/10 p-5 xl:col-span-8">
            <div className="skeleton h-6 w-32 rounded-md" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/10 p-5 xl:col-span-12">
            <div className="skeleton h-6 w-32 rounded-md" />
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-20 w-full rounded-2xl" />
              ))}
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/10 p-5 xl:col-span-5">
            <div className="skeleton h-6 w-24 rounded-md" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-11 w-full rounded-xl" />
              ))}
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/10 p-5 xl:col-span-7">
            <div className="skeleton h-6 w-20 rounded-md" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-16 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
