/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Values come from the design system's semantic layer; Rainbot's brand
        // re-points those tokens in src/styles/rainbot-brand.css. Class names
        // here (bg-surface, text-text-secondary, border-border) are unchanged,
        // so component code does not move — only where the colour comes from.
        primary: {
          DEFAULT: 'var(--primary)',
          light: 'var(--rb-blue-400)',
          dark: 'var(--primary-hover)',
          glow: 'color-mix(in oklch, var(--primary) 40%, transparent)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          light: 'var(--rb-violet-400)',
          dark: 'var(--secondary-hover)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          light: 'var(--rb-pink-400)',
          dark: 'var(--rb-pink-600)',
        },
        surface: {
          DEFAULT: 'var(--card)',
          elevated: 'var(--popover)',
          hover: 'var(--muted)',
          input: 'var(--input)',
        },
        background: {
          DEFAULT: 'var(--background)',
          secondary: 'var(--card)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--rb-ink-600)',
          focus: 'var(--ring)',
        },
        text: {
          primary: 'var(--foreground)',
          secondary: 'var(--muted-foreground)',
          muted: 'var(--rb-ink-400)',
          disabled: 'var(--rb-ink-500)',
        },
        success: {
          DEFAULT: 'var(--success)',
          light: 'color-mix(in oklch, var(--success) 75%, white)',
          dark: 'color-mix(in oklch, var(--success) 80%, black)',
          glow: 'color-mix(in oklch, var(--success) 30%, transparent)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          light: 'color-mix(in oklch, var(--danger) 75%, white)',
          dark: 'color-mix(in oklch, var(--danger) 80%, black)',
          glow: 'color-mix(in oklch, var(--danger) 30%, transparent)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          light: 'color-mix(in oklch, var(--warning) 75%, white)',
          dark: 'color-mix(in oklch, var(--warning) 80%, black)',
        },
        info: {
          DEFAULT: '#06b6d4', // cyan-500
          light: '#22d3ee',
          dark: '#0891b2', // cyan-600
          glow: 'rgba(6, 182, 212, 0.3)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-strong': '0 0 30px rgba(59, 130, 246, 0.6)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glow-danger': '0 0 20px rgba(239, 68, 68, 0.4)',
      },
      zIndex: {
        header: '50',
        modal: '100',
        toast: '1000',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-in-up': 'slideInUp 0.3s ease-out',
        'slide-in-down': 'slideInDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInDown: {
          from: { opacity: '0', transform: 'translateY(-20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
