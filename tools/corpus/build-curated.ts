/**
 * Resolve `curated.ts` against the manifest and emit `corpus/curated.json`.
 *
 * Fails loudly on a hash that does not resolve, or that resolves to more than one document —
 * a curation file that has silently drifted from the capture is worse than no curation at all.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURATED } from './curated.js';
import { SITES } from './sites.js';
import type { CorpusManifest, CapturedDocument } from './types.js';
import type { PolicyDocType } from '../../packages/unshafted-core/lib/site-policy/types.js';
import type { SiteTag } from './sites.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type CuratedEntry = {
  domain: string;
  tags: SiteTag[];
  /** Hand-assigned; may differ from `guessDocType`, deliberately. */
  docType: PolicyDocType;
  contentHash: string;
  sourceUrl: string;
  normalizedLength: number;
  textPath: string;
  note?: string;
};

const main = async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'corpus/manifest.json'), 'utf8')) as CorpusManifest;
  const tagsFor = new Map(SITES.map(site => [site.domain, site.tags]));

  const byHash8 = new Map<string, { doc: CapturedDocument; domain: string }[]>();
  for (const site of manifest.sites) {
    for (const doc of site.documents) {
      if (doc.status !== 'captured' || !doc.contentHash) continue;
      const key = doc.contentHash.slice(0, 8);
      if (!byHash8.has(key)) byHash8.set(key, []);
      byHash8.get(key)!.push({ doc, domain: site.domain });
    }
  }

  const entries: CuratedEntry[] = [];
  const problems: string[] = [];

  for (const [domain, picks] of Object.entries(CURATED)) {
    for (const pick of picks) {
      const matches = byHash8.get(pick.hash8);
      if (!matches || matches.length === 0) {
        problems.push(`${domain}: hash8 ${pick.hash8} resolves to nothing in the manifest`);
        continue;
      }
      const hashes = new Set(matches.map(match => match.doc.contentHash));
      if (hashes.size > 1) {
        problems.push(`${domain}: hash8 ${pick.hash8} is ambiguous across ${hashes.size} documents`);
        continue;
      }
      const { doc } = matches[0]!;
      entries.push({
        domain,
        tags: tagsFor.get(domain) ?? [],
        docType: pick.docType,
        contentHash: doc.contentHash!,
        sourceUrl: doc.finalUrl ?? doc.chosenUrl,
        normalizedLength: doc.normalizedLength ?? 0,
        textPath: `corpus/text/${doc.contentHash}.txt`,
        note: pick.note,
      });
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`[curate] ${problem}`);
    process.exitCode = 1;
    return;
  }

  entries.sort((left, right) => left.domain.localeCompare(right.domain) || left.docType.localeCompare(right.docType));
  await writeFile(path.join(ROOT, 'corpus/curated.json'), JSON.stringify({
    captureId: manifest.captureId,
    normalizerVersion: manifest.normalizerVersion,
    egress: manifest.egress,
    entries,
  }, null, 2), 'utf8');

  const domains = new Set(entries.map(entry => entry.domain));
  const chars = entries.reduce((total, entry) => total + entry.normalizedLength, 0);
  console.log(`[curate] ${entries.length} documents across ${domains.size} domains`);
  console.log(`[curate] ${chars.toLocaleString()} normalized characters`);
  console.log('[curate] by type:', Object.entries(
    entries.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.docType]: (acc[entry.docType] ?? 0) + 1 }), {}),
  ).map(([type, count]) => `${type} ${count}`).join(', '));
};

void main();
