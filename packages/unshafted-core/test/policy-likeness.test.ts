/**
 * A3 — a hub is not a document (F3), and a hub is followed rather than dropped (F4).
 *
 * The fixtures are real pages the bench and the corpus saw on 2026-09-28, reduced by
 * `tools/corpus/make-likeness-fixture.ts`: the region the normalizer reads, its block structure,
 * every text run at its real length and every policy link verbatim — with all other wording
 * replaced by filler, because third-party policy text stays out of the repository (corpus/README).
 * The tool refuses to write a fixture that is not judged exactly as its page was.
 *
 *   hub/       legal hubs and landing pages the panel used to offer for analysis
 *   document/  real documents, including the sparsest ones the corpus analysed
 *   shell/     a page that only exists after JavaScript runs
 */
import { chooseOfferedDocuments, readPolicyDocument } from '../index.mts';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FetchedPolicyPage, PolicyDocumentCapture, RankedPolicyCandidate } from '../index.mts';

const FIXTURES = fileURLToPath(new URL('./fixtures/likeness/', import.meta.url));

const fixtures = (group: 'hub' | 'document' | 'shell') =>
  readdirSync(`${FIXTURES}${group}`)
    .filter(file => file.endsWith('.html'))
    .map(file => ({ name: file.replace(/\.html$/, ''), html: readFileSync(`${FIXTURES}${group}/${file}`, 'utf8') }));

const served =
  (html: string, finalUrl = 'https://example.com/legal'): (() => Promise<FetchedPolicyPage>) =>
  async () => ({ ok: true, status: 200, finalUrl, contentType: 'text/html', html });

test('there are fixtures of every kind', () => {
  assert.ok(fixtures('hub').length >= 10, 'hub fixtures missing');
  assert.ok(fixtures('document').length >= 4, 'document fixtures missing');
  assert.ok(fixtures('shell').length >= 1, 'shell fixtures missing');
});

test('a legal hub is never captured as a document', async () => {
  const captured: string[] = [];
  for (const { name, html } of fixtures('hub')) {
    const result = await readPolicyDocument('https://example.com/legal', served(html));
    if (result.status === 'captured') captured.push(name);
  }
  assert.deepEqual(captured, [], `hubs read as documents: ${captured.join(', ')}`);
});

test('a hub comes back with the policy links it lists', async () => {
  for (const { name, html } of fixtures('hub')) {
    const result = await readPolicyDocument('https://example.com/legal', served(html));
    assert.equal(result.status, 'hub', `${name} was ${result.status}`);
    if (result.status === 'hub') assert.ok(result.links.length > 0, `${name} lists no links`);
  }
});

/**
 * The other direction, and the one that costs a user something: a real document judged a hub is
 * dropped from the offer. The sparsest documents the corpus analysed are here on purpose.
 */
test('a real document is captured, including the sparsest the corpus analysed', async () => {
  for (const { name, html } of fixtures('document')) {
    const result = await readPolicyDocument('https://example.com/doc', served(html));
    assert.equal(result.status, 'captured', `${name} was ${result.status}`);
  }
});

test('a page with no prose and no policy links is unreadable, not a hub', async () => {
  for (const { name, html } of fixtures('shell')) {
    const result = await readPolicyDocument('https://example.com/doc', served(html));
    assert.deepEqual(
      result.status === 'unreadable' ? result.reason : result.status,
      'too-short',
      `${name} was ${result.status}`,
    );
  }
});

/** Figma's footer names one link, "Legal and privacy", and it lands on the hub. */
test('a hub’s documents are offered in its place, one hop and no further', async () => {
  const figmaHub = fixtures('hub').find(fixture => fixture.name === 'figma-legal')!.html;
  const document = fixtures('document').find(fixture => fixture.name === 'figma-tos')!.html;
  const pages: Record<string, string> = {
    'https://www.figma.com/legal/': figmaHub,
  };
  const asked: string[] = [];
  const read = async (url: string): Promise<PolicyDocumentCapture> => {
    asked.push(url);
    return readPolicyDocument(url, served(pages[url] ?? document, url));
  };

  const { offers } = await chooseOfferedDocuments(
    [{ url: 'https://www.figma.com/legal/', label: 'Legal and privacy', docType: 'privacy', ownSite: true }],
    read,
  );

  assert.equal(asked[0], 'https://www.figma.com/legal/');
  assert.ok(!offers.some(offer => offer.url === 'https://www.figma.com/legal/'), 'the hub itself was offered');
  assert.ok(offers.length > 0, 'nothing on the hub was offered');
  for (const offer of offers) assert.match(offer.url, /^https:\/\/www\.figma\.com\/legal\/.+/);
  // Its terms were never linked from the page, only from the hub.
  assert.ok(offers.some(offer => offer.docType === 'terms'));
});

test('a hub linked from a hub is not followed', async () => {
  // Page → hub A → hub B → the document. One hop reaches B and stops; two would offer the document.
  const document = fixtures('document').find(fixture => fixture.name === 'figma-tos')!.html;
  const pages: Record<string, string> = {
    'https://x.example/legal': '<main><a href="https://x.example/legal/privacy-hub">Privacy</a></main>',
    'https://x.example/legal/privacy-hub': '<main><a href="https://x.example/legal/privacy">Privacy Policy</a></main>',
    'https://x.example/legal/privacy': document,
  };
  const asked: string[] = [];
  const read = async (url: string): Promise<PolicyDocumentCapture> => {
    asked.push(url);
    return readPolicyDocument(url, served(pages[url] ?? '', url));
  };

  const { offers } = await chooseOfferedDocuments(
    [{ url: 'https://x.example/legal', label: 'Legal', docType: null, ownSite: true }],
    read,
  );

  assert.deepEqual(asked, ['https://x.example/legal', 'https://x.example/legal/privacy-hub']);
  assert.deepEqual(offers, []);
});

/** F4: the link that leads to everything is the one link the panel used to drop. */
test('an untyped "Legal" link is followed to the documents it lists', async () => {
  const hub = fixtures('hub').find(fixture => fixture.name === 'vercel-legal')!.html;
  const document = fixtures('document').find(fixture => fixture.name === 'figma-tos')!.html;
  const read = async (url: string): Promise<PolicyDocumentCapture> =>
    readPolicyDocument(url, served(url === 'https://vercel.com/legal' ? hub : document, url));

  const { offers } = await chooseOfferedDocuments(
    [{ url: 'https://vercel.com/legal', label: 'Legal', docType: null, ownSite: true }],
    read,
  );

  assert.ok(offers.some(offer => offer.docType === 'privacy'));
  assert.ok(offers.some(offer => offer.docType === 'terms'));
});

test('an untyped link that is itself a document is read but not offered', async () => {
  const document = fixtures('document').find(fixture => fixture.name === 'figma-tos')!.html;
  const read = async (url: string) => readPolicyDocument(url, served(document, url));
  const ranked: RankedPolicyCandidate[] = [
    { url: 'https://example.com/legal', label: 'Legal', docType: null, ownSite: true },
  ];

  const { offers } = await chooseOfferedDocuments(ranked, read);
  assert.deepEqual(offers, []);
});
