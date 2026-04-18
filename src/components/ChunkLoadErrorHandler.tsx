'use client';

import { useEffect } from 'react';

export default function ChunkLoadErrorHandler() {
  useEffect(() => {
    let hasReloaded = false;

    const onError = (event: ErrorEvent) => {
      if (hasReloaded) return;

      const message = event.error?.message || event.message || '';
      const isChunkLoadError =
        message?.includes('Loading chunk') || message?.includes('ChunkLoadError');

      if (isChunkLoadError) {
        hasReloaded = true;
        window.location.reload();
      }
    };

    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);

  return null;
}
