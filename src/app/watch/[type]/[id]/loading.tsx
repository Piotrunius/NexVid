export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/95 to-black" />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div className="w-full max-w-sm rounded-[20px] border border-white/10 bg-white/[0.03] px-6 py-6 text-center shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
          <p className="text-sm font-semibold text-text-primary">Preparing stream</p>
          <p className="mt-1 text-xs text-text-muted">Fetching sources and subtitles...</p>
        </div>
      </div>
    </div>
  );
}
