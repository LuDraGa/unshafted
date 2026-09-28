/**
 * A2 — reading a policy document wherever it is hosted, and D8 — offering only what was read.
 *
 * Until S2 a document was fetched from inside the page, which made "same origin" the line between
 * readable and not: `github.com` could not read `docs.github.com`, and `chatgpt.com` could not read
 * `openai.com`. The extension now reads every document itself, with cookies omitted, so origin
 * decides only the ORDER documents are listed in. What decides whether a document is offered for
 * analysis is whether reading it produced a policy.
 */
import {
  chooseOfferedDocuments,
  computePolicyHash,
  fetchPolicyPage,
  rankPolicyCandidates,
  readPolicyDocument,
  readRenderedPageInPage,
} from '../index.mts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  FetchedPolicyPage,
  PolicyDocumentCapture,
  PolicyPageRender,
  RankedPolicyCandidate,
  RenderedPolicyPage,
} from '../index.mts';

// Long enough to be a document under A3's prose floor (1,300 characters), not just the old 400.
const POLICY_TEXT = `<main><h1>Privacy Policy</h1><p>${'We collect personal information to run the service. '.repeat(40)}</p></main>`;

const page = (overrides: Partial<FetchedPolicyPage> = {}): FetchedPolicyPage => ({
  ok: true,
  status: 200,
  finalUrl: 'https://example.com/privacy',
  contentType: 'text/html; charset=utf-8',
  html: POLICY_TEXT,
  ...overrides,
});

const ranked = (url: string, docType: RankedPolicyCandidate['docType'], ownSite = true): RankedPolicyCandidate => ({
  url,
  label: '',
  docType,
  ownSite,
});

// ── Own site ──

test('a document on a subdomain of the page is the site’s own', () => {
  const [docs] = rankPolicyCandidates(
    [{ href: 'https://docs.github.com/site-policy', text: 'Privacy', inFooterRegion: true }],
    {
      pageUrl: 'https://github.com/',
    },
  );
  assert.equal(docs?.ownSite, true);
});

test('a document on another registrable domain is not the site’s own', () => {
  const [docs] = rankPolicyCandidates([{ href: 'https://openai.com/privacy', text: 'Privacy', inFooterRegion: true }], {
    pageUrl: 'https://chatgpt.com/',
  });
  assert.equal(docs?.ownSite, false);
});

test('two sites under one country-code suffix are not one site', () => {
  const [docs] = rankPolicyCandidates(
    [{ href: 'https://www.other.co.uk/privacy', text: 'Privacy', inFooterRegion: true }],
    { pageUrl: 'https://www.shop.co.uk/' },
  );
  assert.equal(docs?.ownSite, false);
});

test('the site’s own documents rank above another company’s of the same type', () => {
  const list = rankPolicyCandidates(
    [
      { href: 'https://policies.google.com/privacy', text: 'Google Privacy Policy', inFooterRegion: true },
      {
        href: 'https://www.webmd.com/about-webmd-policies/about-privacy-policy',
        text: 'Privacy Policy',
        inFooterRegion: true,
      },
    ],
    { pageUrl: 'https://www.webmd.com/' },
  );
  assert.equal(list[0]?.url, 'https://www.webmd.com/about-webmd-policies/about-privacy-policy');
});

// ── Reading one document ──

test('reading asks for no cookies and follows redirects', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const prior = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(POLICY_TEXT, { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  try {
    const fetched = await fetchPolicyPage('https://example.com/privacy');
    assert.equal(fetched.ok, true);
    assert.equal(calls[0]?.init?.credentials, 'omit');
    assert.equal(calls[0]?.init?.redirect, 'follow');
  } finally {
    globalThis.fetch = prior;
  }
});

test('reading does not download a body that is not a web page', async () => {
  let bodyRead = false;
  const prior = globalThis.fetch;
  globalThis.fetch = (async () => {
    const response = new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } });
    const text = response.text.bind(response);
    response.text = async () => {
      bodyRead = true;
      return text();
    };
    return response;
  }) as typeof fetch;
  try {
    const fetched = await fetchPolicyPage('https://example.com/terms.pdf');
    assert.equal(fetched.html, '');
    assert.equal(bodyRead, false);
  } finally {
    globalThis.fetch = prior;
  }
});

