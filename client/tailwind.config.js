/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void:     'rgb(7 7 15 / <alpha-value>)',
        obsidian: 'rgb(13 13 26 / <alpha-value>)',
        onyx:     'rgb(18 18 31 / <alpha-value>)',
        graphite: 'rgb(26 26 46 / <alpha-value>)',
        slate:    'rgb(37 37 64 / <alpha-value>)',
        muted:    'rgb(58 58 92 / <alpha-value>)',
        gold: {
          50:  '#FFF8E7',
          100: '#FFEFC0',
          200: '#FFD97A',
          300: 'rgb(245 200 66 / <alpha-value>)',
          400: 'rgb(232 184 32 / <alpha-value>)',
          500: 'rgb(201 160 48 / <alpha-value>)',
          600: '#A07820',
          700: '#7A5C18',
          800: '#5C4410',
          900: 'rgb(58 42 8 / <alpha-value>)',
        },
        crimson: {
          300: '#FCA5A5',
          400: 'rgb(248 113 113 / <alpha-value>)',
          500: 'rgb(239 68 68 / <alpha-value>)',
          900: 'rgb(69 10 10 / <alpha-value>)',
        },
        sapphire: {
          300: '#93C5FD',
          400: 'rgb(96 165 250 / <alpha-value>)',
          500: 'rgb(59 130 246 / <alpha-value>)',
          900: 'rgb(12 20 69 / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'gold':     '0 0 20px rgba(201,160,48,0.25)',
        'gold-lg':  '0 0 40px rgba(201,160,48,0.35)',
        'card':     '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        'critical': '0 0 30px rgba(239,68,68,0.4)',
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in':  'fadeIn 0.4s ease-out',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
