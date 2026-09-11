import {
  POLICY_CORPUS_MAX_GZIP_BYTES,
  analysesForDomain,
  analysesForHostname,
  analysisDomains,
  analysisForHash,
  compareRiskLevelDescending,
  decodePolicyIndex,
  domainRiskSummary,
  encodePolicyIndex,
  hasTimeSensitiveAction,
  lookupDomain,
  parsePolicyCorpus,
  parsePolicySeed,
  RISK_LEVEL_ORDER,
  worstRiskLevel,
} from '../index.mts';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { PolicyCorpus, SitePolicyAnalysis } from '../index.mts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUNDLE_FILE = `${REPO_ROOT}chrome-extension/public/policy-corpus.json`;
const SEED_FILE = `${REPO_ROOT}chrome-extension/policy-seed.json`;
const ANALYSIS_DIR = `${REPO_ROOT}corpus/analysis`;

/**
 * The stripe.com cookie policy. Excluded from the bundle because the capture hashed transient
 * banner state, so its hash can never match what a real user's page normalizes to. This constant
 * exists so the test fails loudly if someone re-adds it, rather than the exclusion quietly
 * evaporating in a future regeneration.
 */
const EXCLUDED_HASH = '665e157ec1c7fa860febc92bcf4a411d32ea226da73c63ec1b9de0b84a141fe9';

/**
 * `corpus/analysis/` is gitignored, so the corpus-backed tests must skip on a clean checkout
 * rather than fail. The committed bundle is always present, and carries most of the coverage.
 */
const hasCorpus = existsSync(ANALYSIS_DIR);

const loadBundle = () => JSON.parse(readFileSync(BUNDLE_FILE, 'utf8')) as unknown;
const loadCorpus = (): PolicyCorpus => parsePolicyCorpus(loadBundle());

const analysis = (over: Partial<SitePolicyAnalysis> & Pick<SitePolicyAnalysis, 'contentHash'>): SitePolicyAnalysis => ({
  schemaVersion: 1,
  domain: 'example.com',
  domains: ['example.com'],
  docType: 'terms',
  verticals: ['saas_productivity'],
  surfaces: ['footer'],
  sourceUrl: 'https://example.com/terms',
  promptVersion: 'test',
  normalizerVersion: 'test',
  model: 'test',
  analyzedAt: '2026-09-04T00:00:00.000Z',
  summary: 'A test document.',
  riskLevel: 'High',
  confidence: 'high',
  exposures: [],
  availableActions: [],
  requiredDisclosures: [],
  peerDeviation: [],
  ...over,
});

const bundleOf = (analyses: SitePolicyAnalysis[]) => ({
  formatVersion: 1 as const,
  generatedAt: '2026-09-06T00:00:00.000Z',
  analyses,
});

// --- worst-of selection (D1) -------------------------------------------------------------------

test('worst-of takes the worst document, not the average', () => {
  assert.equal(worstRiskLevel(['Medium', 'Very High']), 'Very High');
  assert.equal(worstRiskLevel(['High', 'High', 'Low', 'Medium']), 'High');
  assert.equal(worstRiskLevel(['Medium']), 'Medium');
  assert.equal(worstRiskLevel([]), null);
});

test('severity ordering matches the index payload encoding', async () => {
  // `index-format.ts` pins risk levels to 2-bit payload values and must never be reordered.
  // If these two lists ever disagree, the badge tint stops matching the panel headline.
  const index = decodePolicyIndex(
    await encodePolicyIndex(
      RISK_LEVEL_ORDER.map((riskLevel, i) => ({
        domain: `level-${i}.example`,
        riskLevel,
        hasTimeSensitiveAction: false,
      })),
    ),
  );

  for (const [i, riskLevel] of RISK_LEVEL_ORDER.entries()) {
    const entry = await lookupDomain(index, `level-${i}.example`);
    assert.equal(entry?.riskLevel, riskLevel);
  }
});

