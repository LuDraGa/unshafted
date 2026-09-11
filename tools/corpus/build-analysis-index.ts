/**
 * Emit `corpus/analysis-index.json` — the committed record of what has been analysed.
 *
 * The analyses themselves stay local, like the text they are derived from (Part 3, D8). This
 * index is the part that is facts rather than content: which document, which risk level, how
 * many exposures, which disclosures were found missing. It is what a reviewer needs to see the
 * shape of the corpus without redistributing anyone's policy text.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SitePolicyAnalysis } from '../../packages/unshafted-core/lib/site-policy/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'corpus/analysis');

const main = async () => {
  if (!existsSync(DIR)) return;
  const files = (await readdir(DIR)).filter(name => name.endsWith('.json')).sort();

  const rows = [];
  for (const file of files) {
    const analysis = JSON.parse(await readFile(path.join(DIR, file), 'utf8')) as SitePolicyAnalysis;
    rows.push({
      contentHash: analysis.contentHash,
      domain: analysis.domain,
      domains: analysis.domains,
      docType: analysis.docType,
      verticals: analysis.verticals,
      riskLevel: analysis.riskLevel,
      confidence: analysis.confidence,
      sourceUrl: analysis.sourceUrl,
      exposureCount: analysis.exposures.length,
      highSeverityCount: analysis.exposures.filter(exposure => exposure.severity === 'high').length,
      actionCount: analysis.availableActions.length,
      absentDisclosures: analysis.requiredDisclosures
        .filter(disclosure => disclosure.status === 'absent')
        .map(disclosure => disclosure.name),
      promptVersion: analysis.promptVersion,
      normalizerVersion: analysis.normalizerVersion,
      model: analysis.model,
    });
  }

  rows.sort((left, right) => left.domain.localeCompare(right.domain) || left.docType.localeCompare(right.docType));
  await writeFile(
    path.join(ROOT, 'corpus/analysis-index.json'),
    JSON.stringify({ analysed: rows.length, rows }, null, 2),
    'utf8',
  );
  console.log(`[index] ${rows.length} analyses indexed`);
};

void main();
