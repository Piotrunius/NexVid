/* ============================================
   Cloudflare Turnstile Widget
   Anti-bot challenge for auth protection
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onAvailabilityChange?: (enabled: boolean) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

export function Turnstile({ onVerify, onError, onAvailabilityChange }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/public-config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        const key = String(data?.turnstileSiteKey || '').trim();
        setSiteKey(key);
        onAvailabilityChange?.(Boolean(key));
      })
      .catch(() => {
        if (!active) return;
        setSiteKey('');
        onAvailabilityChange?.(false);
      });

    return () => {
      active = false;
    };
  }, [onAvailabilityChange]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        'error-callback': onError,
        theme: 'dark',
        size: 'flexible',
      });
    };

    // If turnstile is already loaded
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Load the script
    window.onTurnstileLoad = renderWidget;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
      }
    };
  }, [siteKey, onVerify, onError]);

  if (!siteKey) return null;

  return <div ref={containerRef} className="my-3" />;
}
