import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Map to VS Code theme tokens via CSS variables defined in src/styles/tokens.css.
        canvas: 'var(--ig-canvas)',
        node: 'var(--ig-node)',
        edge: 'var(--ig-edge)',
      },
    },
  },
  plugins: [],
};

export default config;
