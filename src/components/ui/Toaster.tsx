/* ============================================
   Toast Notification System
   ============================================ */

'use client';

import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// Global toast function accessible outside React
let globalAddToast: ((toast: Omit<Toast, 'id'>) => void) | null = null;

export function toast(message: string, type: Toast['type'] = 'info') {
  globalAddToast?.({ message, type });
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, toast.duration || 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    globalAddToast = addToast;
    return () => {
      globalAddToast = null;
    };
  }, [addToast]);

  const typeStyles: Record<string, string> = {
    success: 'border-emerald-500/20 bg-emerald-500/10',
    error: 'border-red-500/20 bg-red-500/10',
    info: 'border-accent/20 border-accent/30',
    warning: 'border-amber-500/20 bg-amber-500/10',
  };

  const typeIcons: Record<string, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  const { glassEffect } = useSettingsStore((s) => s.settings);

  return (
    <div className="fixed bottom-20 left-1/2 z-[100] flex flex-col items-center gap-2" style={{ transform: 'translateX(-50%)' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'glass-card animate-slide-up flex items-center gap-3 px-4 py-3',
            'min-w-[280px] max-w-[400px] cursor-pointer',
            glassEffect && 'glass-liquid backdrop-blur-[40px]',
            typeStyles[t.type]
          )}
          onClick={() => removeToast(t.id)}
        >
          <span className="text-[13px] font-bold">{typeIcons[t.type]}</span>
          <span className="text-[13px] text-text-primary">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
