import {
  choosePolicyUrl,
  guessDocType,
  POLICY_LINK_PATTERN,
  rankPolicyCandidates,
  wellKnownPolicyPaths,
} from '../index.mts';
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
    [candidate('javascript:void(0)', 'Privacy Policy'), candidate('mailto:privacy@example.com', 'Privacy')],
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

/*
 * The reader (D9) lists documents for a person, so unlike `choosePolicyUrl` it must not throw
 * away a candidate for being the wrong type — only sort it down.
 */
test('ranking keeps every document and leads with the same-origin typed ones', () => {
  const ranked = rankPolicyCandidates(
    [
      candidate('https://cdn.other.example/privacy', 'Privacy Policy'),
      candidate('/legal', 'Legal'),
      candidate('/terms', 'Terms of Service'),
      candidate('/privacy', 'Privacy Policy'),
    ],
    { pageUrl: 'https://shop.example.com/cart' },
  );

  assert.deepEqual(
    ranked.map(item => item.url),
    [
      'https://shop.example.com/privacy',
      'https://shop.example.com/terms',
      'https://shop.example.com/legal',
      'https://cdn.other.example/privacy',
    ],
  );

  // An unclassifiable policy link is still listed, just typed as null and sorted below.
  assert.equal(ranked[2]?.docType, null);
  assert.equal(ranked[3]?.sameOrigin, false);
});

test('ranking folds in-page anchors into one document', () => {
  const ranked = rankPolicyCandidates(
    [candidate('/privacy#ads', 'Ad choices'), candidate('/privacy', 'Privacy Policy'), candidate('/privacy#top', '')],
    { pageUrl: 'https://example.com/' },
  );

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.url, 'https://example.com/privacy');
});

