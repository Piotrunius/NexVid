/* ============================================
   Toast Notification System
   ============================================ */

'use client';

import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
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
    success: 'bg-emerald-500/15 text-emerald-300',
    error: 'bg-red-500/15 text-red-300',
    info: 'bg-accent/15 text-accent',
    warning: 'bg-amber-500/15 text-amber-300',
  };

  const typeIcons: Record<string, any> = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle,
  };

  const { glassEffect } = useSettingsStore((s) => s.settings);

  const toastStyle = glassEffect
    ? 'bg-black/60 backdrop-blur-[40px] backdrop-saturate-[180%] shadow-[0_8px_40px_rgba(0,0,0,0.7)]'
    : 'bg-black/90 shadow-[0_8px_40px_rgba(0,0,0,0.85)]';

  return (
    <div
      className="fixed bottom-20 left-1/2 z-[100] flex flex-col items-center gap-2"
      style={{ transform: 'translateX(-50%)' }}
    >
      {toasts.map((t) => {
        const Icon = typeIcons[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'relative flex min-w-[300px] max-w-[450px] animate-slide-up cursor-pointer items-center justify-center rounded-full px-12 py-3.5 transition-all',
              toastStyle,
              typeStyles[t.type],
            )}
            onClick={() => removeToast(t.id)}
          >
            <Icon size={16} strokeWidth={2.5} className="absolute left-6 shrink-0" />
            <span className="text-center text-[13.5px] font-bold leading-none text-white">
              {t.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
