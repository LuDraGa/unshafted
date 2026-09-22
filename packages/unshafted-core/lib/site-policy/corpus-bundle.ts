import { candidateDomains } from './index-format.js';
import { SitePolicyAnalysisSchema } from './schemas.js';
import { z } from 'zod';
import type { SitePolicyAnalysis } from './types.js';
import type { RiskLevel } from '../types.js';

/**
 * The bundled analysis corpus — the zero-network answer to "what does this site's policy say".
 *
 * Deliberately the OTHER half of AD-2's split from `index-format.ts`. The 45 KB index answers
 * "is this site covered?" on every page load, in the service worker. This bundle answers the
 * expensive question, and only the side panel loads it (D11). Do not import the loader into the
 * background worker: a 1.3 MB parse on every cold start is exactly the cost the index exists to
 * avoid.
 *
 * The bundle is a CONTAINER, not a transformation (D12). Full `SitePolicyAnalysis` objects go in
 * verbatim, because AD-6 requires one object to render standalone with no extension context —
 * and a squashed shape is what would have to be un-squashed again for the public library. The
 * domain and hash lookup tables below are derived at load, never baked into the file.
 */

const POLICY_CORPUS_FORMAT_VERSION = 1 as const;

/**
 * Build fails above this. The bundle is an explicitly temporary delivery channel (D4) — Part 2's
 * conditional-GET CDN is the real one — so it needs a forcing function rather than room to drift.
 * Measured at 83 documents: ~305 KB gzipped, so this is roughly 3x headroom.
 *
 * Gzipped rather than raw because gzip is what a CRX actually ships and what a user actually
 * downloads; the raw number is four times larger and means nothing to anybody.
 */
const POLICY_CORPUS_MAX_GZIP_BYTES = 1024 * 1024;

/** The bundled asset's filename, shared by the build step and the runtime loader. */
const POLICY_CORPUS_ASSET = 'policy-corpus.json';

const PolicyCorpusBundleSchema = z.object({
  formatVersion: z.literal(POLICY_CORPUS_FORMAT_VERSION),
  generatedAt: z.string().datetime(),
  analyses: z.array(SitePolicyAnalysisSchema),
});

type PolicyCorpusBundle = z.infer<typeof PolicyCorpusBundleSchema>;

/**
 * The browse manifest — the third bundled artifact, and the only one that ENUMERATES.
 *
 * `policy-index.bin` answers "is this site covered?" from 8-byte `sha256(domain)` prefixes, which
 * are one-way by construction and can never be listed back. `policy-corpus.json` answers "what
 * does it say?" and costs ~1 MB to parse. Neither can render a list of 37 site names, which is the
 * entire job of the browse view.
 *
 * So: 401 bytes gzipped, three fields, derived by `build-bundle.ts` from the same grouping pass
 * that produces the seed — so the two cannot disagree about which domains exist.
 *
 * THREE FIELDS, BECAUSE THREE RENDER. `worstRiskLevel` is not here: 36 of 37 domains land on High
 * or Very High, so colouring a list along that ramp is noise with a legend. Neither is a count of
 * absent disclosures: `requiredDisclosures` records what each analysis found worth recording, not
 * a systematic checklist, so a tally is a lower bound on findings and rendering one beside another
 * domain's invites a comparison the data cannot support. #79 is the standing precedent for not
 * shipping a field with no consumer.
 *
 * `hasTimeSensitiveAction` keeps the spelling it has in `policy-seed.json` and above. #82.
 */
const POLICY_BROWSE_FORMAT_VERSION = 1 as const;

/** The browse manifest's filename, shared by the build step and the runtime loader. */
const POLICY_BROWSE_ASSET = 'policy-browse.json';

const PolicyBrowseRowSchema = z.object({
  domain: z.string().min(1),
  documentCount: z.number().int().positive(),
  hasTimeSensitiveAction: z.boolean(),
});

