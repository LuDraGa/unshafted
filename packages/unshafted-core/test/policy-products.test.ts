import {
  catalogueCompanyForDomain,
  gradedProducts,
  PRODUCT_CATALOGUE,
  productScoping,
  resolveProduct,
  scopeToCatalogue,
  SitePolicyAnalysisSchema,
} from '../index.mts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { SitePolicyAnalysis } from '../index.mts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUNDLE_FILE = `${REPO_ROOT}chrome-extension/public/policy-corpus.json`;

const company = (id: string) => {
  const found = PRODUCT_CATALOGUE.find(entry => entry.id === id);
  assert.ok(found, `${id} is not in the catalogue`);
  return found;
};

const resolved = (url: string) => {
  const hit = resolveProduct(url);
  return hit ? `${hit.company.id}/${hit.product?.id ?? '-'}` : null;
};

// --- the catalogue itself ------------------------------------------------------------------------

test('the catalogue holds the four companies the corpus measured as publishing across products', () => {
  // Measured in S4 from corpus/analysis: no other covered company names a second product in more
  // than a handful of findings, and Snapchat's are features inside one app.
  assert.deepEqual(
    PRODUCT_CATALOGUE.map(entry => entry.id),
    ['google', 'microsoft', 'meta', 'amazon'],
  );
});

test('product ids are unique across the whole catalogue, so an id alone names one product', () => {
  const ids = PRODUCT_CATALOGUE.flatMap(entry => entry.products.map(product => product.id));
  assert.deepEqual(
    ids.filter((id, i) => ids.indexOf(id) !== i),
    [],
  );
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${id} is not a kebab-case id`);
});

test('every matcher sits inside its own company and is written the way the resolver compares it', () => {
  for (const entry of PRODUCT_CATALOGUE) {
    assert.ok(gradedProducts(entry).length > 0, `${entry.id} has no product a page can resolve to`);
    for (const product of entry.products) {
      for (const matcher of product.matchers) {
        assert.equal(matcher.host, matcher.host.toLowerCase(), `${product.id}: ${matcher.host} is not lower case`);
        assert.ok(!matcher.host.startsWith('www.'), `${product.id}: ${matcher.host} carries www., which is stripped`);
        assert.ok(
          entry.domains.some(domain => matcher.host === domain || matcher.host.endsWith(`.${domain}`)),
          `${product.id}: ${matcher.host} is outside ${entry.id}'s domains`,
        );
        if (matcher.path !== undefined) assert.ok(matcher.path.startsWith('/'), `${product.id}: path must be absolute`);
      }
    }
  }
});

test('no two matchers are the same address, and no two companies claim the same domain', () => {
  const addresses = PRODUCT_CATALOGUE.flatMap(entry =>
    entry.products.flatMap(product =>
      product.matchers.map(matcher => `${matcher.host}${matcher.path ?? ''}${matcher.exact ? ' (exact)' : ''}`),
    ),
  );
  assert.deepEqual(
    addresses.filter((address, i) => addresses.indexOf(address) !== i),
    [],
  );

  const domains = PRODUCT_CATALOGUE.flatMap(entry => entry.domains);
  assert.deepEqual(
    domains.filter((domain, i) => domains.indexOf(domain) !== i),
    [],
  );
});

// --- the resolver: a tab URL to { company, product | null } -------------------------------------