test(
  'the seed carries the worst level for domains whose documents disagree by two levels',
  {
    skip: !hasCorpus && 'corpus/analysis is not present',
  },
  () => {
    const corpus = loadCorpus();
    const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as {
      domains: { domain: string; riskLevel: string; hasTimeSensitiveAction: boolean }[];
    };
    const seeded = new Map(seed.domains.map(row => [row.domain, row]));

    // Part 5 D1's named cases: two full levels apart, where an average would describe neither
    // document. Zerodha caps a broker's liability at INR 100 in terms it grades Very High, while
    // its privacy policy is Medium.
    for (const [domain, expected] of [
      ['zerodha.com', 'Very High'],
      ['x.com', 'Very High'],
      ['snapchat.com', 'Very High'],
      ['americanexpress.com', 'High'],
    ] as const) {
      const analyses = analysesForDomain(corpus, domain);
      assert.ok(analyses.length > 1, `${domain} needs several documents to be a worst-of case`);

      const levels = analyses.map(item => item.riskLevel);
      assert.equal(worstRiskLevel(levels), expected, `${domain} worst-of over ${levels.join(', ')}`);
      assert.equal(seeded.get(domain)?.riskLevel, expected, `${domain} seed row`);

      // The point of worst-of: at least one document is graded strictly lower than the badge says.
      assert.ok(
        levels.some(level => level !== expected),
        `${domain} is not actually a disagreement case any more`,
      );
    }
  },
);

test('per-domain analyses come back worst first', () => {
  const corpus = parsePolicyCorpus(
    bundleOf([
      analysis({ contentHash: 'a'.repeat(64), riskLevel: 'Medium', docType: 'privacy' }),
      analysis({ contentHash: 'b'.repeat(64), riskLevel: 'Very High', docType: 'terms' }),
      analysis({ contentHash: 'c'.repeat(64), riskLevel: 'High', docType: 'cookie' }),
    ]),
  );

  assert.deepEqual(
    analysesForDomain(corpus, 'example.com').map(item => item.riskLevel),
    ['Very High', 'High', 'Medium'],
  );
  assert.ok(compareRiskLevelDescending('Very High', 'Low') < 0);
});

test('a domain summary reports the worst level, any deadline, and the document count', () => {
  const withDeadline = analysis({
    contentHash: 'd'.repeat(64),
    riskLevel: 'Medium',
    availableActions: [
      {
        action: 'Opt out of arbitration',
        howTo: 'Post a letter.',
        effort: 'high',
        deadline: { kind: 'relative_to_signup', days: 30, description: '30 days from signup' },
      },
    ],
  });
  const withoutDeadline = analysis({
    contentHash: 'e'.repeat(64),
    riskLevel: 'Very High',
    availableActions: [
      {
        action: 'Close the account',
        howTo: 'Settings.',
        effort: 'low',
        deadline: { kind: 'none', description: 'no window' },
      },
    ],
  });

  assert.equal(hasTimeSensitiveAction(withDeadline), true);
  // `kind: 'none'` is a described-but-unbounded action; a deadline object alone is not a clock.
  assert.equal(hasTimeSensitiveAction(withoutDeadline), false);

  assert.deepEqual(domainRiskSummary([withDeadline, withoutDeadline]), {
    riskLevel: 'Very High',
    hasTimeSensitiveAction: true,
    documentCount: 2,
  });
  assert.equal(domainRiskSummary([]), null);
});

// --- the exclusion (Part 5, "One genuine exclusion") --------------------------------------------

test('the stripe.com cookie analysis is absent from the bundle', () => {
  const corpus = loadCorpus();
  assert.equal(analysisForHash(corpus, EXCLUDED_HASH), null);
  assert.ok(
    !corpus.analyses.some(item => item.contentHash === EXCLUDED_HASH),
    'a hash that can never match a live page must not ship',
  );

  // Excluding it must not have cost stripe.com its coverage.
  const stripe = analysesForDomain(corpus, 'stripe.com');
  assert.ok(stripe.length > 0, 'stripe.com should still be covered by its other documents');
  assert.ok(!stripe.some(item => item.docType === 'cookie'));
});

test(
  'the excluded analysis exists in the corpus, so the exclusion is real',
  {
    skip: !hasCorpus && 'corpus/analysis is not present',
  },
  () => {
    assert.ok(
      existsSync(`${ANALYSIS_DIR}/${EXCLUDED_HASH}.json`),
      'the exclusion no longer names anything — it is stale and hiding nothing',
    );
  },
);

// --- loader lookups ------------------------------------------------------------------------------

test('lookups resolve domain to analyses and hash to a single analysis', () => {
  const disney = analysis({
    contentHash: 'f'.repeat(64),
    domain: 'disneyplus.com',
    domains: ['disneyplus.com', 'hotstar.com'],
  });
  const corpus = parsePolicyCorpus(bundleOf([disney]));

  // One document, two sites: seeding only the primary would leave hotstar.com uncovered.
  assert.deepEqual(analysisDomains(disney), ['disneyplus.com', 'hotstar.com']);
  assert.equal(analysesForDomain(corpus, 'hotstar.com')[0]?.contentHash, disney.contentHash);
  assert.equal(analysesForDomain(corpus, 'DisneyPlus.com')[0]?.contentHash, disney.contentHash);
  assert.deepEqual(analysesForDomain(corpus, 'not-covered.example'), []);

  assert.equal(analysisForHash(corpus, disney.contentHash)?.domain, 'disneyplus.com');
  // A miss is an answer, not an error — it is D6's "changed since we read it".
  assert.equal(analysisForHash(corpus, '0'.repeat(64)), null);
});