test('ranking drops hrefs that cannot be fetched or opened', () => {
  const ranked = rankPolicyCandidates(
    [candidate('javascript:void(0)', 'Privacy'), candidate('mailto:legal@example.com', 'Legal')],
    { pageUrl: 'https://example.com/' },
  );

  assert.deepEqual(ranked, []);
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
    'rankPolicyCandidates',
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

type StubAnchor = { href: string; text: string; footer: boolean; top: number };

const stubAnchor = (href: string, text: string, footer: boolean, top = 100): StubAnchor => ({
  href,
  text,
  footer,
  top,
});

/**
 * Runs the injected collector against a DOM-shaped stub. `querySelectorAll` answers a selector that
 * names the footer landmark with the footer anchors only, and anything else with every anchor, in
 * document order — enough of a DOM to tell "collected footer first" from "collected in order".
 */
const collectFromStub = async (anchors: StubAnchor[], patternSource: string) => {
  const { collectPolicyCandidatesInPage } = await import('../index.mts');

  const elements = anchors.map(item => ({
    getAttribute: () => item.href,
    textContent: item.text,
    closest: (selector: string) => (item.footer && selector.includes('footer') ? {} : null),
    getBoundingClientRect: () => ({ top: item.top }),
  }));

  const priorDocument = globalThis.document;
  const priorWindow = globalThis.window;

  Object.assign(globalThis, {
    document: {
      querySelectorAll: (selector: string) =>
        selector.includes('footer') ? elements.filter((_, index) => anchors[index]?.footer) : elements,
      body: { scrollHeight: 1000 },
    },
    window: { scrollY: 0 },
  });

  try {
    return collectPolicyCandidatesInPage(patternSource);
  } finally {
    Object.assign(globalThis, { document: priorDocument, window: priorWindow });
  }
};

test('the page-candidate collector runs against a DOM-shaped stub', async () => {
  const found = await collectFromStub(
    [
      stubAnchor('/privacy', 'Privacy Policy', true),
      stubAnchor('/careers', 'Careers', true),
      stubAnchor('#top', 'Back to top', false),
      stubAnchor('/terms', 'Terms of Service', false),
    ],
    POLICY_LINK_PATTERN.source,
  );

  assert.deepEqual(
    found.map(item => item.href),
    ['/privacy', '/terms'],
  );
  assert.equal(found[0]?.inFooterRegion, true);
});

/**
 * A1. The collector used to carry its own literal copy of the link pattern, and when `policy`,
 * `disclosure` and `consent` were added to the exported one after the Part 3 capture, the copy
 * that actually runs in the page never got them. The collector now takes the pattern as an
 * argument; this pins that it matches with what it is given and with nothing of its own, so a
 * second copy cannot creep back in unnoticed.
 */
test('the page collector matches with the pattern it is given and no copy of its own', async () => {
  const found = await collectFromStub(
    [stubAnchor('/privacy', 'Privacy Policy', true), stubAnchor('/zzqq', 'Zzqq notice', true)],
    'zzqq',
  );

  assert.deepEqual(
    found.map(item => item.href),
    ['/zzqq'],
  );
});

test('every word the exported pattern knows reaches the page', async () => {
  const wording = ['Content Policy', 'Cancellation Policies', 'Regulatory disclosure', 'Cookie consent choices'];
  const found = await collectFromStub(
    wording.map((text, index) => stubAnchor(`/page-${index}`, text, true)),
    POLICY_LINK_PATTERN.source,
  );

  assert.deepEqual(
    found.map(item => item.text),
    wording,
  );
});

/**
 * A4. Collection stops at 100 matches, and it used to take them in document order, so a header
 * mega-menu full of "Privacy settings"-style links spent the whole budget before the footer —
 * where the documents actually are — was reached. Footer-region anchors now come first.
 */
test('a header mega-menu cannot starve the footer of its place in the budget', async () => {
  const menu = Array.from({ length: 150 }, (_, index) =>
    stubAnchor(`/help/privacy-topic-${index}`, `Privacy help ${index}`, false, 40),
  );
  const found = await collectFromStub(
    [
      ...menu,
      stubAnchor('/policies/privacy', 'Privacy Policy', true, 980),
      stubAnchor('/policies/terms', 'Terms of Use', true, 985),
    ],
    POLICY_LINK_PATTERN.source,
  );

  assert.equal(found.length, 100);
  assert.deepEqual(
    found.slice(0, 2).map(item => item.href),
    ['/policies/privacy', '/policies/terms'],
  );
  assert.ok(found.slice(0, 2).every(item => item.inFooterRegion));
});

test('an anchor low on the page counts as footer even outside a footer landmark', async () => {
  const found = await collectFromStub(
    [stubAnchor('/privacy-center', 'Privacy Center', false, 40), stubAnchor('/legal/terms', 'Terms', false, 950)],
    POLICY_LINK_PATTERN.source,
  );

  assert.deepEqual(
    found.map(item => [item.href, item.inFooterRegion]),
    [
      ['/legal/terms', true],
      ['/privacy-center', false],
    ],
  );
});

/** The scan itself is bounded too, so on a page with more anchors than that the footer is read first. */
test('a footer beyond the scan budget is still read', async () => {
  const filler = Array.from({ length: 6000 }, (_, index) => stubAnchor(`/product/${index}`, `Product ${index}`, false));
  const found = await collectFromStub(
    [...filler, stubAnchor('/privacy', 'Privacy Policy', true, 990)],
    POLICY_LINK_PATTERN.source,
  );

  assert.deepEqual(
    found.map(item => item.href),
    ['/privacy'],
  );
});

/**
 * The scan has a bound as well as the result, so a page with tens of thousands of anchors costs a
 * fixed amount. It rose from 2000 to 5000 with A4, when the footer landmark started being read
 * first: the bound now only ever cuts non-footer anchors, so it can afford to be generous.
 */
test('the scan stops after five thousand anchors', async () => {
  const filler = Array.from({ length: 4999 }, (_, index) => stubAnchor(`/product/${index}`, `Product ${index}`, false));
  const found = await collectFromStub(
    [...filler, stubAnchor('/privacy', 'Privacy Policy', false), stubAnchor('/terms', 'Terms of Use', false)],
    POLICY_LINK_PATTERN.source,
  );

  assert.deepEqual(
    found.map(item => item.href),
    ['/privacy'],
  );
});

/**
 * A flag cannot travel inside `.source`, so the collector compiles what it is given with `i`. If
 * the exported pattern ever gains or loses a flag, this fails, and the collector has to be taught
 * to take the flags too — otherwise the in-page pattern drifts from the exported one again, which
 * is the class of bug A1 closed.
 */
test('the exported link pattern carries exactly the flag the page collector compiles with', () => {
  assert.equal(POLICY_LINK_PATTERN.flags, 'i');
});
