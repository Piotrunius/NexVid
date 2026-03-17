'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { loadPublicAnnouncements } from '@/lib/cloudSync';
import { useSettingsStore } from '@/stores/settings';

interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'success';
  link?: { url: string; label: string };
  isImportant: boolean;
}

const TYPE_CONFIG = {
  info: {
    title: 'Announcement',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>,
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/20'
  },
  warning: {
    title: 'Important Warning',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></svg>,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20'
  },
  update: {
    title: 'System Update',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20'
  },
  success: {
    title: 'Great News!',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20'
  }
};

export function ImportantAnnouncementModal() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Allow everywhere, but user specified homepage style behavior?
  // Usually important announcements should show everywhere until dismissed.
  // But let's restrict to homepage to avoid interrupting playback/browsing too much if they prefer.
  const isHomepage = pathname === '/' || pathname === '';

  useEffect(() => {
    const checkAnnouncements = async () => {
      try {
        const res = await loadPublicAnnouncements();
        if (!res.announcements) return;

        // Find the latest active important announcement
        const important = res.announcements.find((a: any) => a.isImportant);
        if (!important) return;

        const id = important.id;
        const isDismissed = localStorage.getItem(`announcement_dismissed_${id}`);

        if (isDismissed) return;

        setAnnouncement(important);
        setIsVisible(true);
      } catch (err) {
        console.error('Failed to load important announcements:', err);
      }
    };

    checkAnnouncements();
  }, [pathname]);

  const handleClose = () => {
    if (announcement) {
      localStorage.setItem(`announcement_dismissed_${announcement.id}`, 'true');
    }
    setIsVisible(false);
  };

  const { glassEffect } = useSettingsStore((s) => s.settings);

  if (!isVisible || !announcement) return null;

  const config = TYPE_CONFIG[announcement.type] || TYPE_CONFIG.info;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-fade-in">
      <div className={cn(
        "glass-card w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 shadow-[0_32px_128px_rgba(0,0,0,0.9)] animate-scale-in",
        glassEffect && "glass-liquid"
      )}>
        <div className="relative p-8 text-center">
          <div className={cn(
            "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border transition-transform duration-500 hover:scale-110",
            config.bg, config.color, config.border
          )}>
            {config.icon}
          </div>

          <h2 className="mb-3 text-[22px] font-black tracking-tight text-white">{config.title}</h2>
          <p className="mb-8 whitespace-pre-wrap text-[15px] leading-relaxed text-white/70">
            {announcement.message}
          </p>

          <div className="space-y-3">
            {announcement.link && (
              <a
                href={announcement.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-accent flex w-full items-center justify-center py-4 font-bold uppercase tracking-widest shadow-[0_8px_24px_rgba(var(--accent-rgb),0.3)]"
              >
                {announcement.link.label || 'Learn more'}
              </a>
            )}
            <button
              onClick={handleClose}
              className="btn-glass flex w-full items-center justify-center py-4 text-[14px] font-bold uppercase tracking-widest text-white/40 hover:text-white"
            >
              Got it, close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
