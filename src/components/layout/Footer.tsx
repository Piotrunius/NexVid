/* ============================================
  NexVid Footer – Horizontal Full-Width
  ============================================ */

'use client';

import buildInfo from '@/lib/build-info.json';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL;

const NAV_LINKS = [
  { href: '/credits', label: 'Credits' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/dmca', label: 'DMCA' },
];

export function Footer() {
  const year = new Date().getFullYear();
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
        minute: '2-digit',
      })
    : '';

  return (
    <footer className="relative mt-12 w-full">
      {/* Top separator */}
      <div className="w-full">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <div className="w-full px-6 py-8 sm:px-8 lg:px-12 xl:px-16">
        {/* ── Main Row ── */}
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
          {/* Left – Brand */}
          <div className="flex flex-[1] items-center gap-2.5 md:justify-start">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-transparent p-0 shadow-[0_0_14px_var(--accent-glow)]">
                {isClient && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <defs>
                      <linearGradient
                        id="footer-accent"
                        x1="0"
                        y1="0"
                        x2="24"
                        y2="24"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="var(--accent)" />
                        <stop offset="1" stopColor="var(--accent-hover)" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="24" height="24" rx="7" fill="url(#footer-accent)" />
                    <polygon points="10,7.5 16,12 10,16.5" fill="white" />
                  </svg>
                )}
              </div>
              <span className="text-[14px] font-semibold tracking-tight text-white">NexVid</span>
            </div>
            <span className="hidden text-white/10 md:inline">·</span>
            <p className="hidden text-[12px] text-white/25 md:inline">
              Free streaming hub for movies and TV shows
            </p>
          </div>

          {/* Center – Nav Links */}
          <nav className="flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[12px] text-white/25 transition-colors duration-300 hover:text-white/60"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right – Actions */}
          <div className="flex flex-[1] items-center justify-center gap-2.5 md:justify-end">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 rounded-full border border-[#5865F2]/15 bg-[#5865F2]/[0.04] px-3 py-[6px] text-[11px] font-semibold text-[#5865F2]/60 transition-all duration-300 hover:border-[#5865F2]/25 hover:bg-[#5865F2]/[0.1] hover:text-[#5865F2]"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="shrink-0 transition-transform duration-300 group-hover:scale-110"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Discord
            </a>
            <Link
              href="/donate"
              className="group flex items-center gap-1.5 rounded-full border border-[#f43f5e]/15 bg-[#f43f5e]/[0.04] px-3 py-[6px] text-[11px] font-semibold text-[#f43f5e]/60 transition-all duration-300 hover:border-[#f43f5e]/25 hover:bg-[#f43f5e]/[0.1] hover:text-[#f43f5e]"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="shrink-0 transition-transform duration-300 group-hover:scale-110"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              Donate
            </Link>
          </div>
        </div>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="w-full border-t border-white/[0.04]">
        <div className="flex w-full flex-col-reverse items-center justify-center gap-2 px-6 py-5 sm:flex-row sm:justify-between sm:px-8 lg:px-12 xl:px-16">
          <p className="text-[11px] text-white/15">© {year} NexVid · All rights reserved.</p>
          {isClient && (
            <p className="flex items-center gap-1 text-[10px] text-white/10">
              <span>Updated {lastUpdated}</span>
              <span
                className="cursor-default opacity-0 transition-opacity duration-300 hover:opacity-100"
                title={`Commit: ${buildInfo.commit}\nMessage: ${buildInfo.message}`}
              >
                ·
              </span>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
