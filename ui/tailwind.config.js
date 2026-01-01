/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic color system
        primary: {
          DEFAULT: '#3b82f6', // blue-500
          light: '#60a5fa', // blue-400
          dark: '#2563eb', // blue-600
          glow: 'rgba(59, 130, 246, 0.4)',
        },
        secondary: {
          DEFAULT: '#8b5cf6', // violet-500
          light: '#a78bfa', // violet-400
          dark: '#7c3aed', // violet-600
        },
        accent: {
          DEFAULT: '#ec4899', // pink-500
          light: '#f472b6', // pink-400
          dark: '#db2777', // pink-600
        },
        surface: {
          DEFAULT: '#131318', // card background
          elevated: '#181820',
          hover: '#1c1c24',
          input: '#0f0f14',
        },
        background: {
          DEFAULT: '#0a0a0f', // main bg
          secondary: '#131318',
        },
        border: {
          DEFAULT: '#252530',
          hover: '#2d2d3a',
          focus: '#3b82f6',
        },
        text: {
          primary: '#ffffff',
          secondary: '#a1a1b0',
          muted: '#6b6b7a',
          disabled: '#4a4a55',
        },
        success: {
          DEFAULT: '#10b981', // emerald-500
          light: '#34d399',
          glow: 'rgba(16, 185, 129, 0.3)',
        },
        danger: {
          DEFAULT: '#ef4444', // red-500
          light: '#f87171',
          glow: 'rgba(239, 68, 68, 0.3)',
        },
        warning: {
          DEFAULT: '#f59e0b', // amber-500
          light: '#fbbf24',
          glow: 'rgba(245, 158, 11, 0.3)',
        },
        info: {
          DEFAULT: '#06b6d4', // cyan-500
          light: '#22d3ee',
          glow: 'rgba(6, 182, 212, 0.3)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-strong': '0 0 30px rgba(59, 130, 246, 0.6)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glow-danger': '0 0 20px rgba(239, 68, 68, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-in-up': 'slideInUp 0.3s ease-out',
        'slide-in-down': 'slideInDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
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
}
