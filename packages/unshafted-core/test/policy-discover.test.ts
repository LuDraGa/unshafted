import { choosePolicyUrl, guessDocType, POLICY_LINK_PATTERN, wellKnownPolicyPaths } from '../index.mts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PolicyCandidate } from '../index.mts';

const candidate = (href: string, text: string, inFooterRegion = true): PolicyCandidate => ({
  href,
  text,
  inFooterRegion,
});

test('doc type guessing prefers the most specific match', () => {
  assert.equal(guessDocType('/privacy', 'Privacy Policy'), 'privacy');
  assert.equal(guessDocType('/terms', 'Terms of Service'), 'terms');
  assert.equal(guessDocType('/cookies', 'Cookie Notice'), 'cookie');
  assert.equal(guessDocType('/legal/dpa', 'Data Processing Addendum'), 'data_processing');
  assert.equal(guessDocType('/aup', 'Acceptable Use Policy'), 'acceptable_use');
  assert.equal(guessDocType('/eula', 'End User License Agreement'), 'eula');
  assert.equal(guessDocType('/about', 'About us'), null);

  // "Data Processing Addendum" must not fall through to `terms` on the word "conditions".
  assert.equal(guessDocType('/legal/dpa-terms-and-conditions', 'DPA'), 'data_processing');
});

test('link pattern matches the conventional footer wording', () => {
  for (const text of ['Privacy', 'Terms of Use', 'Cookie Policy', 'Legal', 'EULA', 'Do Not Sell My Info']) {
    assert.ok(POLICY_LINK_PATTERN.test(text), `expected a match for "${text}"`);
  }
  assert.equal(POLICY_LINK_PATTERN.test('Careers'), false);
});

test('choosing a URL prefers same-origin footer links with shallow paths', () => {
  const chosen = choosePolicyUrl(
    [
      candidate('https://cdn.other.example/privacy', 'Privacy Policy'),
      candidate('/blog/2019/why-privacy-matters', 'Why privacy matters'),
      candidate('/privacy', 'Privacy Policy'),
    ],
    { docType: 'privacy', pageUrl: 'https://shop.example.com/cart' },
  );

  assert.equal(chosen?.url, 'https://shop.example.com/privacy');
  assert.equal(chosen?.source, 'link');
});

test('choosing a URL ignores links for a different document type', () => {
  const chosen = choosePolicyUrl([candidate('/terms', 'Terms of Service')], {
    docType: 'privacy',
    pageUrl: 'https://example.com/',
  });

  // No privacy link present, so it falls back to a guess rather than returning the terms page.
  assert.equal(chosen?.source, 'path-guess');
  assert.equal(chosen?.url, 'https://example.com/privacy');
});

test('choosing a URL falls back to a well-known path when nothing is linked', () => {
  const chosen = choosePolicyUrl([], { docType: 'terms', pageUrl: 'https://example.com/checkout?step=2' });
  assert.equal(chosen?.source, 'path-guess');
  assert.equal(chosen?.url, 'https://example.com/terms');
});

test('choosing a URL rejects unusable hrefs', () => {
  const chosen = choosePolicyUrl(
    [
      candidate('javascript:void(0)', 'Privacy Policy'),
      candidate('mailto:privacy@example.com', 'Privacy'),
    ],
    { docType: 'privacy', pageUrl: 'https://example.com/' },
  );

  // Both are unusable, so this must be the guess, not one of them.
  assert.equal(chosen?.source, 'path-guess');
});

test('choosing a URL resolves relative hrefs against the page', () => {
  const chosen = choosePolicyUrl([candidate('../legal/privacy', 'Privacy')], {
    docType: 'privacy',
    pageUrl: 'https://example.com/a/b/page.html',
  });

  assert.equal(chosen?.url, 'https://example.com/a/legal/privacy');
});

test('choosing a URL survives a malformed page URL', () => {
  assert.equal(choosePolicyUrl([candidate('/privacy', 'Privacy')], { docType: 'privacy', pageUrl: 'not a url' }), null);
});

test('every doc type has at least one well-known path', () => {
  for (const docType of ['privacy', 'terms', 'cookie', 'eula', 'acceptable_use', 'data_processing'] as const) {
    assert.ok(wellKnownPolicyPaths(docType).length > 0, `no paths for ${docType}`);
  }
});

/**
 * `chrome.scripting.executeScript({ func })` STRINGIFIES the function, so anything it closes
 * over is gone at the injection site. That produces a runtime ReferenceError in the page, which
 * neither the type-checker nor a normal unit test would catch — this is the only guard.
 */
test('injected functions close over nothing from module scope', async () => {
  const { collectPolicyCandidatesInPage, fetchDocumentInPage } = await import('../index.mts');

  const moduleScopeNames = [
    'POLICY_LINK_PATTERN',
    'DOC_TYPE_PATTERNS',
    'guessDocType',
    'wellKnownPolicyPaths',
    'scoreCandidate',
    'choosePolicyUrl',
  ];

  for (const injected of [collectPolicyCandidatesInPage, fetchDocumentInPage]) {
    const source = String(injected);
    for (const name of moduleScopeNames) {
      assert.ok(
        !source.includes(name),
        `${injected.name} references module-scope "${name}"; it must be self-contained.`,
      );
    }
  }
});

test('the page-candidate collector runs against a DOM-shaped stub', async () => {
  const { collectPolicyCandidatesInPage } = await import('../index.mts');

  const anchor = (href: string, text: string, footer: boolean) => ({
    getAttribute: () => href,
    textContent: text,
    closest: (selector: string) => (footer && selector.includes('footer') ? {} : null),
    getBoundingClientRect: () => ({ top: 100 }),
  });

  const anchors = [
    anchor('/privacy', 'Privacy Policy', true),
    anchor('/careers', 'Careers', true),
    anchor('#top', 'Back to top', false),
    anchor('/terms', 'Terms of Service', false),
  ];

  const priorDocument = globalThis.document;
  const priorWindow = globalThis.window;

  Object.assign(globalThis, {
    document: { querySelectorAll: () => anchors, body: { scrollHeight: 1000 } },
    window: { scrollY: 0 },
  });

  try {
    const found = collectPolicyCandidatesInPage();
    assert.deepEqual(
      found.map(item => item.href),
      ['/privacy', '/terms'],
    );
    assert.equal(found[0]?.inFooterRegion, true);
  } finally {
    Object.assign(globalThis, { document: priorDocument, window: priorWindow });
  }
});