test('a tab on a product page resolves to that product', () => {
  const cases: [string, string][] = [
    ['https://www.google.com/', 'google/google-search'],
    ['https://www.google.com/search?q=privacy', 'google/google-search'],
    ['https://google.com/search', 'google/google-search'],
    ['https://www.google.com/maps/place/Mumbai', 'google/google-maps'],
    ['https://maps.google.com/', 'google/google-maps'],
    ['https://mail.google.com/mail/u/0/#inbox', 'google/gmail'],
    ['https://drive.google.com/drive/my-drive', 'google/google-drive'],
    ['https://docs.google.com/document/d/abc/edit', 'google/google-docs'],
    ['https://www.youtube.com/watch?v=abc', 'google/youtube'],
    ['https://m.youtube.com/', 'google/youtube'],
    ['https://music.youtube.com/', 'google/youtube'],
    ['https://gemini.google.com/app', 'google/gemini'],
    ['https://www.bing.com/search?q=privacy', 'microsoft/bing'],
    ['https://copilot.microsoft.com/', 'microsoft/copilot'],
    ['https://outlook.live.com/mail/0/', 'microsoft/outlook'],
    ['https://www.xbox.com/en-IN/games', 'microsoft/xbox'],
    ['https://www.msn.com/en-in', 'microsoft/msn'],
    ['https://www.facebook.com/', 'meta/facebook'],
    ['https://m.facebook.com/profile.php?id=1', 'meta/facebook'],
    ['https://www.instagram.com/p/abc/', 'meta/instagram'],
    ['https://www.meta.ai/', 'meta/meta-ai'],
    ['https://www.amazon.com/dp/B000000000', 'amazon/amazon-shopping'],
    ['https://www.amazon.com/gp/video/detail/abc', 'amazon/prime-video'],
    ['https://www.primevideo.com/', 'amazon/prime-video'],
    ['https://music.amazon.com/', 'amazon/amazon-music'],
    ['https://read.amazon.com/', 'amazon/kindle'],
  ];
  for (const [url, expected] of cases) assert.equal(resolved(url), expected, url);
});

test("a covered company's own pages resolve to the company and no product", () => {
  const cases = [
    'https://www.google.com/intl/en/about/',
    // The root of another subdomain is not the Search homepage.
    'https://accounts.google.com/',
    'https://myaccount.google.com/',
    'https://policies.google.com/privacy',
    'https://www.microsoft.com/en-us/privacy/privacystatement',
    'https://login.live.com/',
    'https://privacycenter.instagram.com/policy',
  ];
  for (const url of cases) assert.match(resolved(url) ?? 'null', /^[a-z]+\/-$/, url);
});

test('a path matches at a segment boundary, never as a bare prefix', () => {
  assert.equal(resolved('https://www.google.com/searchx'), 'google/-');
  assert.equal(resolved('https://www.google.com/mapsfoo/bar'), 'google/-');
  assert.equal(resolved('https://www.amazon.com/gp/videos'), 'amazon/amazon-shopping');
  assert.equal(resolved('https://www.google.com/maps'), 'google/google-maps');
  assert.equal(resolved('https://www.google.com/maps/'), 'google/google-maps');
});

test('lookalike hosts, sister companies with their own policies and non-web URLs resolve to nothing', () => {
  const cases = [
    'https://notgoogle.com/search',
    'https://google.com.evil.example/search',
    'https://mail.google.com.evil.example/',
    'https://youtube.com.evil.example/',
    'https://evilyoutube.com/',
    // A country Google is not in the catalogue: nothing covers it today (see the S4 log).
    'https://www.google.co.in/search?q=x',
    // Owned by a catalogue company, but governed by their own documents, not the company's.
    'https://www.linkedin.com/feed/',
    'https://github.com/',
    'https://www.whatsapp.com/',
    'https://www.twitch.tv/',
    'https://www.audible.com/',
    'https://www.amazon.in/',
    // Named too rarely by the documents to be in the catalogue (the S4 measurement).
    'https://www.threads.com/',
    'https://www.messenger.com/',
    'chrome://newtab/',
    'about:blank',
    'file:///Users/someone/privacy.html',
    'not a url',
    '',
  ];
  for (const url of cases) assert.equal(resolved(url), null, url);
});

test("a document's domain names its company, whichever of the company's sites it sits on", () => {
  assert.equal(catalogueCompanyForDomain('google.com')?.id, 'google');
  assert.equal(catalogueCompanyForDomain('www.google.com')?.id, 'google');
  assert.equal(catalogueCompanyForDomain('youtube.com')?.id, 'google');
  assert.equal(catalogueCompanyForDomain('microsoft.com')?.id, 'microsoft');
  assert.equal(catalogueCompanyForDomain('facebook.com')?.id, 'meta');
  assert.equal(catalogueCompanyForDomain('instagram.com')?.id, 'meta');
  assert.equal(catalogueCompanyForDomain('amazon.com')?.id, 'amazon');
  assert.equal(catalogueCompanyForDomain('linkedin.com'), null);
  assert.equal(catalogueCompanyForDomain('notgoogle.com'), null);
  assert.equal(catalogueCompanyForDomain('example.com'), null);
});

