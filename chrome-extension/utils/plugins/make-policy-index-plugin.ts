import { colorfulLog } from '@extension/shared';
import { encodePolicyIndex, parsePolicySeed, POLICY_INDEX_MAX_BYTES } from '@extension/unshafted-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PluginOption } from 'vite';

/**
 * Emits `policy-index.bin` — the bundled, zero-network domain-coverage index.
 *
 * The bundle is a day-one offline SEED, not the source of truth. `promptVersion` deliberately
 * lives in the CDN index instead, so re-analysis can be invalidated without an extension release.
 *
 * Validation lives in `@extension/unshafted-core`'s `parsePolicySeed`; this is I/O only.
 */

const seedFile = resolve(import.meta.dirname, '..', '..', 'policy-seed.json');
const OUTPUT_NAME = 'policy-index.bin';

export default (config: { outDir: string }): PluginOption => ({
  name: 'make-policy-index',
  buildStart() {
    this.addWatchFile(seedFile);
  },
  async writeBundle() {
    if (!existsSync(seedFile)) {
      colorfulLog(`No policy seed at ${seedFile}; skipping ${OUTPUT_NAME}.`, 'warning');
      return;
    }

    const { records, warnings } = parsePolicySeed(JSON.parse(readFileSync(seedFile, 'utf8')));
    for (const warning of warnings) colorfulLog(`Policy seed: ${warning}`, 'warning');

    const bytes = await encodePolicyIndex(records);

    if (bytes.byteLength > POLICY_INDEX_MAX_BYTES) {
      throw new Error(
        `${OUTPUT_NAME} is ${bytes.byteLength} bytes, over the ${POLICY_INDEX_MAX_BYTES}-byte cap. ` +
          `Shipping it would slow every service-worker cold start.`,
      );
    }

    if (!existsSync(config.outDir)) mkdirSync(config.outDir, { recursive: true });
    writeFileSync(resolve(config.outDir, OUTPUT_NAME), bytes);

    colorfulLog(`Policy index written: ${records.length} domains, ${bytes.byteLength} bytes`, 'success');
  },
});
