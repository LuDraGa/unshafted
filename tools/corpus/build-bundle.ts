/**
 * Emit the three committed artifacts derived from `corpus/analysis/`:
 *
 *   chrome-extension/public/policy-corpus.json  — every analysis, verbatim (D12)
 *   chrome-extension/public/policy-browse.json  — one row per domain, the browse view's list
 *   chrome-extension/policy-seed.json           — worst-of risk per domain, input to the index
 *
 * Run: node --import tsx tools/corpus/build-bundle.ts
 *
 * All three come from one script on purpose. They are derived from the same 83 objects under the
 * same exclusion list, and a seed that disagrees with the bundle means the badge tints a site the
 * panel then contradicts. One command, one read, no drift.
 *
 * The seed and the browse manifest go further than "same script": they are built from ONE grouping
 * pass, below, so they cannot disagree about which domains exist even if someone edits one of them
 * later. The browse manifest is also the only artifact that enumerates — `policy-index.bin` stores
 * `sha256(domain)` prefixes and cannot be listed back, and nothing in `corpus-bundle.ts` enumerates
 * because every query there is keyed to one site.
 *
 * `corpus/analysis/` is gitignored (Part 3, D8) and these outputs are not — that is the point.
 * A clean checkout builds the extension from the committed artifacts without the corpus present;
 * this script only runs when the corpus changes.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POLICY_BROWSE_ASSET,
  POLICY_BROWSE_FORMAT_VERSION,
  POLICY_CORPUS_ASSET,
  POLICY_CORPUS_FORMAT_VERSION,
  POLICY_CORPUS_MAX_GZIP_BYTES,
  analysisDomains,
  buildBrowseRows,
  hasTimeSensitiveAction,
  worstRiskLevel,
} from '../../packages/unshafted-core/lib/site-policy/corpus-bundle.js';
import { SitePolicyAnalysisSchema } from '../../packages/unshafted-core/lib/site-policy/schemas.js';
import { parsePolicySeed } from '../../packages/unshafted-core/lib/site-policy/seed.js';
import type { SitePolicyAnalysis } from '../../packages/unshafted-core/lib/site-policy/types.js';
import type { RiskLevel } from '../../packages/unshafted-core/lib/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ANALYSIS_DIR = path.join(ROOT, 'corpus/analysis');
const BUNDLE_FILE = path.join(ROOT, 'chrome-extension/public', POLICY_CORPUS_ASSET);
const BROWSE_FILE = path.join(ROOT, 'chrome-extension/public', POLICY_BROWSE_ASSET);
const SEED_FILE = path.join(ROOT, 'chrome-extension/policy-seed.json');

/**
 * Analyses that are valid but must never reach a user, keyed by full content hash.
 *
 * This is a deliberate, permanent exclusion list — not a TODO. Anything listed here has a reason
 * that survives re-analysis, so re-adding it would reintroduce the same failure. If you are here
 * because a hash you expected is missing from the bundle, read the reason before deleting a line.
 */
const EXCLUDED: { contentHash: string; reason: string }[] = [
  {
    // stripe.com cookie policy. The capture hashed transient cookie-banner state — its first three
    // lines carry two mutually contradictory opt-out messages, depending on what the banner was
    // showing at capture time. The hash therefore describes a moment, not a document, and can
    // never match what a real user's page normalizes to. Excluding it costs nothing: stripe.com
    // keeps High from its terms and privacy policy.
    contentHash: '665e157ec1c7fa860febc92bcf4a411d32ea226da73c63ec1b9de0b84a141fe9',
    reason: 'hashed transient cookie-banner state; can never match a live page',
  },
];

const readAnalyses = async (): Promise<{ kept: SitePolicyAnalysis[]; skipped: string[] }> => {
  if (!existsSync(ANALYSIS_DIR)) {
    throw new Error(`No corpus at ${ANALYSIS_DIR}. This script regenerates committed artifacts and needs it.`);
  }

  const excludedByHash = new Map(EXCLUDED.map(entry => [entry.contentHash, entry.reason]));
  const files = (await readdir(ANALYSIS_DIR)).filter(name => name.endsWith('.json')).sort();

  const kept: SitePolicyAnalysis[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(ANALYSIS_DIR, file), 'utf8')) as unknown;

    // Validate, then bundle the RAW object rather than the parsed one. Zod strips unknown keys,
    // and "verbatim" under D12 means the bytes a reader gets back are the bytes we wrote.
    const parsed = SitePolicyAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'} — ${issue.message}`);
      throw new Error(`${file} does not validate:\n  ${issues.join('\n  ')}`);
    }
    if (parsed.data.contentHash !== file.replace(/\.json$/, '')) {
      throw new Error(`${file}: contentHash does not match the filename.`);
    }

    const reason = excludedByHash.get(parsed.data.contentHash);
    if (reason) {
      skipped.push(`${parsed.data.contentHash.slice(0, 8)} ${parsed.data.domain} ${parsed.data.docType} — ${reason}`);
      continue;
    }

    kept.push(raw as SitePolicyAnalysis);
  }

  for (const hash of excludedByHash.keys()) {
    if (!files.includes(`${hash}.json`)) {
      throw new Error(`Exclusion ${hash.slice(0, 8)} is not in the corpus. Stale exclusions hide real coverage.`);
    }
  }

  return { kept, skipped };
};

type SeedRow = { domain: string; riskLevel: RiskLevel; hasTimeSensitiveAction: boolean };

