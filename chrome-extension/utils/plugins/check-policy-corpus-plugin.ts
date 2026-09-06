import { colorfulLog } from '@extension/shared';
import { POLICY_CORPUS_ASSET, POLICY_CORPUS_MAX_GZIP_BYTES, PolicyCorpusBundleSchema } from '@extension/unshafted-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { PluginOption } from 'vite';

/**
 * Validates the committed analysis corpus and enforces its size ceiling.
 *
 * Unlike `make-policy-index-plugin.ts`, this GENERATES NOTHING. `corpus/analysis/` is gitignored,
 * so a clean checkout has no corpus to build from — `policy-corpus.json` is committed and Vite's
 * `publicDir` copies it. What is left for the build to do is refuse to ship it if it is malformed
 * or has grown past the point where bundling stops being defensible.
 *
 * The ceiling is measured gzipped because that is what a CRX ships and a user downloads. The
 * bundle is an explicitly temporary channel (Part 5, D4): Part 2's conditional-GET CDN is the
 * real one, and this cap is the forcing function that stops "temporary" becoming permanent.
 */

const corpusFile = resolve(import.meta.dirname, '..', '..', 'public', POLICY_CORPUS_ASSET);

export default (): PluginOption => ({
  name: 'check-policy-corpus',
  buildStart() {
    this.addWatchFile(corpusFile);

    if (!existsSync(corpusFile)) {
      // Not fatal: the side panel degrades to the badge-only path, and failing the whole build
      // over a missing optional asset would block work that has nothing to do with the corpus.
      colorfulLog(`No policy corpus at ${corpusFile}; the side panel will have nothing to render.`, 'warning');
      return;
    }

    const bytes = readFileSync(corpusFile);
    const parsed = PolicyCorpusBundleSchema.safeParse(JSON.parse(bytes.toString('utf8')));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `${POLICY_CORPUS_ASSET} does not match the shipped schema: ` +
          `${issue?.path.join('.') || '(root)'} — ${issue?.message}. ` +
          `Regenerate it with tools/corpus/build-bundle.ts.`,
      );
    }

    const gzipped = gzipSync(bytes).byteLength;
    if (gzipped > POLICY_CORPUS_MAX_GZIP_BYTES) {
      throw new Error(
        `${POLICY_CORPUS_ASSET} is ${gzipped} bytes gzipped, over the ${POLICY_CORPUS_MAX_GZIP_BYTES}-byte cap. ` +
          `Bundling stops being the right channel here — build Part 2 rather than widening the cap.`,
      );
    }

    colorfulLog(`Policy corpus: ${parsed.data.analyses.length} analyses, ${gzipped} bytes gzipped`, 'success');
  },
});
