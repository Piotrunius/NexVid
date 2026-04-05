/* ============================================
   Credits & Acknowledgments
   ============================================ */

export const metadata = { title: 'Credits - NexVid' };

const SECTIONS = [
  {
    title: 'Data & Content',
    items: [
      {
        name: 'TMDB',
        url: 'https://www.themoviedb.org',
        desc: 'Global metadata for movies and TV shows.',
      },
      {
        name: 'OMDb API',
        url: 'https://www.omdbapi.com/',
        desc: 'External ratings and additional title metadata.',
      },
      {
        name: 'FebBox',
        url: 'https://www.febbox.com',
        desc: 'Playback infrastructure and media sources.',
      },
      {
        name: 'Wyzie Subs',
        url: 'https://sub.wyzie.io/',
        desc: 'Multi-language subtitles and translations.',
      },
      {
        name: 'TheIntroDB',
        url: 'https://theintrodb.org',
        desc: 'Intro/outro timestamps for skip controls.',
      },
      {
        name: 'Groq',
        url: 'https://groq.com/',
        desc: 'Inference platform powering the AI Assistant.',
      }
    ]
  },
  {
    title: 'Core Technologies',
    items: [
      {
        name: 'Next.js',
        url: 'https://nextjs.org',
        desc: 'React framework for the application.',
      },
      {
        name: 'HLS.js',
        url: 'https://github.com/video-dev/hls.js',
        desc: 'Browser-based video playback engine.',
      }
    ]
  }
];

export default function CreditsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <header className="mb-12 text-center">
        <h1 className="text-[32px] font-bold text-text-primary tracking-tight">Credits</h1>
        <p className="mt-3 text-[14px] text-text-muted leading-relaxed mx-auto max-w-md">
          NexVid is built with gratitude towards these creators, providers, and open-source projects.
        </p>
      </header>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-text-muted/60 px-1">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {section.items.map((item) => (
                <div key={item.name} className="glass-card glass-liquid group p-4 transition-all hover:bg-white/[0.03]">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[14px] font-semibold text-accent hover:text-accent-hover transition-colors"
                  >
                    {item.name}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40 group-hover:opacity-100 transition-opacity">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                  <p className="mt-1 text-[12px] text-text-secondary leading-snug">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

    </div>
  );
}
