/* ============================================
  NexVid Footer – Sequoia Minimal Glass
  ============================================ */

'use client';

import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer-glass">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-gradient-to-br from-accent to-accent-hover shadow-[0_0_20px_var(--accent-glow)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21" /></svg>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">NexVid</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-8 text-[13px] text-white/30">
            {[
              { href: '/credits', label: 'Credits' },
              { href: '/privacy', label: 'Privacy' },
              { href: '/terms', label: 'Terms' },
              { href: '/dmca', label: 'DMCA' },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white/70 transition-colors duration-300">
                {link.label}
              </Link>
            ))}
          </div>

          {/* Info */}
          <div className="text-[12px] text-white/20 leading-relaxed">
            <p>
              Created by{' '}
              <a href="https://piotrunius.github.io" target="_blank" rel="noopener noreferrer" className="text-accent/60 hover:text-accent transition-colors duration-300">
                Piotrunius
              </a>
            </p>
            <p className="mt-1">© {year} NexVid · MIT License</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
