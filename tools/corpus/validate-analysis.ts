/**
 * Validate everything in `corpus/analysis/` against the shipped schema, and report progress.
 *
 * Run: node --import tsx tools/corpus/validate-analysis.ts [--todo]
 *
 * The point is that an analysis which cannot be published is not an analysis. Validating against
 * `SitePolicyAnalysisSchema` — the exact schema `policy-cdn.ts` parses on the way in — means a
 * malformed object is caught here rather than becoming a silent "not analyzed" in the panel.
 *
 * It also enforces two things the schema cannot: that `contentHash` matches the filename, and
 * that the hash actually exists in the curated set. Both are ways an analysis can be perfectly
 * well-formed and still describe a document nobody will ever look up.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    done.add(hash);
  }

  const todo = curated.entries.filter(entry => !done.has(entry.contentHash));

  if (process.argv.includes('--todo')) {
    for (const entry of todo) {
      console.log(
        `${entry.contentHash.slice(0, 8)} ${entry.domain} ${entry.docType} ${entry.normalizedLength} ${entry.textPath}`,
      );
    }
    return;
  }

  for (const problem of problems) console.error(`[invalid] ${problem}`);
  console.log(
    `\n[analysis] valid ${done.size} / ${curated.entries.length}, invalid ${problems.length}, remaining ${todo.length}`,
  );
  if (problems.length > 0) process.exitCode = 1;
};

void main();
