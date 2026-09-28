/**
 * Validate everything in `corpus/analysis/` against the shipped schema, and report progress.
 *
 * Run: node --import tsx tools/corpus/validate-analysis.ts [--todo]
 *
 * The point is that an analysis which cannot be published is not an analysis. Validating against
 * `SitePolicyAnalysisSchema` — the exact schema `policy-cdn.ts` parses on the way in — means a
 * malformed object is caught here rather than becoming a silent "not analyzed" in the panel.
 *
 * It also enforces what the schema cannot: that `contentHash` matches the filename, and that the
 * hash actually exists in the curated set — both ways an analysis can be perfectly well-formed and
 * still describe a document nobody will ever look up — and that its products hold to the catalogue
 * (B2 of the site coverage work). The schema takes any string as a product id, so an older client
 * never rejects an object over a product added since; the closed list is enforced here, against
 * the document's own company, so `xbox` on a Google document fails as surely as a made-up id.
 *
 * A catalogue company's document with no products at all is not invalid, it is unscoped: written
 * before products existed. It is counted apart, listed by `--todo`, and still fails the run, since
 * the panel cannot scope it to the product in use until it is re-analysed.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { productScoping } from '../../packages/unshafted-core/lib/site-policy/products.js';
import { SitePolicyAnalysisSchema } from '../../packages/unshafted-core/lib/site-policy/schemas.js';
import type { CuratedEntry } from './build-curated.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ANALYSIS_DIR = path.join(ROOT, 'corpus/analysis');

const main = async () => {
  const curated = JSON.parse(await readFile(path.join(ROOT, 'corpus/curated.json'), 'utf8')) as {
    entries: CuratedEntry[];
  };
  const byHash = new Map(curated.entries.map(entry => [entry.contentHash, entry]));

  const files = existsSync(ANALYSIS_DIR) ? (await readdir(ANALYSIS_DIR)).filter(name => name.endsWith('.json')) : [];

  const problems: string[] = [];
  const done = new Set<string>();
  const unscoped = new Set<string>();

  for (const file of files) {
    const hash = file.replace(/\.json$/, '');
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path.join(ANALYSIS_DIR, file), 'utf8'));
    } catch (error) {
      problems.push(`${file}: not valid JSON — ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const parsed = SitePolicyAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 4)) {
        problems.push(`${file}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      }
      continue;
    }
    if (parsed.data.contentHash !== hash) {
      problems.push(`${file}: contentHash does not match the filename`);
      continue;
    }
    const entry = byHash.get(hash);
    if (!entry) {
      problems.push(`${file}: hash is not in the curated set`);
      continue;
    }
    if (parsed.data.docType !== entry.docType) {
      problems.push(`${file}: docType ${parsed.data.docType} disagrees with curation (${entry.docType})`);
      continue;
    }
    const scoping = productScoping(parsed.data);
    if (scoping.status === 'invalid') {
      problems.push(...scoping.problems.slice(0, 4).map(problem => `${file}: ${problem}`));
      continue;
    }
    if (scoping.status === 'missing') {
      unscoped.add(hash);
      continue;
    }
    done.add(hash);
  }

  const todo = curated.entries.filter(entry => !done.has(entry.contentHash));

  if (process.argv.includes('--todo')) {
    for (const entry of todo) {
      console.log(
        `${entry.contentHash.slice(0, 8)} ${entry.domain} ${entry.docType} ${entry.normalizedLength} ${entry.textPath}${
          unscoped.has(entry.contentHash) ? ' (needs product scoping)' : ''
        }`,
      );
    }
    return;
  }

  for (const problem of problems) console.error(`[invalid] ${problem}`);
  for (const hash of unscoped) {
    const entry = byHash.get(hash)!;
    console.error(
      `[unscoped] ${hash.slice(0, 8)} ${entry.domain} ${entry.docType}: a multi-product document with no products`,
    );
  }
  console.log(
    `\n[analysis] valid ${done.size} / ${curated.entries.length}, invalid ${problems.length}, ` +
      `unscoped ${unscoped.size}, remaining ${todo.length}`,
  );
  if (problems.length > 0 || unscoped.size > 0) process.exitCode = 1;
};

void main();
