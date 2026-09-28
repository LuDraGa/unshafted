import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    // Mirrors vite.config.mts. Vitest does not read that file, and importing `withPageConfig`
    // would drag in the whole build pipeline this suite has no use for.
    alias: { '@src': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(import.meta.dirname, '..', '..', 'vitest.setup.ts')],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
