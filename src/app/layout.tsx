/* ============================================
   Root Layout – Apple Sequoia Pitch Black
   ============================================ */

import { Navbar } from '@/components/layout/Navbar';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { Toaster } from '@/components/ui/Toaster';
import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nexvid.online').replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'NexVid - Watch Movies & TV Shows',
  description: 'Your personal streaming hub',
  keywords: ['streaming', 'movies', 'tv shows', 'nexvid', 'free'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'NexVid - Watch Movies & TV Shows',
    description: 'Your personal streaming hub',
    type: 'website',
    url: SITE_URL,
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <div className="flex min-h-screen flex-col bg-black">
            <Navbar />
            <main className="flex-1">{children}</main>
          </div>
          <Toaster />
          <KeyboardShortcuts />
        </ThemeProvider>
      </body>
    </html>
  );
}
