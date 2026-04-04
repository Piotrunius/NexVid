/* ============================================
  NexVid Footer – Sequoia Minimal Glass
  ============================================ */

'use client';

import buildInfo from '@/lib/build-info.json';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Footer() {
  const year = new Date().getFullYear();
  const discordUrl = 'https://cloud.umami.is/q/vCu19Bcub';
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const lastUpdated = isClient
    ? new Date(buildInfo.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';

  return (
    <footer className="footer-glass">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-[7px] shadow-[0_0_16px_var(--accent-glow)] bg-transparent p-0">
              {/* Inline SVG favicon with dynamic accent color, rounded square, play triangle with padding */}
              {isClient && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="footer-accent" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop stopColor="var(--accent)" />
                      <stop offset="1" stopColor="var(--accent-hover)" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="24" height="24" rx="7" fill="url(#footer-accent)" />
                  <polygon points="10,7.5 16,12 10,16.5" fill="white" />
                </svg>
              )}
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">NexVid</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-[13px] text-white/30">
            {[
              { href: '/credits', label: 'Credits' },
              { href: discordUrl, label: 'Discord', external: true },
              { href: '/privacy', label: 'Privacy' },
              { href: '/terms', label: 'Terms' },
              { href: '/dmca', label: 'DMCA' },
            ].map((link) => (
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 transition-colors duration-300"
                >
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} href={link.href} className="hover:text-white/70 transition-colors duration-300">
                  {link.label}
                </Link>
              )
            ))}
          </div>

          {/* Info */}
          <div className="text-[12px] text-white/20 leading-relaxed">
            <p className="mt-1">© {year} NexVid · All rights reserved.</p>
            {isClient && (
              <p className="mt-1 text-[10px] opacity-50 flex items-center justify-center">
                {/* Balancing spacer to keep text centered */}
                <span className="invisible mr-1" aria-hidden="true">(info)</span>

                <span>Last updated: {lastUpdated}</span>

                <span
                  className="ml-1 opacity-0 hover:opacity-100 transition-opacity cursor-default"
                  title={`Commit: ${buildInfo.commit}\nMessage: ${buildInfo.message}`}
                >
                  (info)
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
