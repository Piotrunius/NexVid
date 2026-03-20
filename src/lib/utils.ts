import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function tmdbImage(path: string | null, size: string = 'w500'): string {
  if (!path) return '/placeholder.svg';
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function getBestQuality(
  qualities: Partial<Record<string, { url: string }>>
): { quality: string; url: string } | null {
  const order = ['4k', '2k', '1080', '720', '480', '360', 'unknown'];
  for (const q of order) {
    if (qualities[q]) return { quality: q, url: qualities[q]!.url };
  }
  // fall back for upstream 1440 labels
  if (qualities['1440']) return { quality: '2k', url: qualities['1440']!.url };
  return null;
}

export function getQualityLabel(quality: string): string {
  const labels: Record<string, string> = {
    '4k': '2160p (UHD)',
    '2k': '1440p (QHD)',
    '1440': '1440p (QHD)',
    '1080': '1080p (FHD)',
    '720': '720p (HD)',
    '480': '480p (SD)',
    '360': '360p (SD)',
    unknown: 'Unknown Quality',
  };
  return labels[quality] || quality;
}
