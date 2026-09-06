import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  build: {
    // Must match `side_panel.default_path` in chrome-extension/manifest.ts.
    outDir: resolve(rootDir, '..', '..', 'dist', 'side-panel'),
  },
});
