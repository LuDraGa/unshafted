/**
 * Shared setup for every React suite in the workspace.
 *
 * Referenced by each package's `vitest.config.ts` as `../../vitest.setup.ts`, the same way each
 * package's `format` script reaches the root `.prettierignore`. One file, so the DOM matchers and
 * the between-test cleanup cannot drift apart per package.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL only auto-cleans when a global `afterEach` exists, and these suites do not use globals.
afterEach(() => {
  cleanup();
});