/**
 * The committed bundle is always present, so this needs no gitignored corpus. It pins which
 * published documents the catalogue turns into multi-product ones — the S5 re-analysis list — and
 * fails if a catalogue edit quietly claims another site (a Microsoft domain list that grew
 * `linkedin.com` would put LinkedIn's own policies under Microsoft's products).
 */
test('the multi-product documents in the bundle are exactly the nine the catalogue was built for', () => {
  const bundle = JSON.parse(readFileSync(BUNDLE_FILE, 'utf8')) as { analyses: SitePolicyAnalysis[] };
  const multiProduct = bundle.analyses
    .filter(analysis => catalogueCompanyForDomain(analysis.domain))
    .map(analysis => `${analysis.contentHash.slice(0, 8)} ${analysis.domain} ${analysis.docType}`)
    .sort();

  assert.deepEqual(multiProduct, [
    '2d74ae32 amazon.com terms',
    '3fe6bc5d facebook.com privacy',
    '47c4b597 facebook.com cookie',
    '993ed512 amazon.com privacy',
    'ab642cdd instagram.com privacy',
    'afedc4d1 microsoft.com privacy',
    'b7688f54 google.com privacy',
    'c60d3001 google.com terms',
    'f44a02e5 amazon.com cookie',
  ]);
});

// --- product scoping on an analysis (what validate-analysis.ts enforces) -------------------------

const base = (over: Partial<SitePolicyAnalysis> = {}): SitePolicyAnalysis =>
  SitePolicyAnalysisSchema.parse({
    schemaVersion: 1,
    contentHash: 'a'.repeat(64),
    domain: 'google.com',
    domains: ['google.com'],
    docType: 'privacy',
    verticals: ['identity_provider'],
    sourceUrl: 'https://policies.google.com/privacy',
    promptVersion: 'test',
    normalizerVersion: 'test',
    model: 'test',
    analyzedAt: '2026-09-29T00:00:00.000Z',
    summary: 'A test document.',
    riskLevel: 'High',
    confidence: 'high',
    exposures: [
      {
        title: 'Health data from a watch',
        severity: 'high',
        category: 'Data/Privacy',
        whatItMeans: 'Sleep and heart rate are collected.',
        whyItMatters: 'Health data is sensitive.',
      },
    ],
    availableActions: [{ action: 'Run Privacy Checkup', howTo: 'Open it.', effort: 'low' }],
    ...over,
  });

const everyGoogleScope = () =>
  gradedProducts(company('google')).map(product => ({
    product: product.id,
    riskLevel: 'High' as const,
    summary: `What ${product.name} users face.`,
  }));

const tagged = (products: string[]) =>
  base().exposures.map(exposure => ({ ...exposure, products })) as SitePolicyAnalysis['exposures'];

test('an analysis written before products parses as company-wide with nothing graded', () => {
  const analysis = base();
  assert.deepEqual(analysis.exposures[0]?.products, []);
  assert.deepEqual(analysis.availableActions[0]?.products, []);
  assert.deepEqual(analysis.productScopes, []);
});

test('a product scope carries a product, a grade and a summary', () => {
  assert.throws(() => base({ productScopes: [{ product: 'youtube', riskLevel: 'High' } as never] }));
  assert.throws(() => base({ productScopes: [{ product: 'youtube', riskLevel: 'Severe', summary: 'x' } as never] }));
});

test('a document outside the catalogue is not scoped, and may not name products', () => {
  const outside = { domain: 'example.com', domains: ['example.com'], sourceUrl: 'https://example.com/privacy' };
  assert.equal(productScoping(base(outside)).status, 'not_applicable');

  const named = productScoping(base({ ...outside, exposures: tagged(['youtube']) }));
  assert.equal(named.status, 'invalid');

  const graded = productScoping(base({ ...outside, productScopes: everyGoogleScope() }));
  assert.equal(graded.status, 'invalid');
});

