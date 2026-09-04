import {
  computePolicyHash,
  normalizePolicyHtml,
  POLICY_NORMALIZER_VERSION,
  SitePolicyAnalysisSchema,
  SITE_POLICY_SCHEMA_VERSION,
} from '../index.mts';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const FIXTURE_ROOT = fileURLToPath(new URL('./fixtures/site-policy/', import.meta.url));

/**
 * Acceptance gate from execution-docs/site-policy-part1-client-corpus.md §5.
 * Everything is content-addressed, so an unstable normalizer manufactures phantom
 * "policy changed" events forever.
 */
const STABILITY_TARGET = 0.95;

const loadPairs = (group: 'stable' | 'changed'): { name: string; a: string; b: string }[] =>
  readdirSync(`${FIXTURE_ROOT}${group}`)
    .filter(file => file.endsWith('.a.html'))
    .map(file => {
      const name = file.replace(/\.a\.html$/, '');
      return {
        name,
        a: readFileSync(`${FIXTURE_ROOT}${group}/${name}.a.html`, 'utf8'),
        b: readFileSync(`${FIXTURE_ROOT}${group}/${name}.b.html`, 'utf8'),
      };
    });

test('normalizer is stable across cosmetic page changes', async () => {
  const pairs = loadPairs('stable');
  assert.ok(pairs.length > 0, 'no stable fixtures found');

  const failures: string[] = [];
  for (const { name, a, b } of pairs) {
    const [left, right] = await Promise.all([computePolicyHash(a), computePolicyHash(b)]);
    if (left.hash !== right.hash) failures.push(name);
  }

  const rate = (pairs.length - failures.length) / pairs.length;
  assert.ok(
    rate >= STABILITY_TARGET,
    `hash stability ${(rate * 100).toFixed(1)}% is below the ${STABILITY_TARGET * 100}% gate. ` +
      `Unstable fixtures: ${failures.join(', ')}`,
  );
});

/**
 * The opposite failure, and the worse one: a normalizer that strips too much makes a real
 * clause change invisible. This is an invariant, not a rate — every case must be detected.
 */
test('normalizer detects every substantive change', async () => {
  const pairs = loadPairs('changed');
  assert.ok(pairs.length > 0, 'no changed fixtures found');

  for (const { name, a, b } of pairs) {
    const [left, right] = await Promise.all([computePolicyHash(a), computePolicyHash(b)]);
    assert.notEqual(left.hash, right.hash, `substantive change went undetected: ${name}`);
  }
});

test('normalizer keeps policy text and drops site chrome', () => {
  const html = readFileSync(`${FIXTURE_ROOT}stable/nav-markup.b.html`, 'utf8');
  const { text, usedMainContainer } = normalizePolicyHtml(html);

  assert.equal(usedMainContainer, true);
  assert.match(text, /Binding arbitration/);
  assert.match(text, /within 30 days of first accepting these terms/);
  assert.match(text, /Terms & Conditions/); // entities decoded
  assert.doesNotMatch(text, /Pricing|Plans|Careers/); // nav and footer gone
  assert.doesNotMatch(text, /<[a-z]/i); // no tags survive
});

test('normalizer preserves case and last-updated dates', () => {
  const { text } = normalizePolicyHtml(readFileSync(`${FIXTURE_ROOT}stable/nav-markup.a.html`, 'utf8'));
  assert.match(text, /Last updated: 12 March 2026/);
  assert.match(text, /Privacy Policy/);
});

test('normalizer handles empty and tagless input without throwing', () => {
  assert.deepEqual(normalizePolicyHtml(''), { text: '', length: 0, usedMainContainer: false });
  assert.equal(normalizePolicyHtml('   ').text, '');
  assert.equal(normalizePolicyHtml('Just plain text.').text, 'Just plain text.');
});

test('normalizer survives unclosed tags', () => {
  const { text } = normalizePolicyHtml('<body><main><p>Clause one.<p>Clause two.</main></body>');
  assert.match(text, /Clause one\./);
  assert.match(text, /Clause two\./);
});

test('content hash is a 64-char hex digest of the normalized text', async () => {
  const { hash } = await computePolicyHash('<main><p>Hello</p></main>');
  assert.match(hash, /^[0-9a-f]{64}$/);

  // Identity is the normalized text, never the raw HTML (AD-1).
  const other = await computePolicyHash('<main><div><p>Hello</p></div></main>');
  assert.equal(hash, other.hash);
});

test('SitePolicyAnalysisSchema accepts a minimal adhesion-contract analysis', () => {
  const parsed = SitePolicyAnalysisSchema.parse({
    schemaVersion: SITE_POLICY_SCHEMA_VERSION,
    contentHash: 'a'.repeat(64),
    domain: 'example.com',
    docType: 'privacy',
    verticals: ['saas_productivity'],
    normalizerVersion: POLICY_NORMALIZER_VERSION,
    sourceUrl: 'https://example.com/privacy',
    promptVersion: 'site-policy-v1',
    model: 'anthropic/claude-sonnet-5',
    analyzedAt: '2026-09-04T00:00:00.000Z',
    summary: 'Standard SaaS privacy policy with a 30-day arbitration opt-out.',
    riskLevel: 'Medium',
    confidence: 'medium',
    exposures: [
      {
        title: 'Binding individual arbitration',
        severity: 'high',
        category: 'Disputes',
        whatItMeans: 'Disputes go to arbitration, not court.',
        whyItMatters: 'You give up class actions and a jury trial.',
        reference: { label: 'Section 3', quote: 'resolved by binding individual arbitration' },
      },
    ],
    availableActions: [
      {
        action: 'Opt out of binding arbitration',
        howTo: 'Send written notice to the address in Section 3.',
        effort: 'low',
        deadline: { kind: 'relative_to_signup', days: 30, description: '30 days from first accepting' },
      },
    ],
  });

  assert.equal(parsed.exposures.length, 1);
  assert.equal(parsed.availableActions[0]?.deadline?.days, 30);
  // Defaulted arrays keep published objects self-describing (AD-6).
  assert.deepEqual(parsed.requiredDisclosures, []);
  assert.deepEqual(parsed.peerDeviation, []);
});

test('SitePolicyAnalysisSchema rejects a malformed content hash', () => {
  assert.throws(() =>
    SitePolicyAnalysisSchema.parse({
      schemaVersion: SITE_POLICY_SCHEMA_VERSION,
      contentHash: 'too-short',
      domain: 'example.com',
      docType: 'privacy',
      verticals: ['other'],
      normalizerVersion: POLICY_NORMALIZER_VERSION,
      sourceUrl: 'https://example.com/privacy',
      promptVersion: 'site-policy-v1',
      model: 'test',
      analyzedAt: '2026-09-04T00:00:00.000Z',
      summary: 'x',
      riskLevel: 'Low',
      confidence: 'low',
    }),
  );
});
