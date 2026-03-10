import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'xhs-red': '#FF2442',
        'xhs-pink': '#FFE4E8',
        'xhs-gray': '#F5F5F5',
        'xhs-dark': '#1A1A1A',
        'xhs-muted': '#8C8C8C',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto-sans-sc)', 'system-ui', 'sans-serif'],
        noto: ['var(--font-noto-sans-sc)', 'sans-serif'],
      },
      borderRadius: {
        'xhs': '12px',
        'xhs-lg': '20px',
      },
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      boxShadow: {
        'xhs': '0 2px 12px rgba(255, 36, 66, 0.08)',
        'xhs-card': '0 4px 20px rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'sparkle': 'sparkle 1.2s ease-in-out infinite',
        'pulse-red': 'pulse-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        sparkle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
          '50%': { opacity: '0.7', transform: 'scale(1.15) rotate(15deg)' },
        },
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 36, 66, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(255, 36, 66, 0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
