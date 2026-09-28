import { rankPolicyCandidates } from './discover.js';
import { judgePolicyPage } from './likeness.js';
import { computePolicyHash } from './normalize.js';
import type { PolicyCandidate, RankedPolicyCandidate } from './discover.js';
import type { PolicyPageJudgement } from './likeness.js';
import type { PolicyDocType, PolicyReadMode } from './types.js';

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
 * RAW IF IT IS A DOCUMENT, ELSE RENDERED (A5, AD-1 amended). Some sites send no policy text at
 * all and build it with JavaScript — Notion, Termly, Practo, Myntra, Swiggy. Their raw HTML is a
 * shell, so the rule has a second step: a document whose raw HTML is not a document is read again
 * as the page stands once it has run (`readRenderedPageInPage`), through the same normalizer. The
 * panel and the corpus capture both apply `readPolicyPage`, so they take the same step on the same
 * page and hash the same text. Opening a page costs a tab, so the panel does it only for the page
 * the reader is already on, or on their click; which is why `render` is optional.
 *
 * Everything here is pure apart from `fetchPolicyPage` and `readRenderedPageInPage`, and every
 * caller can pass its own fetch and its own way of opening a page: the side panel uses the real
 * ones, the bench runs the real ones inside a real extension, and the tests use neither.
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

/** A page as it stands once JavaScript has built it: its DOM, serialised, and where it ended up. */
type RenderedPolicyPage = { html: string; url: string };

/**
 * Read a document by opening it (A5): the tab the reader is on, or one the panel opens in the
 * background on their click. Null when the page could not be opened or read.
 */
type PolicyPageRender = (url: string) => Promise<RenderedPolicyPage | null>;

type UnreadableReason = 'fetch-failed' | 'not-html' | 'too-short';

/**
 * `readMode` on every result: on a captured document, whether its text is the HTML the server sent
 * or the page as JavaScript built it (`PolicyReadModeSchema`); on a hub or an unreadable page,
 * whether opening it was already tried, which makes the result final.
 */
type PolicyDocumentCapture =
  | {
      status: 'captured';
      hash: string;
      text: string;
      sourceUrl: string;
      usedMainContainer: boolean;
      readMode: PolicyReadMode;
    }
  /**
   * A page that lists policy documents rather than being one (A3): a legal hub, a landing page, a
   * stub that links on. Never analysed; its links are where the documents are.
   */
  | { status: 'hub'; sourceUrl: string; links: PolicyCandidate[]; readMode: PolicyReadMode }
  /**
   * Read, but not a policy we can use: an error status or a network failure (`fetch-failed`), a
   * PDF or other non-page (`not-html`), or a page with neither a document's prose nor a link to one
   * — usually one that only exists after JavaScript runs (`too-short`). Nothing is wrong, so it is
   * not an error; while it was read `raw`, opening the page may still read it.
   */
  | { status: 'unreadable'; reason: UnreadableReason; readMode: PolicyReadMode };

/** Which page `readPolicyPage` settled on, as HTML, before it is normalized and hashed. */
type PolicyPageRead =
  | { status: 'document'; html: string; finalUrl: string; readMode: PolicyReadMode }
  | { status: 'hub'; finalUrl: string; links: PolicyCandidate[]; readMode: PolicyReadMode }
  | { status: 'unreadable'; reason: UnreadableReason; readMode: PolicyReadMode };

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
 * INJECTED — the rendered read (A5). Runs in a page that is already open (the reader's own tab,
 * or one the panel opened in the background) and returns its DOM once the page has stopped
 * building itself, for the same normalizer the raw read goes through.
 *
 * Self-contained like the collector: `executeScript` stringifies it, so every number it uses is
 * written inside it, and it takes no arguments — nobody who reads a page can wait for it
 * differently from anybody else. It also declares NO inner functions: tooling stringifies it under
 * `tsx`, whose esbuild wraps every named inner function in a `__name(…)` call that no web page
 * defines, and the read would die with a ReferenceError in the page (a test guards this).
 *
 * SETTLED means the load event has fired and the body's text has not changed for `QUIET_MS`,
 * bounded by `MAX_WAIT_MS`, after which the page is read as it stands. A page that has gone quiet
 * while still showing less text than any policy page carries (`THIN_CHARS`) is given until
 * `THIN_WAIT_MS` to fill in: measured on cold loads (S3), Adobe's offer terms sat loaded and still
 * for 1.5s at 70-93 characters before building their text, and read as a shell. Time is measured,
 * not polls counted: Chrome throttles timers in a background tab to about one a second, which
 * would stretch a count.
 *
 * `outerHTML`, not `innerText`: the normalizer reads markup, and text that is present but not on
 * screen — a collapsed section — is part of the document whether or not it is showing. So what is
 * read does not depend on the window, the scroll position or whether the tab is in front.
 */
