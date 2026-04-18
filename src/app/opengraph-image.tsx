import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = 'NexVid — Watch Movies and TV Shows Online';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: 'linear-gradient(135deg, #050505 0%, #14142a 55%, #0a0a0a 100%)',
        color: 'white',
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -140,
          right: -120,
          width: 420,
          height: 420,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(99,102,241,0.42) 0%, rgba(99,102,241,0) 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -160,
          left: -140,
          width: 520,
          height: 520,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(129,140,248,0.26) 0%, rgba(129,140,248,0) 72%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '72px',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Inline SVG favicon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 64 64"
            fill="none"
            style={{
              borderRadius: 14,
              boxShadow: '0 0 34px rgba(99,102,241,0.6)',
              display: 'block',
            }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="g" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" />
            <path d="M24 18L46 32L24 46V18Z" fill="white" />
          </svg>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: -1.2 }}>NexVid</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 66,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: -2.2,
              maxWidth: '92%',
            }}
          >
            Watch Movies and TV Shows Online
          </div>
          <div
            style={{
              fontSize: 34,
              color: '#a5b4fc',
              fontWeight: 600,
              marginTop: 8,
              maxWidth: '92%',
            }}
          >
            Start streaming instantly — free, no signup required!
          </div>
          <div
            style={{
              fontSize: 30,
              color: 'rgba(255,255,255,0.8)',
              maxWidth: '88%',
            }}
          >
            Trending picks, smart search, watchlists, and seamless streaming on NexVid.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 28,
            color: '#818cf8',
            fontWeight: 700,
            marginTop: 24,
          }}
        >
          nexvid.online
        </div>
      </div>
    </div>,
    size,
  );
}
