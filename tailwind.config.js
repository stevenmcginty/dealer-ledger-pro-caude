/** @type {import('tailwindcss').Config} */

// Forecourt Ledger tokens live in styles.css as "R G B" channels (--c-*), so
// every token colour supports opacity modifiers like bg-surface/50.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  // utils/themeMode.ts always sets data-theme to the resolved theme on <html>.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './LedgerCore.tsx',
    './{components,pages,hooks,contexts,utils,services,admin}/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"Atkinson Hyperlegible Mono"', 'ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Consolas', 'monospace'],
        // Printed documents and PDFs keep Inter.
        paper: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: 'rgb(var(--color-brand-50) / <alpha-value>)',
          100: 'rgb(var(--color-brand-100) / <alpha-value>)',
          200: 'rgb(var(--color-brand-200) / <alpha-value>)',
          300: 'rgb(var(--color-brand-300) / <alpha-value>)',
          400: 'rgb(var(--color-brand-400) / <alpha-value>)',
          500: 'rgb(var(--color-brand-500) / <alpha-value>)',
          600: 'rgb(var(--color-brand-600) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
          800: 'rgb(var(--color-brand-800) / <alpha-value>)',
          900: 'rgb(var(--color-brand-900) / <alpha-value>)',
          950: 'rgb(var(--color-brand-950) / <alpha-value>)',
        },
        bg: token('bg'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2'), 3: token('surface-3') },
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          press: token('accent-press'),
          soft: token('accent-soft'),
          'soft-ink': token('accent-soft-ink'),
          text: token('accent-text'),
        },
        'on-accent': token('on-accent'),
        focus: token('focus'),
        success: { DEFAULT: token('success'), soft: token('success-soft'), ink: token('success-ink') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft'), ink: token('warning-ink') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft'), ink: token('danger-ink'), hover: token('danger-hover') },
        'on-danger': token('on-danger'),
        info: { DEFAULT: token('info'), soft: token('info-soft'), ink: token('info-ink') },
        plate: { yellow: token('plate-yellow'), white: token('plate-white'), ink: token('plate-ink') },
        // The scrim's opacity differs per theme (.5 light, .64 dark); a modifier scales it.
        scrim: 'rgb(var(--c-scrim) / calc(var(--c-scrim-alpha) * <alpha-value>))',
        skel: { 1: token('skel-1'), 2: token('skel-2') },
        bubble: { in: token('bubble-in'), out: token('bubble-out') },
      },
      borderRadius: { chip: '4px', control: '8px', card: '12px', sheet: '20px' },
      boxShadow: { e1: 'var(--e-1)', e2: 'var(--e-2)', e3: 'var(--e-3)' },
      zIndex: { sticky: '10', nav: '20', dropdown: '30', sheet: '40', dialog: '50', toast: '60' },
      transitionDuration: { press: '90ms', quick: '160ms', base: '240ms', sheet: '320ms' },
      transitionTimingFunction: {
        out: 'cubic-bezier(.2,.8,.2,1)',
        in: 'cubic-bezier(.4,0,1,1)',
        sheet: 'cubic-bezier(.32,.72,0,1)',
      },
    },
  },
  plugins: [],
};