const readRenderedPageInPage = async (): Promise<RenderedPolicyPage> => {
  const MAX_WAIT_MS = 12_000;
  const THIN_WAIT_MS = 8_000;
  const QUIET_MS = 1_500;
  const THIN_CHARS = 2_000;
  const POLL_MS = 250;
  const started = Date.now();
  let length = -1;
  let quietSince = started;

  while (Date.now() - started < MAX_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    // `textContent` to notice change (cheap, no layout); `innerText` to judge thinness, because a
    // shell's inline script data is text content too and would make it look full.
    const now = document.body?.textContent?.length ?? 0;
    if (document.readyState !== 'complete' || now !== length) {
      length = now;
      quietSince = Date.now();
    } else if (
      Date.now() - quietSince >= QUIET_MS &&
      (Date.now() - started >= THIN_WAIT_MS || (document.body?.innerText?.length ?? 0) >= THIN_CHARS)
    ) {
      break;
    }
  }

  return { html: document.documentElement.outerHTML, url: location.href };
};

/**
 * Whether two addresses are the same page: same origin, path and query, whatever the fragment or a
 * trailing slash. How the panel decides that the page the reader is on IS a document it was about
 * to read, so the document can be read from their tab instead of fetched (A5).
 */
const isSamePage = (left: string, right: string | null | undefined): boolean => {
  if (!right) return false;
  try {
    const [a, b] = [new URL(left), new URL(right)];
    return (
      a.origin === b.origin &&
      a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '') &&
      a.search === b.search
    );
  } catch {
    return false;
  }
};

/** What one fetched response is, judged by A3's measure — before anything is opened. */
const judgeFetched = (fetched: FetchedPolicyPage): PolicyPageRead => {
  if (!fetched.ok) return { status: 'unreadable', reason: 'fetch-failed', readMode: 'raw' };
  if (!fetched.html) {
    // A page that answered with nothing — a bot challenge's empty 202, say — is a shell, not a PDF.
    const isPage = !fetched.contentType || /html|xml|text\/plain/i.test(fetched.contentType);
    return { status: 'unreadable', reason: isPage ? 'too-short' : 'not-html', readMode: 'raw' };
  }
  // A3: "a policy" used to mean 400 normalized characters, which every legal hub passed.
  return fromJudgement(judgePolicyPage(fetched.html), fetched.html, fetched.finalUrl, 'raw');
};

const fromJudgement = (
  judgement: PolicyPageJudgement,
  html: string,
  finalUrl: string,
  readMode: PolicyReadMode,
): PolicyPageRead => {
  if (judgement.kind === 'document') return { status: 'document', html, finalUrl, readMode };
  if (judgement.kind === 'hub') return { status: 'hub', finalUrl, links: judgement.links, readMode };
  return { status: 'unreadable', reason: 'too-short', readMode };
};

/**
 * THE RULE, applied identically by the panel and the corpus capture: the raw HTML if it is a
 * document, else the page as JavaScript builds it (A5, AD-1 amended).
 *
 * Opening the page is tried for anything that is not a document on its raw read — a shell, a bot
 * wall's empty answer, a refused request, and a hub, because a page whose script has not run can
 * look like one: Practo's privacy policy arrives as 282 characters of site menu carrying one
 * policy link. Hubs cannot be told from such shells on their raw HTML (7 of the 13 measured hubs
 * have no prose at all either), so the page is opened and judged as it really is. A PDF is never
 * opened: a tab showing one has no page to read. Without `render` this is the raw read alone.
 */
const readPolicyPage = async (
  url: string,
  fetchPage: PolicyPageFetch = fetchPolicyPage,
  render?: PolicyPageRender,
): Promise<PolicyPageRead> => {
  const raw = judgeFetched(await fetchPage(url));
  if (raw.status === 'document' || !render) return raw;
  if (raw.status === 'unreadable' && raw.reason === 'not-html') return raw;

  const rendered = await render(url);
  // Could not be opened: the raw result stands, and still says opening it has not been tried.
  if (!rendered?.html) return raw;

  const read = fromJudgement(judgePolicyPage(rendered.html), rendered.html, rendered.url, 'rendered');
  // Opened, and it built nothing more: a raw hub keeps its links, now known to be all there is.
  if (read.status === 'unreadable' && raw.status === 'hub') return { ...raw, readMode: 'rendered' };
  return read;
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
  render?: PolicyPageRender,
): Promise<PolicyDocumentCapture> => {
  const read = await readPolicyPage(url, fetchPage, render);
  if (read.status === 'hub') {
    return { status: 'hub', sourceUrl: read.finalUrl, links: read.links, readMode: read.readMode };
  }
  if (read.status === 'unreadable') return read;

  const { hash, normalized } = await computePolicyHash(read.html);

  return {
    status: 'captured',
    hash,
    text: normalized.text,
    sourceUrl: read.finalUrl,
    usedMainContainer: normalized.usedMainContainer,
    readMode: read.readMode,
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

export {
  fetchPolicyPage,
  readRenderedPageInPage,
  isSamePage,
  readPolicyPage,
  readPolicyDocument,
  chooseOfferedDocuments,
};
export type {
  FetchedPolicyPage,
  PolicyPageFetch,
  RenderedPolicyPage,
  PolicyPageRender,
  PolicyPageRead,
  PolicyDocumentCapture,
};
