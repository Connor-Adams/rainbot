/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Values come from the design system's semantic layer; Rainbot's brand
        // re-points a subset of those tokens upstream, in
        // @connor-adams/tokens/brands/rainbot.css. Class names here
        // (bg-surface, text-text-secondary, border-border) are unchanged, so
        // component code does not move — only where the colour comes from.
        //
        // The brand is a DELTA: it names the hues and lets surfaces, borders and
        // greys fall through to the active theme. So anything below that needs a
        // step the semantic layer has no name for is derived with color-mix from
        // a token, never hardcoded — that is what keeps it following the brand.
        primary: {
          DEFAULT: 'var(--primary)',
          light: 'var(--rb-blue-400)',
          dark: 'var(--primary-hover)',
          glow: 'color-mix(in oklch, var(--primary) 40%, transparent)',
        },
        // Rainbot's second brand hue. Deliberately NOT --secondary: that token
        // means "quiet neutral chip surface" to every component that reads it,
        // so re-pointing it at a saturated colour would make the design
        // system's own secondary surfaces violet. The brand exposes the hue as a
        // primitive instead.
        secondary: {
          DEFAULT: 'var(--rb-violet-500)',
          light: 'var(--rb-violet-400)',
          dark: 'color-mix(in oklch, var(--rb-violet-500) 85%, black)',
        },
        // Same reasoning as secondary: --accent is the design system's subtle
        // hover FILL (Button outline/ghost read it as a background), not a hue.
        // Rainbot's pink comes from the primitive.
        accent: {
          DEFAULT: 'var(--rb-pink-500)',
          light: 'var(--rb-pink-400)',
          dark: 'color-mix(in oklch, var(--rb-pink-500) 85%, black)',
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
          hover: 'color-mix(in oklch, var(--border) 70%, var(--muted-foreground))',
          focus: 'var(--ring)',
        },
        text: {
          primary: 'var(--foreground)',
          secondary: 'var(--muted-foreground)',
          muted: 'color-mix(in oklch, var(--muted-foreground) 80%, var(--background))',
          disabled: 'color-mix(in oklch, var(--muted-foreground) 55%, var(--background))',
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
          DEFAULT: 'var(--info)',
          light: 'color-mix(in oklch, var(--info) 75%, white)',
          dark: 'color-mix(in oklch, var(--info) 80%, black)',
          glow: 'color-mix(in oklch, var(--info) 30%, transparent)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px color-mix(in oklch, var(--primary) 40%, transparent)',
        'glow-strong': '0 0 30px color-mix(in oklch, var(--primary) 60%, transparent)',
        'glow-success': '0 0 20px color-mix(in oklch, var(--success) 40%, transparent)',
        'glow-danger': '0 0 20px color-mix(in oklch, var(--danger) 40%, transparent)',
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
