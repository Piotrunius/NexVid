/* ============================================
  NexVid Announcement System
  Store + component for dismissible banners
  ============================================ */

'use client';

import { loadPublicAnnouncements } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'success';
  link?: { url: string; label: string };
  dismissible?: boolean;
}

const ICONS: Record<Announcement['type'], React.ReactNode> = {
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>,
  warning: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></svg>,
  update: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>,
  success: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
};

const TYPE_STYLES: Record<Announcement['type'], string> = {
  info: 'from-accent/10 to-transparent border-accent/15',
  warning: 'from-yellow-500/10 to-transparent border-yellow-500/15',
  update: 'from-blue-500/10 to-transparent border-blue-500/15',
  success: 'from-green-500/10 to-transparent border-green-500/15',
};

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('nexvid-dismissed-announcements') || '[]');
  } catch {
    return [];
  }
}

function dismissId(id: string) {
  const dismissed = getDismissedIds();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem('nexvid-dismissed-announcements', JSON.stringify(dismissed));
  }
}

export function AnnouncementBar() {
  const [visible, setVisible] = useState<Announcement[]>([]);

  useEffect(() => {
    let mounted = true;
    const dismissed = getDismissedIds();

    const load = async () => {
      const response = await loadPublicAnnouncements();
      if (!mounted) return;

      const active = (response.announcements || [])
        .map((item: any) => ({
          id: String(item.id),
          message: String(item.message || ''),
          type: (item.type || 'info') as Announcement['type'],
          link: item.link,
          dismissible: true,
        }))
        .filter((a: Announcement) => a.message)
        .filter((a: Announcement) => !dismissed.includes(a.id));

      setVisible(active);
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-0">
      {visible.map((announcement) => (
        <div
          key={announcement.id}
          className={cn(
            'announcement-bar flex items-center justify-center gap-2 border-b-[0.5px] px-4 py-2.5 text-[12px] bg-gradient-to-r backdrop-blur-sm',
            TYPE_STYLES[announcement.type]
          )}
        >
          <span className="flex-shrink-0">{ICONS[announcement.type]}</span>
          <span className="text-text-secondary">
            {announcement.message}
            {announcement.link && (
              <a
                href={announcement.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 font-semibold text-accent hover:underline"
              >
                {announcement.link.label}
              </a>
            )}
          </span>
          {announcement.dismissible !== false && (
            <button
              onClick={() => {
                dismissId(announcement.id);
                setVisible((prev) => prev.filter((a) => a.id !== announcement.id));
              }}
              className="ml-2 flex-shrink-0 rounded-[4px] p-0.5 text-text-muted hover:bg-[var(--bg-glass-light)] hover:text-text-primary transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
