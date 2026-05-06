/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d12',
          surface: '#11141b',
          elevated: '#161a23',
          hover: '#1c2230',
        },
        border: {
          DEFAULT: '#1f2532',
          strong: '#2a3142',
        },
        text: {
          DEFAULT: '#e5e7eb',
          muted: '#9aa3b2',
          dim: '#6b7280',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#7c7ff5',
        },
        success: '#10b981',
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