/**
 * `documentTotal` is the fourth field, and it is here because it CANNOT be derived from the rows.
 *
 * Summing `documentCount` gives 85 against a corpus of 82. Three documents govern two domains each
 * — one Disney terms across `disneyplus.com` and `hotstar.com`, one Meta policy across
 * `facebook.com` and `instagram.com` — and a per-domain count has to include them under both or
 * the domain is missing a document it is actually governed by.
 *
 * So the sum is right for what it is and wrong for what the header says. The field exists to make
 * the wrong answer unavailable: without it the next person to write "N documents across 37 sites"
 * reaches for `reduce`, gets 85, and ships a number that overstates the corpus by three. That is
 * not a rounding error — it is a false claim about how much we have read, on the one surface whose
 * job is to say how much we have read.
 *
 * This is not the speculative kind of field #79 deleted six tokens for. It has exactly one
 * consumer, the header sentence, and that consumer has no other correct source.
 */
const PolicyBrowseManifestSchema = z.object({
  formatVersion: z.literal(POLICY_BROWSE_FORMAT_VERSION),
  documentTotal: z.number().int().nonnegative(),
  domains: z.array(PolicyBrowseRowSchema),
});

type PolicyBrowseRow = z.infer<typeof PolicyBrowseRowSchema>;
type PolicyBrowseManifest = z.infer<typeof PolicyBrowseManifestSchema>;

/**
 * Collapse analyses to one browse row per site, alphabetical.
 *
 * Alphabetical here rather than at render time because it is the file's permanent order and the
 * view never re-sorts: not by document count (a fact about how much a company publishes, not about
 * how it treats you), not by absent count, not by risk. Alphabetical claims nothing.
 */
const buildBrowseRows = (byDomain: ReadonlyMap<string, readonly SitePolicyAnalysis[]>): PolicyBrowseRow[] =>
  [...byDomain.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, documents]) => ({
      domain,
      documentCount: documents.length,
      hasTimeSensitiveAction: documents.some(hasTimeSensitiveAction),
    }));

const parsePolicyBrowseManifest = (raw: unknown): PolicyBrowseManifest => PolicyBrowseManifestSchema.parse(raw);

/**
 * Ascending severity. Coincides with the 2-bit payload encoding in `index-format.ts` by
 * construction — that one is a wire format pinned to bit values and must never be reordered,
 * this one is a comparison order. A test asserts they still agree.
 */
const RISK_LEVEL_ORDER = ['Low', 'Medium', 'High', 'Very High'] as const satisfies readonly RiskLevel[];

const severityOf = (level: RiskLevel): number => RISK_LEVEL_ORDER.indexOf(level as (typeof RISK_LEVEL_ORDER)[number]);

/** Descending-severity comparator, for "worst document first" ordering. */
const compareRiskLevelDescending = (left: RiskLevel, right: RiskLevel): number => severityOf(right) - severityOf(left);

/**
 * The per-domain badge byte is the WORST of that domain's documents, not an average (D1).
 *
 * Averaging is wrong in exactly the cases the corpus proves are common: Zerodha's terms cap a
 * broker's liability at INR 100 while its privacy policy is unremarkable, and 19 of 37 domains
 * have documents that disagree at all. A mean of a contradiction describes neither document.
 */
const worstRiskLevel = (levels: readonly RiskLevel[]): RiskLevel | null => {
  let worst = -1;
  for (const level of levels) {
    const rank = severityOf(level);
    if (rank < 0) throw new Error(`Unknown risk level: ${level}`);
    if (rank > worst) worst = rank;
  }
  return worst < 0 ? null : RISK_LEVEL_ORDER[worst]!;
};

/**
 * Every site this document governs, deduplicated.
 *
 * `domain` is the primary and `domains` the full set; one Disney terms document covers both
 * `disneyplus.com` and `hotstar.com`, and seeding only the primary leaves the other uncovered.
 */
const analysisDomains = (analysis: SitePolicyAnalysis): string[] => [
  ...new Set([analysis.domain, ...analysis.domains]),
];

/**
 * True when any action on this document is on a clock — the arbitration opt-out window being the
 * one that actually costs a user something to miss.
 *
 * `kind: 'none'` exists for actions that carry a described-but-unbounded deadline, so the kind,
 * not the presence of the object, is the test.
 */
const hasTimeSensitiveAction = (analysis: SitePolicyAnalysis): boolean =>
  analysis.availableActions.some(action => action.deadline !== undefined && action.deadline.kind !== 'none');

