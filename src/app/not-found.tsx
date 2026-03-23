'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, Search, Film, Ghost } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-4 text-center">
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[120px]" />
        <div className="absolute top-0 left-0 h-[400px] w-[400px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-blue-500/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-purple-500/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <h1 className="select-none text-[160px] font-black leading-none tracking-tighter text-transparent sm:text-[240px]">
            <span className="bg-gradient-to-b from-white to-white/10 bg-clip-text">4</span>
            <span className="relative inline-block">
              <span className="bg-gradient-to-b from-accent to-accent/20 bg-clip-text text-transparent">0</span>
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
                <div className="h-32 w-32 rounded-full bg-accent/40" />
              </motion.div>
            </span>
            <span className="bg-gradient-to-b from-white to-white/10 bg-clip-text">4</span>
          </h1>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
             <Ghost className="h-28 w-28 text-white/5 opacity-0 sm:opacity-100 rotate-12" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-8 space-y-4"
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Scene Not Found
          </h2>
          <p className="mx-auto max-w-[600px] text-base text-white/50 sm:text-lg leading-relaxed">
            This scene seems to have been cut from the final edit. It might have been moved, deleted, or never existed in the script.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-12 flex flex-wrap justify-center gap-4"
        >
          <Link href="/" className="btn-accent group relative overflow-hidden">
            <span className="relative z-10 flex items-center gap-2">
              <Home className="h-4 w-4" />
              Return Home
            </span>
          </Link>
          
          <Link href="/search" className="btn-glass group">
            <Search className="h-4 w-4 text-white/70 transition-colors group-hover:text-white" />
            <span>Search Library</span>
          </Link>
        </motion.div>
      </div>

      {/* Decorative floating elements */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/5"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
            }}
            animate={{
              y: [0, -40, 0],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: Math.random() * 5 + 5,
              repeat: Infinity,
              ease: 'linear',
              delay: Math.random() * 5,
            }}
          />
        ))}
      </div>
    </div>
  );
}
