/* ============================================
   Keyboard Shortcuts Modal
   Press ? to toggle
   ============================================ */

'use client';

import { cn } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';

const SHORTCUTS = [
  { category: 'Playback', shortcuts: [
    { keys: ['Space', 'K'], action: 'Play / Pause' },
    { keys: ['F'], action: 'Toggle Fullscreen' },
    { keys: ['M'], action: 'Mute / Unmute' },
    { keys: ['P'], action: 'Picture-in-Picture' },
    { keys: ['T'], action: 'Theater Mode' },
  ]},
  { category: 'Navigation', shortcuts: [
    { keys: ['\u2190'], action: 'Rewind 10s' },
    { keys: ['\u2192'], action: 'Forward 10s' },
    { keys: ['\u2191'], action: 'Volume Up' },
    { keys: ['\u2193'], action: 'Volume Down' },
  ]},
  { category: 'Speed', shortcuts: [
    { keys: [','], action: 'Decrease Speed' },
    { keys: ['.'], action: 'Increase Speed' },
  ]},
  { category: 'General', shortcuts: [
    { keys: ['Esc'], action: 'Close Menus' },
    { keys: ['?'], action: 'Toggle This Modal' },
  ]},
];

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, toggle]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in" onClick={() => setIsOpen(false)}>
      <div className="mx-4 w-full max-w-lg rounded-[28px] border border-white/10 bg-[#050608]/95 p-6 animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.75)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-bold text-text-primary flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
            </svg>
            Keyboard Shortcuts
          </h2>
          <button onClick={() => setIsOpen(false)} className="rounded-[8px] p-1.5 text-text-muted hover:bg-black/50 hover:text-text-primary transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4">
          {SHORTCUTS.map((group) => (
            <div key={group.category}>
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">{group.category}</h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.action} className="flex items-center justify-between rounded-[8px] px-3 py-1.5 hover:bg-black/40">
                    <span className="text-[13px] text-text-secondary">{shortcut.action}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd key={key} className={cn(
                          'inline-flex items-center justify-center rounded-[6px]',
                          'bg-black/50 px-2 py-0.5 text-[11px] font-mono text-text-primary',
                          'min-w-[28px]'
                        )}>
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-[11px] text-text-muted">
          Press <kbd className="mx-0.5 rounded-[4px] bg-black/50 px-1.5 py-0.5 text-[10px] font-mono">?</kbd> to toggle this overlay
        </p>
      </div>
    </div>
  );
}