test('hostname resolution walks suffixes, most specific first', () => {
  const corpus = parsePolicyCorpus(
    bundleOf([
      analysis({ contentHash: '1'.repeat(64), domain: 'example.com', domains: ['example.com'] }),
      analysis({ contentHash: '2'.repeat(64), domain: 'shop.example.com', domains: ['shop.example.com'] }),
    ]),
  );

  assert.equal(analysesForHostname(corpus, 'www.example.com')?.domain, 'example.com');
  assert.equal(analysesForHostname(corpus, 'shop.example.com')?.domain, 'shop.example.com');
  assert.equal(analysesForHostname(corpus, 'a.b.shop.example.com')?.domain, 'shop.example.com');
  assert.equal(analysesForHostname(corpus, 'elsewhere.test'), null);
});

test('a duplicated content hash is rejected rather than silently shadowed', () => {
  assert.throws(
    () =>
      parsePolicyCorpus(
        bundleOf([analysis({ contentHash: '3'.repeat(64) }), analysis({ contentHash: '3'.repeat(64) })]),
      ),
    /twice/,
  );
});

// --- the committed bundle ------------------------------------------------------------------------

test('the committed bundle validates against the shipped schema', () => {
  const corpus = loadCorpus();
  assert.ok(corpus.analyses.length > 0);
  assert.equal(corpus.byHash.size, corpus.analyses.length);
});

test('the committed bundle stays inside its gzipped ceiling', () => {
  const gzipped = gzipSync(readFileSync(BUNDLE_FILE)).byteLength;
  assert.ok(
    gzipped <= POLICY_CORPUS_MAX_GZIP_BYTES,
    `bundle is ${gzipped} bytes gzipped, over the ${POLICY_CORPUS_MAX_GZIP_BYTES}-byte cap`,
  );
});

test(
  'bundled objects are verbatim copies of corpus/analysis',
  {
    skip: !hasCorpus && 'corpus/analysis is not present',
  },
  () => {
    const corpus = loadCorpus();
    const bundled = new Map(
      (loadBundle() as { analyses: SitePolicyAnalysis[] }).analyses.map(item => [item.contentHash, item]),
    );

    const files = readdirSync(ANALYSIS_DIR).filter(name => name.endsWith('.json'));
    assert.equal(bundled.size, files.length - 1, 'exactly one analysis is excluded');

    // D12: the bundle is a container, not a transformation. Anything lossy here is what would have
    // to be undone for the public library, so it is checked object by object.
    for (const file of files) {
      const hash = file.replace(/\.json$/, '');
      if (hash === EXCLUDED_HASH) continue;

      const source = JSON.parse(readFileSync(`${ANALYSIS_DIR}/${file}`, 'utf8')) as SitePolicyAnalysis;
      assert.deepEqual(bundled.get(hash), source, `${hash.slice(0, 8)} was altered on the way into the bundle`);
    }

    assert.equal(corpus.byHash.size, files.length - 1);
  },
);

test(
  'the seed is exactly the bundle collapsed per domain',
  {
    skip: !hasCorpus && 'corpus/analysis is not present',
  },
  () => {
    const corpus = loadCorpus();
    const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as {
      domains: { domain: string; riskLevel: string; hasTimeSensitiveAction: boolean }[];
    };

    // The badge and the panel read different files. If they ever disagree, the icon tints a site
    // the panel then contradicts.
    assert.equal(seed.domains.length, corpus.byDomain.size);
    for (const row of seed.domains) {
      const summary = domainRiskSummary(analysesForDomain(corpus, row.domain));
      assert.ok(summary, `${row.domain} is seeded but has no analyses`);
      assert.equal(row.riskLevel, summary.riskLevel, `${row.domain} risk level`);
      assert.equal(row.hasTimeSensitiveAction, summary.hasTimeSensitiveAction, `${row.domain} deadline flag`);
    }

    // And it has to survive the guard that keeps a multi-tenant public suffix out of the index.
    const { records } = parsePolicySeed(seed as never);
    assert.equal(records.length, seed.domains.length);
  },
);
