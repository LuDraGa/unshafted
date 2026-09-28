import { rankPolicyCandidates } from './discover.js';
import { judgePolicyPage } from './likeness.js';
import { computePolicyHash } from './normalize.js';
import type { PolicyCandidate, RankedPolicyCandidate } from './discover.js';
import type { PolicyDocType } from './types.js';

/**
 * Reading a policy document, and deciding what a site we do not cover is offered.
 *
 * ONE WAY TO READ A DOCUMENT (D5). The extension reads every document itself, from an extension
 * page, with cookies omitted. The page the reader is on is read for its links and nothing else
 * (`collectPolicyCandidatesInPage`). Until S2 documents were fetched from inside the page (AD-4,
 * now retired), which made "same origin" the line between readable and not. Measured from a real
 * extension page on 2026-09-28: 76 of 83 packaged documents and 54 of the bench's 74 hand-picked
 * ones read this way, whatever host they sit on. What still fails is content — pages that exist
 * only after JavaScript runs, bot walls, PDFs — never the origin.
 *
 * Everything here is pure apart from `fetchPolicyPage`, and every caller can pass its own fetch:
 * the side panel uses the real one, the bench runs the real one inside a real extension page, and
 * the tests use neither.
 */

/** What reading a document URL returned, before anything is judged. */
type FetchedPolicyPage = {
  ok: boolean;
  status: number;
  /** Where the document finally came from, after redirects. */
  finalUrl: string;
  contentType: string;
  /** Empty when the response is not a web page (a PDF), which is never downloaded. */
  html: string;
  error?: string;
};

type PolicyPageFetch = (url: string) => Promise<FetchedPolicyPage>;

type PolicyDocumentCapture =
  | { status: 'captured'; hash: string; text: string; sourceUrl: string; usedMainContainer: boolean }
  /**
   * A page that lists policy documents rather than being one (A3): a legal hub, a landing page, a
   * stub that links on. Never analysed; its links are where the documents are.
   */
  | { status: 'hub'; sourceUrl: string; links: PolicyCandidate[] }
  /**
   * Read, but not a policy we can use: an error status or a network failure (`fetch-failed`), a
   * PDF or other non-page (`not-html`), or a page with neither a document's prose nor a link to one
   * — usually one that only exists after JavaScript runs (`too-short`). Nothing is wrong and there
   * is nothing for the reader to do about it, so it is not an error.
   */
  | { status: 'unreadable'; reason: 'fetch-failed' | 'not-html' | 'too-short' };

/**
 * Read one document URL. Self-contained, like the injected collector — no module constants, no
 * helpers — because tooling evaluates its SOURCE inside a real extension page, so the bench
 * measures this exact request rather than a copy of it.
 *
 * From an extension page with host access, the host needs no CORS headers, which is what makes a
 * document on another host readable at all. `credentials: 'omit'` means the request carries none
 * of the reader's cookies, so it never reads a document as their signed-in session would see it.
 * A body that is not a web page is never downloaded.
 */
const fetchPolicyPage = async (url: string): Promise<FetchedPolicyPage> => {
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const isPage = contentType === '' || /html|xml|text\/plain/i.test(contentType);
    const html = isPage ? (await response.text()).slice(0, 4_000_000) : '';
    return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType, html };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: '',
      html: '',
      error: error instanceof Error ? error.message : 'Fetch failed.',
    };
  }
};

/**
 * Read one document and reduce it to the normalized text and its hash.
 *
 * The text returned is the NORMALIZED text — the exact string the hash is taken over. That is
 * load-bearing for D9: what the reader sees on screen is what the analysis graded.
 */
const readPolicyDocument = async (
  url: string,
  fetchPage: PolicyPageFetch = fetchPolicyPage,
): Promise<PolicyDocumentCapture> => {
  const fetched = await fetchPage(url);
  if (!fetched.ok) return { status: 'unreadable', reason: 'fetch-failed' };
  if (!fetched.html) {
    // A page that answered with nothing — a bot challenge's empty 202, say — is a shell, not a PDF.
    const isPage = !fetched.contentType || /html|xml|text\/plain/i.test(fetched.contentType);
    return { status: 'unreadable', reason: isPage ? 'too-short' : 'not-html' };
  }

  // A3: "a policy" used to mean 400 normalized characters, which every legal hub passed.
  const judgement = judgePolicyPage(fetched.html);
  if (judgement.kind === 'hub') return { status: 'hub', sourceUrl: fetched.finalUrl, links: judgement.links };
  if (judgement.kind === 'shell') return { status: 'unreadable', reason: 'too-short' };

  const { hash, normalized } = await computePolicyHash(fetched.html);

  return {
    status: 'captured',
    hash,
    text: normalized.text,
    sourceUrl: fetched.finalUrl,
    usedMainContainer: normalized.usedMainContainer,
  };
};

