'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

interface Particle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  tx: number; // target x offset
  ty: number; // target y offset
  tr: number; // target rotation
}

export function DonateButton() {
  const [isBursting, setIsBursting] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isWatchPage = pathname?.startsWith('/watch/');

  const handleDonate = () => {
    if (isBursting) return;
    
    setIsBursting(true);
    
    // Generate particles bursting from the button
    const newParticles: Particle[] = Array.from({ length: 20 }).map((_, i) => ({
      id: Date.now() + i,
      x: 0,
      y: 0,
      rotation: Math.random() * 360,
      scale: 0.4 + Math.random() * 0.8,
      tx: (Math.random() - 0.5) * 500, // Random horizontal spread
      ty: -300 - Math.random() * 500,  // Always burst upwards
      tr: Math.random() * 720 - 360,   // Random spin
    }));
    
    setParticles(newParticles);

    // Trigger redirect after animation peak
    setTimeout(() => {
      window.open('https://buycoffee.to/piotrunius', '_blank');
    }, 1000);

    // Cleanup
    setTimeout(() => {
      setIsBursting(false);
      setParticles([]);
    }, 2500);
  };

  if (!mounted || isWatchPage) return null;

  return (
    <>
      {/* Floating Support Button */}
      <div className="fixed bottom-6 right-6 z-[60] animate-fade-in [animation-delay:1s]">
        <button
          ref={buttonRef}
          onClick={handleDonate}
          className={cn(
            "group relative flex items-center gap-2.5 px-5 py-3 rounded-full",
            "bg-white/[0.03] backdrop-blur-3xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
            "hover:bg-white/[0.08] hover:border-white/10 hover:scale-105 active:scale-95 transition-all duration-500",
            "overflow-hidden"
          )}
        >
          {/* Particles burst relative to this container */}
          {isBursting && particles.map((p) => (
            <div
              key={p.id}
              className="absolute left-1/2 top-1/2 pointer-events-none animate-particle"
              style={{
                '--tx': `${p.tx}px`,
                '--ty': `${p.ty}px`,
                '--tr': `${p.tr}deg`,
                '--scale': p.scale,
              } as any}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_15px_var(--accent-glow)]" />
            </div>
          ))}

          {/* Subtle Glow Background */}
          <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Icon with Pulse */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 bg-accent blur-md opacity-20 group-hover:opacity-40 animate-pulse transition-opacity" />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent group-hover:rotate-12 transition-transform duration-500">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
            </svg>
          </div>

          <span className="text-[14px] font-black text-white/90 group-hover:text-white tracking-tight uppercase">Support Me</span>
        </button>
      </div>

      {/* Full Screen Thank You Overlay */}
      {isBursting && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-black/70 animate-fade-in backdrop-blur-md">
          <div className="text-center animate-scale-in px-6">
            <h2 className="text-[48px] sm:text-[72px] font-black text-white tracking-tighter drop-shadow-[0_0_40px_rgba(var(--accent-rgb),0.8)] uppercase leading-none">
              THANK YOU
            </h2>
            <div className="h-1.5 w-32 bg-accent mx-auto mt-6 rounded-full shadow-[0_0_30px_var(--accent-glow)]" />
            <p className="text-white/60 font-black tracking-[0.3em] uppercase text-[12px] mt-8 opacity-80">
              Redirecting to Support
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes particle-burst {
          0% { 
            transform: translate(-50%, -50%) scale(0) rotate(0deg); 
            opacity: 0; 
          }
          10% { 
            opacity: 1; 
          }
          100% { 
            transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(var(--scale)) rotate(var(--tr)); 
            opacity: 0; 
          }
        }
        .animate-particle {
          animation: particle-burst 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </>
  );
}