type PolicyCorpus = {
  generatedAt: string;
  analyses: SitePolicyAnalysis[];
  /** Derived at load, not baked into the file (D12). Values are worst-first. */
  byDomain: Map<string, SitePolicyAnalysis[]>;
  byHash: Map<string, SitePolicyAnalysis>;
};

/** Build the lookup tables. Split from parsing so tests can index a hand-built bundle. */
const indexPolicyCorpus = (bundle: PolicyCorpusBundle): PolicyCorpus => {
  const byDomain = new Map<string, SitePolicyAnalysis[]>();
  const byHash = new Map<string, SitePolicyAnalysis>();

  for (const analysis of bundle.analyses) {
    if (byHash.has(analysis.contentHash)) {
      throw new Error(`Policy corpus contains ${analysis.contentHash} twice.`);
    }
    byHash.set(analysis.contentHash, analysis);

    for (const domain of analysisDomains(analysis)) {
      const key = domain.trim().toLowerCase();
      const bucket = byDomain.get(key);
      if (bucket) bucket.push(analysis);
      else byDomain.set(key, [analysis]);
    }
  }

  // Worst first, because D10 puts the document that earned the badge at the top of the panel.
  for (const bucket of byDomain.values()) {
    bucket.sort(
      (left, right) =>
        compareRiskLevelDescending(left.riskLevel, right.riskLevel) || left.docType.localeCompare(right.docType),
    );
  }

  return { generatedAt: bundle.generatedAt, analyses: bundle.analyses, byDomain, byHash };
};

const parsePolicyCorpus = (raw: unknown): PolicyCorpus => indexPolicyCorpus(PolicyCorpusBundleSchema.parse(raw));

const analysesForDomain = (corpus: PolicyCorpus, domain: string): SitePolicyAnalysis[] =>
  corpus.byDomain.get(domain.trim().toLowerCase()) ?? [];

/**
 * Resolve a hostname the same way the badge did, so the panel cannot disagree with the icon that
 * opened it: suffix walk, most specific match wins, no Public Suffix List (AD-7).
 */
const analysesForHostname = (
  corpus: PolicyCorpus,
  hostname: string,
): { domain: string; analyses: SitePolicyAnalysis[] } | null => {
  for (const candidate of candidateDomains(hostname)) {
    const analyses = corpus.byDomain.get(candidate);
    if (analyses) return { domain: candidate, analyses };
  }
  return null;
};

/**
 * The hash lookup from AD-2 — "is this exact document version the one we read?". A miss is a real
 * answer (D6's "changed since we read it"), never an error.
 */
const analysisForHash = (corpus: PolicyCorpus, contentHash: string): SitePolicyAnalysis | null =>
  corpus.byHash.get(contentHash) ?? null;

/** The badge byte for a domain, derived from the same objects the panel renders. */
const domainRiskSummary = (
  analyses: readonly SitePolicyAnalysis[],
): { riskLevel: RiskLevel; hasTimeSensitiveAction: boolean; documentCount: number } | null => {
  const riskLevel = worstRiskLevel(analyses.map(analysis => analysis.riskLevel));
  if (!riskLevel) return null;
  return {
    riskLevel,
    hasTimeSensitiveAction: analyses.some(hasTimeSensitiveAction),
    documentCount: analyses.length,
  };
};

export {
  POLICY_CORPUS_FORMAT_VERSION,
  POLICY_CORPUS_MAX_GZIP_BYTES,
  POLICY_CORPUS_ASSET,
  POLICY_BROWSE_FORMAT_VERSION,
  POLICY_BROWSE_ASSET,
  PolicyCorpusBundleSchema,
  PolicyBrowseRowSchema,
  PolicyBrowseManifestSchema,
  buildBrowseRows,
  parsePolicyBrowseManifest,
  RISK_LEVEL_ORDER,
  compareRiskLevelDescending,
  worstRiskLevel,
  analysisDomains,
  hasTimeSensitiveAction,
  indexPolicyCorpus,
  parsePolicyCorpus,
  analysesForDomain,
  analysesForHostname,
  analysisForHash,
  domainRiskSummary,
};
export type { PolicyCorpusBundle, PolicyCorpus, PolicyBrowseRow, PolicyBrowseManifest };