test('a catalogue document with no products at all is waiting for re-analysis, not invalid', () => {
  assert.equal(productScoping(base()).status, 'missing');
});

test('a catalogue document is complete when every page product is graded and every tag is its own', () => {
  const scoping = productScoping(base({ exposures: tagged(['fitbit', 'pixel']), productScopes: everyGoogleScope() }));
  assert.deepEqual(scoping, { status: 'complete', problems: [] });

  // Empty tags everywhere is a real answer too: everything is company-wide.
  assert.equal(productScoping(base({ productScopes: everyGoogleScope() })).status, 'complete');
});

test('ids outside the document company, or outside the catalogue, are rejected by name', () => {
  for (const id of ['xbox', 'youtube-shorts', 'YouTube']) {
    const scoping = productScoping(base({ exposures: tagged([id]), productScopes: everyGoogleScope() }));
    assert.equal(scoping.status, 'invalid', id);
    assert.ok(
      scoping.problems.some(problem => problem.includes(`"${id}"`)),
      `${id}: ${scoping.problems.join('; ')}`,
    );
  }

  const action = productScoping(
    base({
      availableActions: [{ action: 'Turn it off', howTo: 'Settings.', effort: 'low', products: ['bing'] }],
      productScopes: everyGoogleScope(),
    }),
  );
  assert.equal(action.status, 'invalid');
});

test('grades must cover exactly the page products, once each', () => {
  const scopes = everyGoogleScope();

  const missingOne = productScoping(base({ productScopes: scopes.slice(1) }));
  assert.equal(missingOne.status, 'invalid');
  assert.ok(missingOne.problems.some(problem => problem.includes(`"${scopes[0]!.product}"`)));

  const duplicated = productScoping(base({ productScopes: [...scopes, scopes[0]!] }));
  assert.equal(duplicated.status, 'invalid');

  // A named-only product never leads a page, so a grade for it is work nobody will see.
  const namedOnly = productScoping(
    base({ productScopes: [...scopes, { product: 'android', riskLevel: 'High', summary: 'x' }] }),
  );
  assert.equal(namedOnly.status, 'invalid');

  const tagsWithoutGrades = productScoping(base({ exposures: tagged(['youtube']) }));
  assert.equal(tagsWithoutGrades.status, 'invalid');
});

test('a finding names each product once', () => {
  const scoping = productScoping(
    base({ exposures: tagged(['youtube', 'youtube']), productScopes: everyGoogleScope() }),
  );
  assert.equal(scoping.status, 'invalid');
});

// --- local runs: the code guarantees what the prompt asks ---------------------------------------

test('a local run keeps only its own company ids, and grades only page products', () => {
  const google = company('google');
  const result = scopeToCatalogue(
    {
      exposures: tagged(['youtube', 'xbox', 'youtube', 'made-up']),
      availableActions: [{ action: 'a', howTo: 'b', effort: 'low', products: ['gmail', 'bing'] }],
      productScopes: [
        { product: 'youtube', riskLevel: 'High', summary: 'x' },
        { product: 'android', riskLevel: 'High', summary: 'x' },
        { product: 'youtube', riskLevel: 'Low', summary: 'second' },
        { product: 'bing', riskLevel: 'Low', summary: 'x' },
      ],
    },
    google,
  );

  assert.deepEqual(result.exposures[0]?.products, ['youtube']);
  assert.deepEqual(result.availableActions[0]?.products, ['gmail']);
  assert.deepEqual(result.productScopes, [{ product: 'youtube', riskLevel: 'High', summary: 'x' }]);
});

test('a local run outside the catalogue keeps no products at all', () => {
  const result = scopeToCatalogue(
    {
      exposures: tagged(['youtube']),
      availableActions: [{ action: 'a', howTo: 'b', effort: 'low', products: ['gmail'] }],
      productScopes: [{ product: 'youtube', riskLevel: 'High', summary: 'x' }],
    },
    null,
  );

  assert.deepEqual(result.exposures[0]?.products, []);
  assert.deepEqual(result.availableActions[0]?.products, []);
  assert.deepEqual(result.productScopes, []);
});
