'use client';

import { motion } from 'framer-motion';
import { Ghost } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div className="relative z-10 flex flex-col items-center pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <h1 className="select-none pb-2 text-[160px] font-black leading-[0.94] tracking-tight text-transparent sm:text-[240px]">
            <span className="bg-gradient-to-b from-white to-white/10 bg-clip-text">4</span>
            <span className="relative inline-block">
              <span className="to-accent/20 bg-gradient-to-b from-accent via-accent bg-clip-text text-transparent drop-shadow-[0_0_22px_var(--accent-glow)]">
                0
              </span>
              <motion.div
                className="absolute inset-0 flex items-center justify-center opacity-50 blur-xl"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <div className="bg-accent/40 h-32 w-32 rounded-full" />
              </motion.div>
            </span>
            <span className="bg-gradient-to-b from-white to-white/10 bg-clip-text">4</span>
          </h1>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2"
          >
            <Ghost className="h-24 w-24 rotate-12 text-white/10 opacity-0 sm:opacity-60" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-8 space-y-4"
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">This page is missing</h2>
          <p className="mx-auto max-w-[600px] text-base leading-relaxed text-white/50 sm:text-lg">
            The link may be outdated, the page was moved, or it no longer exists.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-12 flex flex-wrap justify-center gap-4"
        >
          <Link href="/" className="btn-accent group relative overflow-hidden">
            <span className="relative z-10">Return Home</span>
          </Link>

          <Link href="/browse" className="btn-glass group">
            <span>Browse Library</span>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