test('a network failure is a result, not a throw', async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  try {
    const fetched = await fetchPolicyPage('https://example.com/privacy');
    assert.equal(fetched.ok, false);
    assert.equal(fetched.status, 0);
  } finally {
    globalThis.fetch = prior;
  }
});

test('a readable policy is captured with its hash and final address', async () => {
  const captured = await readPolicyDocument('https://example.com/privacy', async () =>
    page({ finalUrl: 'https://example.com/legal/privacy' }),
  );
  assert.equal(captured.status, 'captured');
  if (captured.status !== 'captured') return;
  assert.match(captured.hash, /^[0-9a-f]{64}$/);
  assert.equal(captured.sourceUrl, 'https://example.com/legal/privacy');
});

test('an error status, a non-page and a shell each say why they could not be read', async () => {
  const reasons = await Promise.all([
    readPolicyDocument('u', async () => page({ ok: false, status: 404 })),
    readPolicyDocument('u', async () => page({ contentType: 'application/pdf', html: '' })),
    readPolicyDocument('u', async () => page({ html: '<div id="root"></div>' })),
    // Zepto's bot challenge: HTTP 202, an HTML content type, and no body at all.
    readPolicyDocument('u', async () => page({ status: 202, html: '' })),
  ]);
  assert.deepEqual(
    reasons.map(result => (result.status === 'unreadable' ? result.reason : result.status)),
    ['fetch-failed', 'not-html', 'too-short', 'too-short'],
  );
});

// ── A5: raw if it is a document, else rendered ──

/** What a JS-rendered policy's server sends: an empty app root, no text at all. */
const SHELL = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
/**
 * Practo's privacy policy as the server sends it: 282 characters of site menu carrying one policy
 * link, no prose — indistinguishable on its raw HTML from a legal hub.
 */
const MENU_WITH_ONE_LINK =
  '<html><body><div><a href="/about">About Company</a> <a href="/careers">Careers</a> ' +
  '<a href="/providers">Terms of service</a></div><div id="root"></div></body></html>';
const HUB =
  '<html><body><main><h1>Legal</h1><ul><li><a href="/legal/privacy">Privacy Policy</a></li>' +
  '<li><a href="/legal/terms">Terms of Service</a></li></ul></main></body></html>';

/** A way to open pages that records what it was asked to open, and answers from a table. */
const opener = (pages: Record<string, string | null>) => {
  const opened: string[] = [];
  const render: PolicyPageRender = async url => {
    opened.push(url);
    const html = pages[url];
    return html ? { html, url: `${url}#opened` } : null;
  };
  return { render, opened };
};

test('a policy whose raw HTML is an empty app shell is read by opening the page', async () => {
  const { render, opened } = opener({ 'https://example.com/privacy': POLICY_TEXT });
  const captured = await readPolicyDocument('https://example.com/privacy', async () => page({ html: SHELL }), render);

  assert.deepEqual(opened, ['https://example.com/privacy']);
  assert.equal(captured.status, 'captured');
  if (captured.status !== 'captured') return;
  assert.equal(captured.readMode, 'rendered');
  // Where the opened page ended up, not where the link pointed.
  assert.equal(captured.sourceUrl, 'https://example.com/privacy#opened');
});

