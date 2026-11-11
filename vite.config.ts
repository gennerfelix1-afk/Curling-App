import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site under /<repo>/; override with BASE_PATH if needed.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { target: 'es2022', sourcemap: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
