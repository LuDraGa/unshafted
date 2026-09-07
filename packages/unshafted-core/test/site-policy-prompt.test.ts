import {
  buildSitePolicyAnalysisSystemPrompt,
  buildSitePolicyAnalysisUserPrompt,
  PolicyDocTypeSchema,
  VerticalSchema,
} from '../index.mts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PolicyDocType, Vertical } from '../index.mts';

const userPrompt = (overrides: Partial<Parameters<typeof buildSitePolicyAnalysisUserPrompt>[0]> = {}) =>
  buildSitePolicyAnalysisUserPrompt({
    domain: 'example.com',
    sourceUrl: 'https://example.com/legal/terms',
    docType: 'terms',
    verticals: ['ecommerce'],
    preparedText: 'You agree to binding individual arbitration.',
    excerpted: false,
    ...overrides,
  });

/**
 * The four rules from Part 6 S4 are the difference between output that is honest and output that
 * is merely plausible, and they are the whole reason W1 was sequenced ahead of the button. A rule
 * silently dropped in an edit would still produce schema-valid JSON, so nothing else would notice.
 */
test('the system prompt carries all four standing rules', () => {
  const prompt = buildSitePolicyAnalysisSystemPrompt();

  assert.match(prompt, /Never state a fact the document does not state/);
  assert.match(prompt, /not a deadline's anchor/);
  assert.match(prompt, /Never report a disclosure as absent on the strength of a partial read/);
  assert.match(prompt, /Deadlines are windows, never countdowns/);
  assert.match(prompt, /Make no comparative claim/);
  assert.match(prompt, /minimum of ten peers/);
});

test('the system prompt frames the document as adhesion, not negotiation', () => {
  const prompt = buildSitePolicyAnalysisSystemPrompt();

  assert.match(prompt, /contract of adhesion/);
  assert.match(prompt, /KNOW, OPT OUT, AVOID and LEAVE/);
  // "negotiate" may only appear as the thing being ruled out, never as an instruction.
  assert.match(prompt, /any suggestion to "ask for", "push back on" or "negotiate" a clause is dead/);
});

test('the user prompt interpolates the document under analysis', () => {
  const prompt = userPrompt();

  assert.match(prompt, /Site: example\.com/);
  assert.match(prompt, /Source: https:\/\/example\.com\/legal\/terms/);
  assert.match(prompt, /Terms of service \(terms\)/);
  assert.match(prompt, /You agree to binding individual arbitration\./);
  assert.match(prompt, /44 characters/);
});

test('the document type selects what the document is read against', () => {
  const terms = userPrompt({ docType: 'terms' });
  const cookie = userPrompt({ docType: 'cookie' });
  const grievance = userPrompt({ docType: 'regulatory_disclosure' });

  assert.match(terms, /Arbitration opt-out right/);
  assert.doesNotMatch(terms, /Consent mechanism for non-essential cookies/);

  assert.match(cookie, /Consent mechanism for non-essential cookies/);
  assert.match(grievance, /Named Grievance Officer/);
});

test('verticals add their own expectations, and an unclassified site gets no guess', () => {
  const streaming = userPrompt({ verticals: ['ott_streaming', 'subscription_autorenewal'] });
  assert.match(streaming, /Also expected of a site in ott_streaming \/ subscription_autorenewal/);
  assert.match(streaming, /Automatic renewal disclosure/);

  const unclassified = userPrompt({ verticals: undefined });
  assert.match(unclassified, /not classified — do not guess one/);
  assert.doesNotMatch(unclassified, /Also expected of a site in/);

  // `other` is the schema's escape hatch, not a vertical with expectations of its own.
  const other = userPrompt({ verticals: ['other'] });
  assert.match(other, /not classified — do not guess one/);
});

/**
 * S6: the excerpt path is the common case, not the exception. `DocumentCard` renders every
 * `absent` disclosure under a red "Missing disclosures" heading, so an absence claim drawn from a
 * partial read is published as an accusation against a real company under the user's own name.
 */
test('an excerpted run is forbidden from claiming absence and from claiming high confidence', () => {
  const prompt = userPrompt({ excerpted: true });

  assert.match(prompt, /AN EXCERPT of a longer document/);
  assert.match(prompt, /Incomplete text\./);
  assert.match(prompt, /confidence must be "medium" or "low"\. Never "high"\./);
  assert.match(prompt, /Do NOT emit any requiredDisclosures entry with status "absent"/);
  assert.match(prompt, /Name in the summary/);
  assert.doesNotMatch(prompt, /Complete text\./);
});

test('a complete run may claim absence, scoped to the one document it read', () => {
  const prompt = userPrompt({ excerpted: false });

  assert.match(prompt, /the complete normalized document/);
  assert.match(prompt, /it means absent from THIS document, not from the site/);
  assert.doesNotMatch(prompt, /Incomplete text\./);
});

/**
 * The caller fills provenance from the capture, exactly as `tools/corpus/write-analysis.ts` does —
 * a model asked to restate an observed fact rewrites it as a plausible one, and a wrong
 * `contentHash` validates perfectly while making the object unreachable forever.
 */
test('the model is asked for the analytic content only', () => {
  const prompt = userPrompt();
  const contract = prompt.slice(prompt.indexOf('Return a JSON object'), prompt.indexOf('Definitions:'));

  for (const key of ['summary', 'riskLevel', 'confidence', 'exposures', 'availableActions', 'requiredDisclosures']) {
    assert.match(contract, new RegExp(`"${key}"`));
  }
  for (const provenance of ['contentHash', 'normalizerVersion', 'promptVersion', 'model', 'schemaVersion']) {
    assert.doesNotMatch(contract, new RegExp(`"${provenance}"`));
  }

  assert.match(prompt, /Emit no other key\./);
  assert.match(prompt, /peerDeviation in particular is always empty for this run/);
});

/**
 * Every enum member must have a brief and a checklist. Adding one to `PolicyDocTypeSchema` or
 * `VerticalSchema` without extending this file would interpolate `undefined` into a live prompt,
 * which no type check and no schema parse would ever surface.
 */
test('every document type and vertical produces a complete prompt', () => {
  for (const docType of PolicyDocTypeSchema.options as PolicyDocType[]) {
    const prompt = userPrompt({ docType });
    assert.doesNotMatch(prompt, /undefined/, `${docType} left a hole in the prompt`);
    assert.ok(prompt.includes(`(${docType})`), `${docType} is not named in its own prompt`);
  }

  for (const vertical of VerticalSchema.options as Vertical[]) {
    const prompt = userPrompt({ verticals: [vertical] });
    assert.doesNotMatch(prompt, /undefined/, `${vertical} left a hole in the prompt`);
  }
});