test('a rendered read goes through the same normalizer, so the same page hashes the same', async () => {
  const { render } = opener({ u: POLICY_TEXT });
  const rendered = await readPolicyDocument('u', async () => page({ html: SHELL }), render);
  const raw = await readPolicyDocument('u', async () => page({ html: POLICY_TEXT }));

  assert.equal(rendered.status, 'captured');
  assert.equal(raw.status, 'captured');
  if (rendered.status !== 'captured' || raw.status !== 'captured') return;
  assert.equal(rendered.hash, (await computePolicyHash(POLICY_TEXT)).hash);
  assert.equal(rendered.hash, raw.hash);
  assert.deepEqual([raw.readMode, rendered.readMode], ['raw', 'rendered']);
});

test('a raw document is never opened', async () => {
  const { render, opened } = opener({ u: POLICY_TEXT });
  const captured = await readPolicyDocument('u', async () => page(), render);

  assert.deepEqual(opened, []);
  assert.equal(captured.status === 'captured' && captured.readMode, 'raw');
});

test('without a way to open it, a shell stays unreadable and says it has not been opened', async () => {
  const result = await readPolicyDocument('u', async () => page({ html: SHELL }));
  assert.deepEqual(result, { status: 'unreadable', reason: 'too-short', readMode: 'raw' });
});

test('a page that reads as a hub is opened too, because an unrun script can look like one', async () => {
  const { render, opened } = opener({ u: POLICY_TEXT });
  const captured = await readPolicyDocument('u', async () => page({ html: MENU_WITH_ONE_LINK }), render);

  assert.deepEqual(opened, ['u']);
  assert.equal(captured.status === 'captured' && captured.readMode, 'rendered');
});

test('a real hub, opened, is still a hub — with the links the opened page carries', async () => {
  const { render } = opener({ u: HUB });
  const result = await readPolicyDocument('u', async () => page({ html: MENU_WITH_ONE_LINK }), render);

  assert.equal(result.status, 'hub');
  if (result.status !== 'hub') return;
  assert.equal(result.readMode, 'rendered');
  assert.deepEqual(
    result.links.map(link => link.href),
    ['/legal/privacy', '/legal/terms'],
  );
});

test('a refused request and a bot check’s empty answer are both opened', async () => {
  const { render, opened } = opener({ refused: POLICY_TEXT, challenged: POLICY_TEXT });
  const results = await Promise.all([
    readPolicyDocument('refused', async () => page({ ok: false, status: 403, html: '' }), render),
    readPolicyDocument('challenged', async () => page({ status: 202, html: '' }), render),
  ]);

  assert.deepEqual(opened.sort(), ['challenged', 'refused']);
  assert.deepEqual(
    results.map(result => result.status),
    ['captured', 'captured'],
  );
});

test('a PDF is never opened: a tab showing one has no page to read', async () => {
  const { render, opened } = opener({ u: POLICY_TEXT });
  const result = await readPolicyDocument('u', async () => page({ contentType: 'application/pdf', html: '' }), render);

  assert.deepEqual(opened, []);
  assert.deepEqual(result, { status: 'unreadable', reason: 'not-html', readMode: 'raw' });
});

test('a page that could not be opened keeps its raw result, still marked unopened', async () => {
  const { render } = opener({ u: null });
  const result = await readPolicyDocument('u', async () => page({ html: SHELL }), render);
  assert.deepEqual(result, { status: 'unreadable', reason: 'too-short', readMode: 'raw' });
});

test('opened and still nothing: a shell is final, and a raw hub keeps its links', async () => {
  const { render } = opener({ shell: SHELL, hub: SHELL });
  const [shell, hub] = await Promise.all([
    readPolicyDocument('shell', async () => page({ html: SHELL }), render),
    readPolicyDocument('hub', async () => page({ html: HUB }), render),
  ]);

  assert.deepEqual(shell, { status: 'unreadable', reason: 'too-short', readMode: 'rendered' });
  assert.equal(hub.status, 'hub');
  if (hub.status !== 'hub') return;
  assert.equal(hub.readMode, 'rendered');
  assert.equal(hub.links.length, 2);
});

// ── A5: the in-page reader ──

