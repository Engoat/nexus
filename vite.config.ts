import react from '@vitejs/plugin-react';
// vitest/config re-exports Vite's defineConfig with the `test` field typed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: true },
  test: {
    // Algorithm tests run in node; the UI smoke test opts into jsdom by comment.
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Un rendu React complet sous jsdom coûte quelques secondes.
    testTimeout: 20_000,
  },
});
