/* ============================================
   Credits & Acknowledgments
   ============================================ */

export const metadata = { title: 'Credits - NexVid' };

const CREDITS = [
  {
    name: 'Piotrunius',
    url: 'https://piotrunius.github.io',
    desc: 'Creator and maintainer of NexVid.',
    license: 'Project Author',
  },
  {
    name: 'FebBox',
    url: 'https://www.febbox.com',
    desc: 'Stream source provider used by resolver flows and playback source discovery.',
    license: 'Provider Terms',
  },
  {
    name: 'TMDB',
    url: 'https://www.themoviedb.org',
    desc: 'Metadata provider for titles, descriptions, posters, and search results.',
    license: 'TMDB API Terms',
  },
  {
    name: 'TheIntroDB',
    url: 'https://theintrodb.org',
    desc: 'Optional provider for intro/outro segment timestamps used by skip controls.',
    license: 'API Terms',
  },
  {
    name: 'Next.js',
    url: 'https://nextjs.org',
    desc: 'React framework for the frontend application.',
    license: 'MIT License',
  },
  {
    name: 'HLS.js',
    url: 'https://github.com/video-dev/hls.js',
    desc: 'HLS video playback in the browser.',
    license: 'Apache 2.0',
  },
  {
    name: 'NexVid',
    url: '#',
    desc: 'Application source code is distributed under the MIT License.',
    license: 'MIT License',
  },
];

export default function CreditsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Credits</h1>
      <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
        This page lists the main technologies and services used by NexVid, along with
        project attribution and license context.
      </p>

      <div className="mt-8 space-y-3">
        {CREDITS.map((credit) => (
          <div key={credit.name} className="glass-card glass-liquid p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                {credit.url !== '#' ? (
                  <a
                    href={credit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-accent hover:underline"
                  >
                    {credit.name}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline ml-1 -mt-0.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                ) : (
                  <span className="text-[13px] font-semibold text-accent">{credit.name}</span>
                )}
                <p className="mt-1 text-[13px] text-text-secondary">{credit.desc}</p>
              </div>
              <span className="flex-shrink-0 rounded-[8px] bg-[var(--bg-glass-light)] px-2.5 py-0.5 text-[11px] text-text-muted">
                {credit.license}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 glass-card glass-liquid p-5 text-center">
        <p className="text-[11px] text-text-muted">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <img
          src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
          alt="TMDB Logo"
          className="mx-auto mt-2 h-4 opacity-60"
        />
      </div>
    </div>
  );
}