/**
 * Runs the in-page reader from its SOURCE, in a scope that holds only the globals a page gives it
 * — as `executeScript` does — against a page stub and a clock the test drives. Anything the reader
 * closed over from this module, or a `__name` helper `tsx` wrapped around an inner function, is a
 * ReferenceError here exactly as it would be in the page.
 */
const runReader = async (script: (now: number) => { readyState: string; text: string }) => {
  let now = 0;
  const html = { current: '' };
  const document = {
    get readyState() {
      return script(now).readyState;
    },
    get body() {
      const { text } = script(now);
      return { textContent: text, innerText: text };
    },
    documentElement: {
      get outerHTML() {
        html.current = `<html><body>${script(now).text}</body></html>`;
        return html.current;
      },
    },
  };
  const clock = { now: () => now };
  const setTimeout = (callback: () => void, ms: number) => {
    now += ms;
    callback();
  };
  const reader = new Function(
    'document',
    'location',
    'Date',
    'setTimeout',
    `return (${String(readRenderedPageInPage)});`,
  )(document, { href: 'https://example.com/opened' }, clock, setTimeout) as () => Promise<RenderedPolicyPage>;
  const page = await reader();
  return { page, elapsed: now };
};

test('the in-page reader waits for the load event and for the text to stop changing', async () => {
  // Loads at 1s; JavaScript keeps adding text until 4s; then nothing changes.
  const { page, elapsed } = await runReader(now => ({
    readyState: now < 1_000 ? 'loading' : 'complete',
    text: 'x'.repeat(Math.min(now, 4_000)),
  }));

  assert.equal(page.url, 'https://example.com/opened');
  assert.equal(page.html, `<html><body>${'x'.repeat(4_000)}</body></html>`);
  // Read after 1.5s of quiet, not the moment the text first looked still.
  assert.ok(elapsed >= 5_500 && elapsed < 6_000, `read at ${elapsed}ms`);
});

test('a page gone quiet while still thin is given time to build its text', async () => {
  // Adobe's offer terms on a cold load: loaded at 1s, 90 characters of chrome, the policy at 5s.
  const { page, elapsed } = await runReader(now => ({
    readyState: now < 1_000 ? 'loading' : 'complete',
    text: now < 5_000 ? 'x'.repeat(90) : 'x'.repeat(30_000),
  }));

  assert.equal(page.html.length, '<html><body></body></html>'.length + 30_000);
  assert.ok(elapsed >= 6_500 && elapsed < 7_000, `read at ${elapsed}ms`);
});

test('a page that stays thin is read at the thin bound, as it stands', async () => {
  // A real hub: little text, and nothing more is coming.
  const { elapsed } = await runReader(now => ({
    readyState: now < 1_000 ? 'loading' : 'complete',
    text: 'x'.repeat(600),
  }));
  assert.ok(elapsed >= 8_000 && elapsed < 8_500, `read at ${elapsed}ms`);
});

test('the in-page reader stops waiting at its bound on a page that never goes quiet', async () => {
  // A ticker that keeps adding and removing a line: its length never holds still.
  const { elapsed } = await runReader(now => ({ readyState: 'complete', text: 'x'.repeat(1 + ((now / 250) % 2)) }));
  assert.ok(elapsed >= 12_000 && elapsed < 12_500, `read at ${elapsed}ms`);
});

test('the in-page reader declares no inner function for tsx to wrap in a helper the page lacks', () => {
  assert.ok(!String(readRenderedPageInPage).includes('__name'), String(readRenderedPageInPage));
});

// ── D8: what a site we do not cover is offered ──

const reader = (outcomes: Record<string, PolicyDocumentCapture['status']>) => {
  const asked: string[] = [];
  const read = async (url: string): Promise<PolicyDocumentCapture> => {
    asked.push(url);
    return outcomes[url] === 'captured'
      ? { status: 'captured', hash: url, text: 'policy', sourceUrl: url, usedMainContainer: true, readMode: 'raw' }
      : { status: 'unreadable', reason: 'too-short', readMode: 'raw' };
  };
  return { read, asked };
};

