import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(import.meta.dirname, '..', '..', 'vitest.setup.ts')],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
