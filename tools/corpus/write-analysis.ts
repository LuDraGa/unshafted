/**
 * Write one analysis, filling provenance from the curated set.
 *
 * Run: node --import tsx tools/corpus/write-analysis.ts < body.json
 *
 * The body carries only the analytic content — `hash8`, `summary`, `riskLevel`, `confidence`,
 * `exposures`, `availableActions`, `requiredDisclosures`, and optionally extra `domains` when
 * one document governs several sites. Everything else (contentHash, docType, verticals,
 * sourceUrl, normalizerVersion, schemaVersion) is copied from `curated.json`, which is copied
 * from the manifest, which is what the capture actually observed.
 *
 * That chain matters: hand-transcribing a 64-character hash or a vertical list into 85 files is
 * a silent-corruption machine, and a wrong hash produces an analysis that validates perfectly
 * and that no client will ever find.
 *
 * `verticals` are the SITE's tags denormalized onto the document, which AD-6 requires — a
 * published object must be renderable standalone.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SitePolicyAnalysisSchema } from '../../packages/unshafted-core/lib/site-policy/schemas.js';
import { POLICY_NORMALIZER_VERSION } from '../../packages/unshafted-core/lib/site-policy/normalize.js';
import type { CuratedEntry } from './build-curated.js';
import type { SiteTag } from './sites.js';
import type { Vertical } from '../../packages/unshafted-core/lib/site-policy/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const PROMPT_VERSION = 'adhesion-rubric-v1';
export const ANALYST_MODEL = 'claude-opus-5';

/** Capture-side tags → the shipped `VerticalSchema`. One-to-one since the schema was updated. */
const TAG_TO_VERTICAL: Record<SiteTag, Vertical> = {
  finance_banking: 'finance_banking',
  payments_fintech: 'payments_fintech',
  ecommerce: 'ecommerce',
  subscription_autorenewal: 'subscription_autorenewal',
  ott_streaming: 'ott_streaming',
  social_ugc: 'social_ugc',
  identity_provider: 'identity_provider',
  saas: 'saas_productivity',
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
  const body = JSON.parse(await readStdin()) as Record<string, unknown> & { hash8: string; domains?: string[] };
  const curated = JSON.parse(await readFile(path.join(ROOT, 'corpus/curated.json'), 'utf8')) as {
    entries: CuratedEntry[];
  };

  const entry = curated.entries.find(candidate => candidate.contentHash.startsWith(body.hash8));
  if (!entry) throw new Error(`hash8 ${body.hash8} is not in the curated set`);

  const { hash8: _hash8, domains, ...analytic } = body;
  const object = {
    schemaVersion: 1,
    contentHash: entry.contentHash,
    domain: entry.domain,
    domains: domains ?? [entry.domain],
    docType: entry.docType,
    verticals: entry.tags.map(tag => TAG_TO_VERTICAL[tag]),
    surfaces: ['footer'],
    sourceUrl: entry.sourceUrl,
    promptVersion: PROMPT_VERSION,
    normalizerVersion: POLICY_NORMALIZER_VERSION,
    model: ANALYST_MODEL,
    analyzedAt: new Date().toISOString(),
    peerDeviation: [],
    ...analytic,
  };

  const parsed = SitePolicyAnalysisSchema.safeParse(object);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(`[reject] ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  await mkdir(path.join(ROOT, 'corpus/analysis'), { recursive: true });
  await writeFile(
    path.join(ROOT, `corpus/analysis/${entry.contentHash}.json`),
    JSON.stringify(parsed.data, null, 2),
    'utf8',
  );
  console.log(
    `[ok] ${body.hash8} ${entry.domain} ${entry.docType} — ${parsed.data.exposures.length} exposures, ${parsed.data.riskLevel}`,
  );
};

void main();
