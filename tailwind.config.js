/** @type {import('tailwindcss').Config} */

// All theme colours are CSS variables defined in src/renderer/index.css.
// Tailwind utilities like `bg-bg-surface`, `text-text-muted`, `border-border`
// resolve to those variables, so toggling `data-theme="light"` on <html>
// swaps the whole palette without component-level changes.

const cssVar = (name) => `rgb(from var(${name}) r g b / <alpha-value>)`;

export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: cssVar('--color-bg'),
          surface: cssVar('--color-bg-surface'),
          elevated: cssVar('--color-bg-elevated'),
          hover: cssVar('--color-bg-hover'),
        },
        border: {
          DEFAULT: cssVar('--color-border'),
          strong: cssVar('--color-border-strong'),
        },
        text: {
          DEFAULT: cssVar('--color-text'),
          muted: cssVar('--color-text-muted'),
          dim: cssVar('--color-text-dim'),
        },
        accent: {
          DEFAULT: cssVar('--color-accent'),
          hover: cssVar('--color-accent-hover'),
        },
        success: cssVar('--color-success'),
        warn: cssVar('--color-warn'),
        danger: cssVar('--color-danger'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
