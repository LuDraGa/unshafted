import { withPageConfig } from '@extension/vite-config';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

/** The name `Popup.tsx` asks Chrome for: `chrome.runtime.getURL('popup/pdf.worker.min.mjs')`. */
const WORKER_FILE = 'pdf.worker.min.mjs';

/**
 * The `legacy/` build, matching the API half that `unshafted-core/lib/pdf.ts` imports. pdf.js
 * refuses to run an API against a worker from a different build, so these two strings are one
 * decision and have to move together — `packages/unshafted-core/test/pdf-worker.test.ts` fails if
 * they stop agreeing.
 */
const PDFJS_API = 'pdfjs-dist/legacy/build/pdf.mjs';
const PDFJS_WORKER = `pdfjs-dist/legacy/build/${WORKER_FILE}`;

/**
 * Emit pdf.js's worker out of the installed package instead of keeping a copy in `public/`.
 *
 * The worker used to be a hand-copied 1.3 MB artefact, and nothing noticed when it fell behind
 * `pdfjs-dist` (#22). Nothing *could*: a static asset in `public/` is copied verbatim and never
 * resolved by the bundler, so type-check, lint, the ZIP audit and the whole test suite all pass
 * while the extension throws `The API version "6.3.289" does not match the Worker version
 * "4.10.38"` in a real browser, on a real user's first PDF. Node cannot catch it either — it falls
 * back to a fake worker and never performs the handshake.
 *
 * Copying at build time removes the divergence by removing the duplicate. There is now one
 * installed version, and both halves come out of it, so a Dependabot bump moves them together or
 * fails loudly here.
 *
 * `pdfjs-dist` is declared by `@extension/unshafted-core`, not by this page, and pnpm does not
 * hoist it — so resolution goes *through* that package. That indirection is the guarantee: it is
 * the same install that serves the API half at runtime.
 */
const pdfWorkerAsset = (): Plugin => ({
  name: 'unshafted:pdf-worker-asset',

  buildStart() {
    const stale = resolve(rootDir, 'public', WORKER_FILE);
    if (existsSync(stale)) {
      throw new Error(
        `${stale} exists. The worker is emitted from the installed pdfjs-dist at build time now, ` +
          `so a copy in public/ would silently win and reintroduce the drift #22 removed. Delete it.`,
      );
    }

    const fromCore = createRequire(createRequire(import.meta.url).resolve('@extension/unshafted-core/package.json'));
    const apiPath = fromCore.resolve(PDFJS_API);
    const workerPath = fromCore.resolve(PDFJS_WORKER);

    if (dirname(apiPath) !== dirname(workerPath)) {
      throw new Error(
        `pdf.js API and worker resolved to different builds:\n  api    ${apiPath}\n  worker ${workerPath}\n` +
          `They must come from one install, or the version handshake fails at getDocument() time.`,
      );
    }

    this.info(`pdf.js worker from ${fromCore('pdfjs-dist/package.json').version} (${workerPath})`);
    this.emitFile({ type: 'asset', fileName: WORKER_FILE, source: readFileSync(workerPath) });
  },

  /** The emit above is what the extension loads at runtime; confirm it actually reached disk. */
  writeBundle(options) {
    const written = resolve(options.dir ?? rootDir, WORKER_FILE);
    if (!existsSync(written)) {
      throw new Error(`${WORKER_FILE} did not reach ${options.dir}. The built extension cannot read PDFs.`);
    }
  },
});

export default withPageConfig({
  plugins: [pdfWorkerAsset()],
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'popup'),
  },
});