/** A type whose first document cannot be read gets one more try. A hub is not a try: it is a way on. */
const MAX_TRIES_PER_TYPE = 2;
/** Bounded so a page linking a dozen kinds of document cannot turn opening the panel into a crawl. */
const MAX_AUTOMATIC_READS = 10;
/** Untyped links ("Legal", "Policies") followed per page, in case they are the hub everything is on. */
const MAX_UNTYPED_FOLLOWS = 2;
/** Read first, because they are the two a reader is agreeing to on nearly every site. */
const FIRST_TYPES: readonly PolicyDocType[] = ['privacy', 'terms'];

/** A document discovery listed (hop 0), or one a hub it listed links to (hop 1). */
type Candidate = { document: RankedPolicyCandidate; hop: 0 | 1 };

/**
 * D8: on a site we do not cover, what the panel offers to analyse is what it has READ.
 *
 * When the panel opens there, the top document of each type is read — privacy and terms first,
 * then whatever else the page links — and a type is offered only if reading produced a policy. A
 * type whose top document cannot be read tries the next one of that type once.
 *
 * A3: a HUB is followed, never offered. Its policy links join the candidates right where the hub
 * stood, so its privacy policy is tried before the page's next privacy link — and a type the page
 * never linked at all (Figma's terms sit only on its hub) can be offered from it. One hop: a hub a
 * hub links to is not followed. Untyped links ("Legal") are read too, but only as possible hubs; one
 * that turns out to be a document is not offered, because `docType` is a claim the analysis stores
 * about what it read and "Legal" names none.
 *
 * Offers come back in candidate order. Every read comes back too, so the reader can open a
 * document the panel already read without asking for it again.
 */
const chooseOfferedDocuments = async (
  documents: readonly RankedPolicyCandidate[],
  read: (url: string) => Promise<PolicyDocumentCapture>,
): Promise<{ offers: RankedPolicyCandidate[]; reads: Record<string, PolicyDocumentCapture> }> => {
  const pool: Candidate[] = documents.map(document => ({ document, hop: 0 }));
  const known = new Set(documents.map(document => document.url));
  const reads: Record<string, PolicyDocumentCapture> = {};
  const offered = new Map<PolicyDocType, string>();
  const tries = new Map<PolicyDocType, number>();
  let untypedFollowed = 0;
  let budget = MAX_AUTOMATIC_READS;

  /** Types in the order they are read: privacy and terms first, then as the candidates list them. */
  const typeOrder = (): PolicyDocType[] => {
    const listed: PolicyDocType[] = [];
    for (const { document } of pool) {
      if (document.docType && !listed.includes(document.docType)) listed.push(document.docType);
    }
    return [
      ...FIRST_TYPES.filter(type => listed.includes(type)),
      ...listed.filter(type => !FIRST_TYPES.includes(type)),
    ];
  };

  const nextRound = (): Candidate[] => {
    const round: Candidate[] = [];
    for (const docType of typeOrder()) {
      if (offered.has(docType) || (tries.get(docType) ?? 0) >= MAX_TRIES_PER_TYPE) continue;
      const next = pool.find(candidate => candidate.document.docType === docType && !(candidate.document.url in reads));
      if (next) round.push(next);
    }
    for (const candidate of pool) {
      if (untypedFollowed >= MAX_UNTYPED_FOLLOWS) break;
      if (candidate.hop !== 0 || candidate.document.docType || candidate.document.url in reads) continue;
      round.push(candidate);
      untypedFollowed += 1;
    }
    return round.slice(0, budget);
  };

  /** A hub's policy links, as candidates, placed right after the hub that listed them. */
  const follow = (hub: Candidate, capture: Extract<PolicyDocumentCapture, { status: 'hub' }>) => {
    const linked = rankPolicyCandidates(capture.links, { pageUrl: capture.sourceUrl })
      .filter(document => !known.has(document.url))
      .map((document): Candidate => ({ document, hop: 1 }));
    for (const candidate of linked) known.add(candidate.document.url);
    pool.splice(pool.indexOf(hub) + 1, 0, ...linked);
  };

  for (let round = nextRound(); round.length > 0 && budget > 0; round = nextRound()) {
    budget -= round.length;
    const results = await Promise.all(
      round.map(async candidate => ({ candidate, capture: await read(candidate.document.url) })),
    );

    for (const { candidate, capture } of results) {
      reads[candidate.document.url] = capture;
      if (capture.status === 'hub') {
        if (candidate.hop === 0) follow(candidate, capture);
        continue;
      }
      const { docType } = candidate.document;
      if (!docType) continue;
      tries.set(docType, (tries.get(docType) ?? 0) + 1);
      if (capture.status === 'captured' && !offered.has(docType)) offered.set(docType, candidate.document.url);
    }
  }

  const offeredUrls = new Set(offered.values());
  return {
    offers: pool.filter(({ document }) => offeredUrls.has(document.url)).map(({ document }) => document),
    reads,
  };
};

export { fetchPolicyPage, readPolicyDocument, chooseOfferedDocuments };
export type { FetchedPolicyPage, PolicyPageFetch, PolicyDocumentCapture };
