/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#09090B',
        surface: '#121216',
        elevated: '#1A1A21',
        overlay: '#23232B',
        border: '#2A2A33',
        'border-strong': '#3D3D4A',
        primary: { DEFAULT: '#8B5CF6', hover: '#7C3AED', soft: 'rgba(139,92,246,0.14)' },
        secondary: { DEFAULT: '#6366F1', soft: 'rgba(99,102,241,0.14)' },
        accent: { DEFAULT: '#22D3EE', soft: 'rgba(34,211,238,0.12)' },
        fg: '#FAFAFA',
        muted: '#A1A1AA',
        dim: '#8A8A96',
        success: { DEFAULT: '#22C55E', soft: 'rgba(34,197,94,0.14)' },
        warning: { DEFAULT: '#F59E0B', soft: 'rgba(245,158,11,0.14)' },
        error: { DEFAULT: '#EF4444', soft: 'rgba(239,68,68,0.14)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { sm: '6px', DEFAULT: '8px', md: '10px', lg: '12px', xl: '16px', '2xl': '20px' },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 3px rgba(0,0,0,0.5), 0 8px 24px -16px rgba(0,0,0,0.6)',
        pop: '0 12px 40px rgba(0,0,0,0.55)',
        glow: '0 0 0 3px rgba(139,92,246,0.25)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pulse2: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.16,1,0.3,1)',
        pulse2: 'pulse2 1.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
