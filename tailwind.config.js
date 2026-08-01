/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Раздел 18.2: палитра из шести значений на тему + две семантические.
    // Значения приходят из CSS-переменных, чтобы тема переключалась без пересборки.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ink: 'var(--ink)',
      paper: 'var(--paper)',
      surface: 'var(--surface)',
      hairline: 'var(--hairline)',
      muted: 'var(--muted)',
      accent: 'var(--accent)',
      over: 'var(--over)',
      good: 'var(--good)',
    },
    fontFamily: {
      sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
    extend: {
      fontSize: {
        // Раздел 18.3
        display: ['40px', { lineHeight: '44px', fontWeight: '500', letterSpacing: '-0.02em' }],
        title: ['22px', { lineHeight: '28px', fontWeight: '700' }],
        section: ['16px', { lineHeight: '22px', fontWeight: '600' }],
        body: ['15px', { lineHeight: '22px', fontWeight: '400' }],
        num: ['15px', { lineHeight: '22px', fontWeight: '500' }],
        caption: ['13px', { lineHeight: '18px', fontWeight: '400' }],
        label: ['11px', { lineHeight: '14px', fontWeight: '600', letterSpacing: '0.08em' }],
      },
      borderColor: { DEFAULT: 'var(--hairline)' },
      boxShadow: {
        // Единственная разрешённая тень — под выезжающими листами (18.2)
        sheet: '0 -8px 32px rgba(0,0,0,0.18)',
      },
      spacing: {
        touch: '44px',
        safe: 'env(safe-area-inset-bottom, 0px)',
      },
      transitionTimingFunction: {
        sheet: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        sheetIn: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        sheetIn: 'sheetIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        fadeIn: 'fadeIn 150ms ease-out',
      },
    },
  },
  plugins: [],
};
