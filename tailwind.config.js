/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
          elevated: "var(--bg-elevated)",
          glass: "var(--bg-glass)",
          "glass-heavy": "var(--bg-glass-heavy)",
          "glass-light": "var(--bg-glass-light)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          muted: "var(--accent-muted)",
          glow: "var(--accent-glow)",
        },
        border: {
          DEFAULT: "var(--border)",
          glass: "var(--border-glass)",
          strong: "var(--border-strong)",
        },
      },
      borderRadius: {
        glass: "var(--glass-radius)",
        "glass-sm": "var(--glass-radius-sm)",
        "glass-lg": "var(--glass-radius-lg)",
        "glass-xl": "var(--glass-radius-xl)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
        "glass-heavy": "var(--glass-blur-heavy)",
        "glass-subtle": "12px",
      },
      boxShadow: {
        ambient: "var(--shadow-ambient)",
        elevated: "var(--shadow-elevated)",
        "glow-sm": "var(--shadow-glow-sm)",
        "glow-md": "var(--shadow-glow-md)",
        "glow-lg": "var(--shadow-glow-lg)",
        glass: "0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)",
        "glass-hover":
          "0 16px 48px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)",
        "accent-glow": "0 0 40px var(--accent-glow)",
        "accent-glow-lg": "0 0 60px var(--accent-glow)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s var(--ease-out-expo)",
        "slide-up": "slideUp 0.6s var(--spring-smooth)",
        "slide-down": "slideDown 0.5s var(--spring-smooth)",
        "scale-in": "scaleIn 0.35s var(--spring-smooth)",
        "slide-left": "slideLeft 0.4s var(--spring-smooth)",
        "bounce-in": "bounceIn 0.5s var(--spring)",
        shimmer: "shimmer 2s infinite ease-in-out",
        "pulse-glow": "pulseGlow 3s infinite ease-in-out",
        float: "float 3s infinite ease-in-out",
        "dock-bounce": "dockBounce 0.5s var(--spring)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-12px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.9)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        slideLeft: {
          from: { opacity: "0", transform: "translateX(100%)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        bounceIn: {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "60%": { transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 12px var(--accent-muted)" },
          "50%": { boxShadow: "0 0 30px var(--accent-glow)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        dockBounce: {
          "0%": { transform: "translateY(0) scale(1)" },
          "40%": { transform: "translateY(-6px) scale(1.15)" },
          "60%": { transform: "translateY(-2px) scale(1.08)" },
          "100%": { transform: "translateY(0) scale(1)" },
        },
      },
      transitionTimingFunction: {
        spring: "var(--spring)",
        "spring-smooth": "var(--spring-smooth)",
        "out-expo": "var(--ease-out-expo)",
      },
    },
  },
  plugins: [],
};