test('the top document of each type is read, and only a readable one is offered', async () => {
  const { read, asked } = reader({ '/privacy': 'captured', '/terms': 'unreadable' });
  const { offers } = await chooseOfferedDocuments([ranked('/privacy', 'privacy'), ranked('/terms', 'terms')], read);

  assert.deepEqual(asked.sort(), ['/privacy', '/terms']);
  assert.deepEqual(
    offers.map(offer => offer.url),
    ['/privacy'],
  );
});

test('a type whose top document cannot be read tries the next one of that type', async () => {
  const { read, asked } = reader({ '/terms-b': 'captured' });
  const { offers } = await chooseOfferedDocuments(
    [ranked('/terms-a', 'terms'), ranked('/terms-b', 'terms'), ranked('/terms-c', 'terms')],
    read,
  );

  assert.deepEqual(asked, ['/terms-a', '/terms-b']);
  assert.deepEqual(
    offers.map(offer => offer.url),
    ['/terms-b'],
  );
});

test('a type is not read past its second document', async () => {
  const { read, asked } = reader({});
  await chooseOfferedDocuments([ranked('/a', 'terms'), ranked('/b', 'terms'), ranked('/c', 'terms')], read);
  assert.deepEqual(asked, ['/a', '/b']);
});

/** A3 changed this: an untyped link is read, as a possible hub — but never offered as a document. */
test('an untyped link is read but never offered', async () => {
  const { read, asked } = reader({ '/legal': 'captured' });
  const { offers } = await chooseOfferedDocuments([ranked('/legal', null)], read);
  assert.deepEqual(asked, ['/legal']);
  assert.deepEqual(offers, []);
});

test('privacy and terms are read before any other type when the budget runs short', async () => {
  const types = ['cookie', 'eula', 'acceptable_use', 'data_processing', 'copyright', 'esign_consent', 'program_terms'];
  const documents = [
    ...types.flatMap(type => [
      ranked(`/${type}-1`, type as RankedPolicyCandidate['docType']),
      ranked(`/${type}-2`, type as RankedPolicyCandidate['docType']),
    ]),
    ranked('/privacy', 'privacy'),
    ranked('/terms', 'terms'),
  ];
  const { read, asked } = reader({});
  await chooseOfferedDocuments(documents, read);
  assert.ok(asked.includes('/privacy') && asked.includes('/terms'), `read ${asked.join(', ')}`);
});

test('only the first document of a type is offered, even when a later one would read', async () => {
  const { read, asked } = reader({ '/terms-a': 'captured', '/terms-b': 'captured' });
  const { offers } = await chooseOfferedDocuments([ranked('/terms-a', 'terms'), ranked('/terms-b', 'terms')], read);
  assert.deepEqual(asked, ['/terms-a']);
  assert.deepEqual(
    offers.map(offer => offer.url),
    ['/terms-a'],
  );
});

test('automatic reads stop at their budget however many types a page links', async () => {
  const types = [
    'privacy',
    'terms',
    'cookie',
    'eula',
    'acceptable_use',
    'data_processing',
    'copyright',
    'esign_consent',
  ];
  const documents = types.flatMap(type => [
    ranked(`/${type}-1`, type as RankedPolicyCandidate['docType']),
    ranked(`/${type}-2`, type as RankedPolicyCandidate['docType']),
  ]);
  const { read, asked } = reader({});
  await chooseOfferedDocuments(documents, read);
  assert.ok(asked.length <= 10, `read ${asked.length} documents`);
});

test('every read is returned, so the reader can show it without asking again', async () => {
  const { read } = reader({ '/privacy': 'captured' });
  const { reads } = await chooseOfferedDocuments([ranked('/privacy', 'privacy'), ranked('/terms', 'terms')], read);
  assert.deepEqual(Object.keys(reads).sort(), ['/privacy', '/terms']);
});
