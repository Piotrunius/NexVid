export default function Loading() {
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
      <p className="text-[13px] text-white/40 font-medium animate-pulse">Initializing Player...</p>
    </div>
  );
}
