import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        soil:      '#3B2F1E',
        bark:      '#5C3D1E',
        clay:      '#8B5E3C',
        sand:      '#C4A882',
        straw:     '#E8D5B0',
        parchment: '#F5EDD8',
        cream:     '#FAF6EE',
        moss:      '#4A6741',
        sage:      '#7A9B6E',
        water:     '#4A7C8E',
        rust:      '#8B3A2A',
        amber:     '#C17D2A',
        gold:      '#D4A843',
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"Source Serif 4"', 'Georgia', '"Times New Roman"', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(59, 47, 30, 0.08), 0 1px 2px rgba(59, 47, 30, 0.06)',
        'card-hover': '0 4px 12px rgba(59, 47, 30, 0.12)',
        modal: '0 20px 60px rgba(59, 47, 30, 0.25)',
      },
      keyframes: {
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 1.2s linear infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
