import {
  buildSitePolicyAnalysisSystemPrompt,
  buildSitePolicyAnalysisUserPrompt,
  gradedProducts,
  PolicyDocTypeSchema,
  PRODUCT_CATALOGUE,
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

  for (const key of [
    'summary',
    'riskLevel',
    'confidence',
    'productScopes',
    'exposures',
    'availableActions',
    'requiredDisclosures',
  ]) {
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

/**
 * B2. A company that publishes one policy across many products gets the closed list, and a reader
 * on one product then sees that product's grade. Every id has to reach the model, or the model
 * either drops findings into "company-wide" or invents an id the validator will reject.
 */
test("a catalogue company's document is scoped to its own closed product list", () => {
  for (const entry of PRODUCT_CATALOGUE) {
    const prompt = userPrompt({ domain: entry.domains[0]!, company: entry });

    assert.match(prompt, new RegExp(`This is ${entry.name}'s policy for many products at once`));
    for (const product of entry.products) {
      assert.ok(prompt.includes(`- ${product.id} — ${product.name}`), `${entry.id}: ${product.id} is not offered`);
    }

    const grade = prompt.slice(prompt.indexOf('grade each one:'), prompt.indexOf('tag only:'));
    for (const product of gradedProducts(entry)) assert.ok(grade.includes(`- ${product.id} —`), product.id);
    for (const product of entry.products.filter(item => item.matchers.length === 0)) {
      assert.ok(!grade.includes(`- ${product.id} —`), `${product.id} has no page and must not be graded`);
    }

    assert.match(prompt, /Leave the list empty when anyone using any .+ product this document governs is exposed/);
    assert.match(prompt, /exactly one entry for each product in the first list/);
    assert.doesNotMatch(prompt, /undefined/);

    // Another company's ids never reach this document's prompt.
    for (const other of PRODUCT_CATALOGUE.filter(item => item.id !== entry.id)) {
      for (const product of other.products) assert.ok(!prompt.includes(`- ${product.id} —`), product.id);
    }
  }
});

test('a document outside the catalogue is told to leave every product field empty', () => {
  for (const prompt of [userPrompt(), userPrompt({ company: null })]) {
    assert.match(prompt, /This document is not scoped by product/);
    assert.match(prompt, /every "products" list is empty, and "productScopes" is empty/);
    assert.doesNotMatch(prompt, /grade each one:/);
  }
});

test('the output contract defines products on findings and the product scope', () => {
  const prompt = userPrompt();
  const definitions = prompt.slice(prompt.indexOf('Definitions:'));

  assert.match(definitions, /Exposure = \{[^\n]*"products": string\[\]/);
  assert.match(definitions, /AvailableAction = \{[^\n]*"products": string\[\]/);
  assert.match(
    definitions,
    /ProductScope = \{ "product": string, "riskLevel": "Low" \| "Medium" \| "High" \| "Very High", "summary": string \}/,
  );
});
