'use client';

import Link from 'next/link';
import { useMemo } from 'react';

export default function VerifyEmailPage() {
  const message = useMemo(() => 'Email verification is disabled. You can sign in directly.', []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-20">
      <div className="w-full max-w-md panel-glass rounded-[16px] p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-text-primary">Account Access</h1>
        <p className="text-text-muted text-[13px]">{message}</p>
        <Link href="/login" className="btn-accent inline-flex px-4 py-2">
          Go to Login
        </Link>
      </div>
    </div>
  );
}
