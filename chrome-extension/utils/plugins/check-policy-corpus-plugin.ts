import { colorfulLog } from '@extension/shared';
import {
  POLICY_BROWSE_ASSET,
  POLICY_CORPUS_ASSET,
  POLICY_CORPUS_MAX_GZIP_BYTES,
  PolicyBrowseManifestSchema,
  PolicyCorpusBundleSchema,
  analysisDomains,
} from '@extension/unshafted-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { PluginOption } from 'vite';

/**
 * Validates the committed corpus artifacts and enforces the corpus size ceiling.
 *
 * Unlike `make-policy-index-plugin.ts`, this GENERATES NOTHING. `corpus/analysis/` is gitignored,
 * so a clean checkout has no corpus to build from — `policy-corpus.json` and `policy-browse.json`
 * are committed and Vite's `publicDir` copies them. What is left for the build to do is refuse to
 * ship them if they are malformed, disagree with each other, or have grown past the point where
 * bundling stops being defensible.
 *
 * The ceiling is measured gzipped because that is what a CRX actually ships and a user downloads.
 * The bundle is an explicitly temporary channel (Part 5, D4): Part 2's conditional-GET CDN is the
 * real one, and this cap is the forcing function that stops "temporary" becoming permanent.
 *
 * THE CROSS-CHECK IS THE POINT OF CHECKING THE MANIFEST HERE. Its own shape is validated again at
 * runtime by the loader, so re-parsing it would be redundant on its own. What the runtime cannot
 * afford to check is whether it AGREES with the corpus: doing that needs both files, and the whole
 * reason the manifest exists is that the browse view must not parse 1 MB to render a list of
 * names. A drifted manifest is not a crash — it is a row that opens into a detail view with no
 * documents in it, or a site we have read and will swear we have not. Both are silent, so they are
 * caught here or not at all.
 */

const corpusFile = resolve(import.meta.dirname, '..', '..', 'public', POLICY_CORPUS_ASSET);
const browseFile = resolve(import.meta.dirname, '..', '..', 'public', POLICY_BROWSE_ASSET);

export default (): PluginOption => ({
  name: 'check-policy-corpus',
  buildStart() {
    this.addWatchFile(corpusFile);
    this.addWatchFile(browseFile);

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

    if (!existsSync(browseFile)) {
      // Same degradation as a missing corpus, and for the same reason: the browse view is one
      // surface, not the product. It renders nothing rather than blocking everyone else's build.
      colorfulLog(`No browse manifest at ${browseFile}; the browse view will have nothing to list.`, 'warning');
      return;
    }

    const browseBytes = readFileSync(browseFile);
    const browse = PolicyBrowseManifestSchema.safeParse(JSON.parse(browseBytes.toString('utf8')));
    if (!browse.success) {
      const issue = browse.error.issues[0];
      throw new Error(
        `${POLICY_BROWSE_ASSET} does not match the shipped schema: ` +
          `${issue?.path.join('.') || '(root)'} — ${issue?.message}. ` +
          `Regenerate it with tools/corpus/build-bundle.ts.`,
      );
    }

    const corpusDomains = new Set(
      parsed.data.analyses.flatMap(analysis => analysisDomains(analysis).map(domain => domain.trim().toLowerCase())),
    );
    const listed = new Set(browse.data.domains.map(row => row.domain));
    const invented = [...listed].filter(domain => !corpusDomains.has(domain));
    const missing = [...corpusDomains].filter(domain => !listed.has(domain));

    if (invented.length > 0 || missing.length > 0) {
      throw new Error(
        `${POLICY_BROWSE_ASSET} disagrees with ${POLICY_CORPUS_ASSET}. ` +
          (invented.length > 0 ? `Listed but not in the corpus: ${invented.join(', ')}. ` : '') +
          (missing.length > 0 ? `In the corpus but not listed: ${missing.join(', ')}. ` : '') +
          `They are built from one grouping pass, so this means one of them was edited by hand or ` +
          `built from a different corpus. Regenerate both with tools/corpus/build-bundle.ts.`,
      );
    }

    colorfulLog(
      `Browse manifest: ${browse.data.domains.length} domains, ` + `${gzipSync(browseBytes).byteLength} bytes gzipped`,
      'success',
    );
  },
});
