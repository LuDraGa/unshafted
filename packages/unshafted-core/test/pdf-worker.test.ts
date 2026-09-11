import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/**
 * pdf.js compares `apiVersion` against `workerVersion` during the worker handshake and throws if
 * they differ. That throw lands at `getDocument()` time, in a real browser, on a real user's first
 * PDF — every other signal the project has says the build is fine (#22).
 *
 * Node cannot reproduce the handshake: it falls back to a fake worker and never performs one. So
 * these tests do the part Node *can* do — pin the two facts the popup's build plugin relies on to
 * keep the API and the worker in one install. The plugin does the copying; this makes sure the
 * ground it stands on has not moved.
 */

const PDF_SOURCE = fileURLToPath(new URL('../lib/pdf.ts', import.meta.url));

test('pdf.ts imports the legacy build, which is what the popup emits a worker for', () => {
  const source = readFileSync(PDF_SOURCE, 'utf8');

  // `pages/popup/vite.config.mts` hardcodes `pdfjs-dist/legacy/build/`. If this import ever moves
  // to the non-legacy build, the popup would ship a legacy worker against a modern API and the
  // handshake would fail in the browser with nothing else noticing.
  assert.match(
    source,
    /from 'pdfjs-dist\/legacy\/build\/pdf\.mjs'/,
    'pdf.ts no longer imports the legacy build; pages/popup/vite.config.mts must move with it',
  );
});

test('the API and worker files ship from a single pdfjs-dist install', () => {
  const api = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

  assert.equal(dirname(api), dirname(worker), 'pdf.js API and worker resolved to different builds');
});

test('no vendored worker copy has crept back into the popup', () => {
  // The copy this replaced was 1.3 MB of build artefact that nothing kept in step with the
  // package. A file here again means the drift is back, and `public/` wins over the emitted asset.
  const vendored = fileURLToPath(new URL('../../../pages/popup/public/pdf.worker.min.mjs', import.meta.url));

  assert.throws(
    () => readFileSync(vendored),
    { code: 'ENOENT' },
    'a vendored pdf.worker.min.mjs is back in pages/popup/public/ — it is emitted from the package now',
  );
});