/**
 * One bucket per site, keyed the way the runtime keys it.
 *
 * Lifted out of `buildSeedRows` when the browse manifest arrived and needed the same grouping plus
 * a count. Two artifacts deriving from one map is the difference between "these agree today" and
 * "these cannot disagree" — a domain cannot appear in the seed and be missing from the browse list,
 * which would be a covered site the panel can grade and the browse view swears it has never read.
 *
 * `analysisDomains` rather than `analysis.domain`: one Disney terms document governs both
 * `disneyplus.com` and `hotstar.com`, and taking the primary alone leaves the other out of both.
 */
const groupByDomain = (analyses: readonly SitePolicyAnalysis[]): Map<string, SitePolicyAnalysis[]> => {
  const byDomain = new Map<string, SitePolicyAnalysis[]>();
  for (const analysis of analyses) {
    for (const domain of analysisDomains(analysis)) {
      const key = domain.trim().toLowerCase();
      byDomain.set(key, [...(byDomain.get(key) ?? []), analysis]);
    }
  }
  return byDomain;
};

/** Collapse documents to one row per site: worst risk (D1), any deadline anywhere. */
const buildSeedRows = (byDomain: ReadonlyMap<string, readonly SitePolicyAnalysis[]>): SeedRow[] =>
  [...byDomain.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, documents]) => ({
      domain,
      riskLevel: worstRiskLevel(documents.map(document => document.riskLevel))!,
      hasTimeSensitiveAction: documents.some(hasTimeSensitiveAction),
    }));

const SEED_COMMENT = [
  'Build input for the bundled domain-coverage index (policy-index.bin).',
  '',
  'GENERATED — do not hand-edit. Run: node --import tsx tools/corpus/build-bundle.ts',
  '',
  'Every domain here is real and every risk level is earned by an actual analysis in',
  'corpus/analysis/, published through the M1 corpus pipeline. The RFC 2606 placeholders this',
  'file used to carry are gone: an invented risk level for a real company would be a false claim',
  'about that company, visible to every user who installs the extension.',
  '',
  'riskLevel is the WORST document on the domain, not an average (Part 5, D1). 19 of 37',
  'domains have documents that disagree and 4 disagree by two full levels, so a mean would',
  'describe none of them. hasTimeSensitiveAction is true when any document carries a deadline.',
  '',
  'The bundle is a day-one offline SEED, not the source of truth (AD-6). promptVersion lives',
  'in the CDN index so re-analysis can be invalidated without an extension release.',
];

const main = async () => {
  const { kept, skipped } = await readAnalyses();
  for (const note of skipped) console.log(`[exclude] ${note}`);

  const bundle = {
    formatVersion: POLICY_CORPUS_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    analyses: kept,
  };

  // Minified: this ships in the CRX and nobody reads it by hand — `corpus/analysis/` is the
  // pretty-printed source of truth.
  const json = JSON.stringify(bundle);
  const gzipped = gzipSync(Buffer.from(json, 'utf8')).byteLength;

  if (gzipped > POLICY_CORPUS_MAX_GZIP_BYTES) {
    throw new Error(
      `${POLICY_CORPUS_ASSET} is ${gzipped} bytes gzipped, over the ${POLICY_CORPUS_MAX_GZIP_BYTES}-byte cap. ` +
        `The bundle is a temporary channel (D4); at this size it is time to build Part 2 instead of widening it.`,
    );
  }

  await writeFile(BUNDLE_FILE, json, 'utf8');

  const byDomain = groupByDomain(kept);
  const rows = buildSeedRows(byDomain);

  // Round-trip through the shipped validator before writing. The multi-tenant guard (AD-7) is the
  // one that matters: it is what stops a public suffix in the index attributing one host's policy
  // to every unrelated tenant beneath it. If a real domain ever trips it, fix the corpus entry —
  // do not weaken the guard.
  const { warnings } = parsePolicySeed({ domains: rows });
  for (const warning of warnings) console.warn(`[seed] ${warning}`);

  await writeFile(
    SEED_FILE,
    `${JSON.stringify({ comment: SEED_COMMENT, formatVersion: 1, domains: rows }, null, 2)}\n`,
    'utf8',
  );

  /*
   * The browse manifest. Minified for the same reason the corpus is — it ships in the CRX and
   * nobody reads it by hand — and with no `generatedAt`, deliberately: it would be the only
   * changing byte on a rebuild that found nothing new, and a diff that moves every time you run
   * the script is a diff nobody reads.
   */
  const browse = JSON.stringify({
    formatVersion: POLICY_BROWSE_FORMAT_VERSION,
    // `kept.length`, never the sum of the rows — see the schema for why those differ by three.
    documentTotal: kept.length,
    domains: buildBrowseRows(byDomain),
  });
  await writeFile(BROWSE_FILE, browse, 'utf8');

  const distribution = rows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row.riskLevel]: (acc[row.riskLevel] ?? 0) + 1 }),
    {},
  );

  console.log(`[bundle] ${kept.length} analyses, ${json.length} bytes raw, ${gzipped} bytes gzipped`);
  console.log(
    `[seed] ${rows.length} domains — ${Object.entries(distribution)
      .map(([level, count]) => `${level} ${count}`)
      .join(', ')}`,
  );
  console.log(`[seed] ${rows.filter(row => row.hasTimeSensitiveAction).length} domains carry a deadline`);
  console.log(
    `[browse] ${rows.length} domains, ${browse.length} bytes raw, ` +
      `${gzipSync(Buffer.from(browse, 'utf8')).byteLength} bytes gzipped`,
  );
};

void main();
