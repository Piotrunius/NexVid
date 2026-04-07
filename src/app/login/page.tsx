/* ============================================
   Login / Register Page – macOS glass card
   ============================================ */

'use client';

import { toast } from '@/components/ui/Toaster';
import { Turnstile } from '@/components/ui/Turnstile';
import { hasCloudBackend } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Mode = 'login' | 'register';
const MIN_PASSWORD_LENGTH = 8;

export default function LoginPage() {
  const router = useRouter();
  const { loginLocal, registerLocal, loginWithBackend, registerWithBackend, isLoggedIn } = useAuthStore();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [hasTurnstile, setHasTurnstile] = useState(true);

  const hasBackendConfigured = hasCloudBackend();

  const isNetworkBackendError = (err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err || '');
    return message.includes('Network error while contacting cloud backend') || message.includes('Failed to fetch') || message.includes('AbortError');
  };

  useEffect(() => {
    if (isLoggedIn) router.push('/');
  }, [isLoggedIn, router]);

  if (isLoggedIn) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register' && password !== confirmPassword) { toast('Passwords do not match', 'error'); return; }
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) { toast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error'); return; }
    setIsSubmitting(true);
    try {
      if (hasBackendConfigured) {
        try {
          if (mode === 'login') await loginWithBackend(username, password, turnstileToken);
          else await registerWithBackend(username, password, turnstileToken);
        } catch (err) {
          if (!isNetworkBackendError(err)) throw err;

          if (mode === 'login') loginLocal(username);
          else registerLocal(username);

          toast(mode === 'login' ? 'Backend unavailable, signed in locally.' : 'Backend unavailable, created a local account.', 'warning');
          router.push('/');
          return;
        }
      } else {
        if (mode === 'login') loginLocal(username);
        else registerLocal(username);
      }
      toast(mode === 'login' ? 'Welcome back!' : 'Account created!', 'success');
      router.push('/');
    } catch (err: any) {
      toast(err?.message || 'Authentication failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-20">
      <div className="w-full max-w-md">
        {/* Banner Logo */}
        <div className="mb-8 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 sm:p-6 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] text-center">
          <Link href="/" className="text-[30px] font-extrabold tracking-tight">
            <span className="text-accent">Nex</span>
            <span className="text-text-primary">Vid</span>
          </Link>
          <p className="text-[13px] text-text-muted mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-card glass-liquid p-8">
          {/* Segmented control */}
          <div className="flex rounded-full bg-white/[0.04] backdrop-blur-2xl p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={cn(
                'flex-1 rounded-full py-2.5 text-[13px] font-medium transition-all duration-200',
                mode === 'login'
                  ? 'bg-accent text-white shadow-[0_2px_12px_var(--accent-glow)]'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={cn(
                'flex-1 rounded-full py-2.5 text-[13px] font-medium transition-all duration-200',
                mode === 'register'
                  ? 'bg-accent text-white shadow-[0_2px_12px_var(--accent-glow)]'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Nickname</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="your_nickname" className="input w-full" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className="input w-full" />
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="••••••••" className="input w-full" />
              </div>
            )}
            <Turnstile onVerify={setTurnstileToken} onAvailabilityChange={setHasTurnstile} />
            <button
              type="submit"
              disabled={isSubmitting || (hasTurnstile && !turnstileToken)}
              className="btn-accent w-full !py-3 !rounded-full text-[14px] disabled:opacity-50"
            >
              {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {!hasBackendConfigured && (
            <p className="text-[11px] text-text-muted text-center mt-4">
              Local accounts are stored in your browser. No server required.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
