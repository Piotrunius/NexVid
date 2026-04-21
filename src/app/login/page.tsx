/* ============================================
   Login / Register Page – macOS glass card
   ============================================ */

'use client';

import { toast } from '@/components/ui/Toaster';
import { Turnstile } from '@/components/ui/Turnstile';
import { hasCloudBackend } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { LIMITS, VALID_USERNAME_REGEX } from '@/lib/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Mode = 'login' | 'register';
const { PASSWORD_MIN, PASSWORD_MAX, USERNAME_MIN, USERNAME_MAX } = LIMITS;

export default function LoginPage() {
  const router = useRouter();
  const { loginLocal, registerLocal, loginWithBackend, registerWithBackend, isLoggedIn } =
    useAuthStore();

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
    return (
      message.includes('Network error while contacting cloud backend') ||
      message.includes('Failed to fetch') ||
      message.includes('AbortError')
    );
  };

  useEffect(() => {
    if (isLoggedIn) router.push('/');
  }, [isLoggedIn, router]);

  if (isLoggedIn) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register' && password !== confirmPassword) {
      toast('Passwords do not match', 'error');
      return;
    }
    if (mode === 'register') {
      if (!VALID_USERNAME_REGEX.test(username.trim())) {
        toast('Username can only contain letters, numbers, dots, underscores, and dashes', 'error');
        return;
      }
      if (username.trim().length < USERNAME_MIN) {
        toast(`Username must be at least ${USERNAME_MIN} characters`, 'error');
        return;
      }
      if (username.trim().length > USERNAME_MAX) {
        toast(`Username cannot exceed ${USERNAME_MAX} characters`, 'error');
        return;
      }
      if (password.length < PASSWORD_MIN) {
        toast(`Password must be at least ${PASSWORD_MIN} characters`, 'error');
        return;
      }
      if (password.length > PASSWORD_MAX) {
        toast(`Password cannot exceed ${PASSWORD_MAX} characters`, 'error');
        return;
      }
    }
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

          toast(
            mode === 'login'
              ? 'Backend unavailable, signed in locally.'
              : 'Backend unavailable, created a local account.',
            'warning',
          );
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
    <div className="flex min-h-screen items-center justify-center px-4 pb-20 pt-24">
      <div className="w-full max-w-md">
        {/* Banner Logo */}
        <div className="mb-8 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 text-center shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
          <Link href="/" className="text-[30px] font-extrabold tracking-tight">
            <span className="text-accent">Nex</span>
            <span className="text-text-primary">Vid</span>
          </Link>
          <p className="mt-1 text-[13px] text-text-muted">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-card glass-liquid p-8">
          {/* Segmented control matching Admin Feedback style */}
          <div className="mb-6 flex w-full gap-2 rounded-full bg-white/5 p-1">
            <button
              onClick={() => setMode('login')}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all ${mode === 'login' ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all ${mode === 'register' ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-text-secondary">
                Nickname
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="your_nickname"
                className="input w-full"
                minLength={USERNAME_MIN}
                maxLength={USERNAME_MAX}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-text-secondary">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input w-full"
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-text-secondary">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="input w-full"
                  minLength={PASSWORD_MIN}
                  maxLength={PASSWORD_MAX}
                />
              </div>
            )}
            <Turnstile onVerify={setTurnstileToken} onAvailabilityChange={setHasTurnstile} />
            <button
              type="submit"
              disabled={isSubmitting || (hasTurnstile && !turnstileToken)}
              className="btn-accent flex w-full items-center justify-center !gap-0 overflow-hidden !rounded-full !py-3 text-center text-[14px] leading-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {!hasBackendConfigured && (
            <p className="mt-4 text-center text-[11px] text-text-muted">
              Local accounts are stored in your browser. No server required.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
