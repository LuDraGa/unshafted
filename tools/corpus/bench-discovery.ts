/**
 * Discovery bench — how often the SHIPPED discovery lands on the document a person would pick.
 *
 * Run:  node --import tsx tools/corpus/bench-discovery.ts --label=<name> [--ref=<git ref>]
 *         [--only=<domain>] [--concurrency=N] [--compare=<label>] [--force]
 *
 * The capture measures what the corpus holds; this measures what a reader on a site we do NOT
 * cover gets. Each site in `BENCH_SITES` names, by hand, the documents a person would pick. The
 * bench opens the homepage, runs the shipped collector and ranker over it, applies the side
 * panel's own rule for what it offers, and scores every expected document.
 *
 * WHAT THE PANEL OFFERS — by construction, not by copy. Since S2 (D8) the panel reads the top
 * document of each type when it opens on a site we do not cover, and offers only what came back as a
 * policy (`chooseOfferedDocuments` in core). The bench calls that same function, with reads made
 * inside a real Chrome extension page (`extension-fetch.ts`) by core's own `fetchPolicyPage`, so the
 * rule it scores is the rule that ships. A ref from before S2 has no such function and is scored by
 * the rule it shipped with: every same-origin, typed document among the ranked top 20, read from
 * inside the page. So for each expected document:
 *
 *  - found             the panel's first offer of that type is the expected document
 *  - found_unreadable  (pre-S2 rule only) it is, but its link redirects to another origin, which the
 *                      in-page fetch could not follow (CORS) — offered, then "could not be read"
 *  - found_lower       the expected document is offered, but not first of its type
 *  - wrong_page        documents of that type are offered, and the expected one is not among them
 *  - missed            nothing of that type is offered; `reason` says where it was lost
 *  - failed            the homepage could not be loaded, so discovery never ran — never a miss
 *
 * THREE READINGS per page, because the panel reads whatever the page holds when it asks:
 *  - early     at the `load` event: the latest moment `executeScript` injects on a page that is
 *              still loading, i.e. the panel already open while the reader navigates
 *  - settled   after the network idles (≤8s): the panel opened on a loaded page. The HEADLINE.
 *  - scrolled  after the two scroll-and-settle passes `capture.ts` uses to render lazy footers
 *
 * TWO COLLECTORS ON THE SAME LOAD. With `--ref`, the discovery module as it stands at that git
 * ref is scored alongside the working tree's, against the same DOM at the same moment. A change
 * to discovery is then measured free of site drift, which between two separate runs is larger
 * than most changes (geo redirects, consent banners, networkidle timing).
 *
 * MATCHING. A URL matches an expected one after canonicalisation (no scheme, no `www.`, no
 * fragment, no trailing slash, case-folded), and with the query ignored unless the expected URL
 * carries one. An offer matches when its link or the page the link redirects to does.
 *
 * LIMITS, known and accepted: the collector runs in the page's main world here and in the
 * content-script isolated world in the extension, so a page that patches builtins could differ;
 * the 1280px viewport is wider than a window with the panel open. Each document URL is read once
 * per site per variant and reused across the three readings, as one open panel would.
 *
 * Every reading keeps its raw candidates and every redirect resolved, so a run can be re-scored
 * offline when the scoring changes, and the run records which collector produced it.
 */
import { BENCH_SITES } from './bench-sites.js';
import { extensionLaunchOptions, openExtensionFetcher } from './extension-fetch.js';
import * as currentDiscovery from '../../packages/unshafted-core/lib/site-policy/discover.js';
import * as currentRead from '../../packages/unshafted-core/lib/site-policy/read.js';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BenchSite } from './bench-sites.js';
import type { PolicyCandidate, RankedPolicyCandidate } from '../../packages/unshafted-core/lib/site-policy/discover.js';
import type { FetchedPolicyPage, PolicyDocumentCapture } from '../../packages/unshafted-core/lib/site-policy/read.js';
import type { PolicyDocType } from '../../packages/unshafted-core/lib/site-policy/types.js';
import type { Browser, BrowserContext, Page } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BENCH_DIR = path.join(ROOT, 'corpus', 'bench');
const SITE_POLICY_DIR = 'packages/unshafted-core/lib/site-policy';

/** Same posture as the capture, for the same reason: see `REAL_USER_AGENT` in capture.ts. */
const REAL_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const VIEWPORT = { width: 1280, height: 900 };
const NAV_TIMEOUT_MS = 30_000;
const LOAD_EVENT_TIMEOUT_MS = 10_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
const REDIRECT_TIMEOUT_MS = 10_000;
/**
 * Ceiling per site. Without it one page that never settles holds a worker forever and the run
 * never ends; the first survey did exactly that. Readings finished before the ceiling are kept.
 */
const SITE_TIMEOUT_MS = 180_000;

// ── Types ──

/**
 * The slice of core the bench drives. Discovery exists at every ref; the reading half (`read.ts`)
 * exists from S2, and a ref without it is scored by the pre-S2 offer rule.
 */
type DiscoveryModule = {
  POLICY_LINK_PATTERN: RegExp;
  collectPolicyCandidatesInPage: (patternSource: string) => PolicyCandidate[];
  rankPolicyCandidates: typeof currentDiscovery.rankPolicyCandidates;
  choosePolicyUrl: typeof currentDiscovery.choosePolicyUrl;
  chooseOfferedDocuments?: typeof currentRead.chooseOfferedDocuments;
  readPolicyDocument?: typeof currentRead.readPolicyDocument;
  fetchPolicyPage?: typeof currentRead.fetchPolicyPage;
};

/** How a variant decides what the panel offers: by reading (S2 on), or by origin (before). */
type OfferRule = 'read' | 'same-origin';

type Variant = {
  name: 'current' | 'ref';
  module: DiscoveryModule;
  offerRule: OfferRule;
  /** Proves afterwards which collector a reading came from: 0 parameters before A1, 1 after. */
  collectorArity: number;
  collectorSha256: string;
  gitRef?: string;
  gitSha?: string;
};

type ReadingName = 'early' | 'settled' | 'scrolled';
const READINGS: ReadingName[] = ['early', 'settled', 'scrolled'];
const HEADLINE: ReadingName = 'settled';

type Verdict = 'found' | 'found_unreadable' | 'found_lower' | 'wrong_page' | 'missed' | 'failed';
const VERDICTS: Verdict[] = ['found', 'found_unreadable', 'found_lower', 'wrong_page', 'missed', 'failed'];

/** Where a missed document was lost, from the earliest stage it failed to reach. */
type MissReason =
  | 'not_collected'
  /** Collected and ranked, but below the cut the panel's list keeps (`rankPolicyCandidates`' default limit). */
  | 'cut_by_list_limit'
  /** Pre-S2 rule only: listed, but on another origin, which the in-page fetch could not read. */
  | 'listed_cross_origin'
  | 'listed_untyped'
  | 'listed_as_other_type'
  /** Read rule: listed with the right type and read, but it did not come back as a policy. */
  | 'unreadable'
  /** Read rule: listed with the right type, but never read — past its type's tries or the budget. */
  | 'not_read';

/** What reading one document produced, kept small enough to store every one. */
type ReadRecord = {
  status: PolicyDocumentCapture['status'];
  reason?: string;
  finalUrl?: string;
  hash?: string;
  length?: number;
};

type DocScore = {
  docType: PolicyDocType;
  verdict: Verdict;
  /** The panel's first offer of this type, and where its link redirects. */
  firstOffer: string | null;
  firstOfferResolvesTo: string | null;
  /** 1-based position of the expected document among the offers of its type; null when not offered. */
  rankInType: number | null;
  /** Every offer of this type, in the panel's order. */
  offered: string[];
  reason?: MissReason;
  /** For an `unreadable` miss: why reading the expected document did not produce a policy. */
  readReason?: string;
};

type VariantReading = {
  candidates: PolicyCandidate[];
  documentCount: number;
  analysableCount: number;
  scores: DocScore[];
  /** Read rule: what the panel offered, in order. */
  offers?: string[];
  /** `choosePolicyUrl`'s pick per expected type. No shipped surface calls it today; kept for the record. */
  chooser: { docType: PolicyDocType; url: string; source: 'link' | 'path-guess' }[];
};

type Reading = {
  pageUrl: string;
  /** The first read was interrupted by the page navigating, and this is the second. */
  retried: boolean;
  variants: Partial<Record<Variant['name'], VariantReading>>;
};

type SiteResult = {
  domain: string;
  hardCase: BenchSite['hardCase'] | null;
  homepage: {
    attempts: { url: string; status: number | null; error?: string }[];
    finalUrl: string | null;
    /** Set when neither attempt produced a page below HTTP 400: discovery never ran. */
    failed: boolean;
    error?: string;
  };
  readings: Partial<Record<ReadingName, Reading>>;
  /** Every redirect the scoring resolved, so a re-score needs no network. */
  redirects: Record<string, { resolvesTo: string | null; error?: string }>;
  /** Read rule: every document read, per variant, so a re-score needs no network. */
  reads: Partial<Record<Variant['name'], Record<string, ReadRecord>>>;
  timedOut: boolean;
};

type BenchRun = {
  label: string;
  ranAt: string;
  env: {
    gitSha: string;
    gitDirty: boolean;
    variants: Omit<Variant, 'module'>[];
    browserVersion: string;
    playwrightVersion: string;
    nodeVersion: string;
    egress: { country: string; region: string; city: string };
    concurrency: number;
    viewport: typeof VIEWPORT;
    only: string | null;
  };
  sites: SiteResult[];
};

// ── Setup ──

const arg = (name: string): string | null => {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const describeVariant = (
  name: Variant['name'],
  module: DiscoveryModule,
  extra: Pick<Variant, 'gitRef' | 'gitSha'> = {},
): Variant => ({
  name,
  module,
  offerRule:
    module.chooseOfferedDocuments && module.readPolicyDocument && module.fetchPolicyPage ? 'read' : 'same-origin',
  collectorArity: module.collectPolicyCandidatesInPage.length,
  collectorSha256: sha256(String(module.collectPolicyCandidatesInPage)),
  ...extra,
});

/**
 * Core's site-policy directory as committed at `ref`, written beside the run output and imported:
 * `discover.ts` always, `read.ts` when the ref has it (S2 on). The whole directory is written so
 * their relative imports resolve; only what those two import is ever loaded. A `package.json`
 * marks it ESM wherever it sits.
 */
const loadRefVariant = async (ref: string): Promise<Variant> => {
  const gitSha = git('rev-parse', '--verify', `${ref}^{commit}`);
  const dir = path.join(BENCH_DIR, `.ref-${gitSha.slice(0, 12)}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), '{ "type": "module" }\n', 'utf8');
  const files = git('ls-tree', '--name-only', `${gitSha}:${SITE_POLICY_DIR}`).split('\n').filter(Boolean);
  for (const file of files.filter(name => name.endsWith('.ts'))) {
    await writeFile(path.join(dir, file), git('show', `${gitSha}:${SITE_POLICY_DIR}/${file}`), 'utf8');
  }
  const discovery = (await import(pathToFileURL(path.join(dir, 'discover.ts')).href)) as DiscoveryModule;
  const reading = files.includes('read.ts')
    ? ((await import(pathToFileURL(path.join(dir, 'read.ts')).href)) as Partial<DiscoveryModule>)
    : {};
  return describeVariant('ref', { ...discovery, ...reading }, { gitRef: ref, gitSha });
};

const readEgress = async (): Promise<BenchRun['env']['egress']> => {
  try {
    const response = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(8_000) });
    const data = (await response.json()) as { country?: string; region?: string; city?: string };
    return { country: data.country ?? 'unknown', region: data.region ?? 'unknown', city: data.city ?? 'unknown' };
  } catch {
    return { country: 'unknown', region: 'unknown', city: 'unknown' };
  }
};

// ── Matching ──

const canonicalPath = (url: URL): string =>
  `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();

/**
 * Whether `candidate` addresses the document `expected` names. The query is ignored unless the
 * expected URL carries one: every query seen on these sites' links is tracking or locale noise
 * (`?snr=`, `?pfrom=`, `?lang=`), but a site that addresses documents BY query
 * (`legal.php?doc=privacy`) must not fold its privacy policy into its terms.
 */
const sameDocument = (candidate: string, expected: string): boolean => {
  try {
    const left = new URL(candidate);
    const right = new URL(expected);
    if (canonicalPath(left) !== canonicalPath(right)) return false;
    if (!right.search) return true;
    const wanted = [...right.searchParams.entries()];
    return wanted.every(([key, value]) => left.searchParams.get(key) === value);
  } catch {
    return false;
  }
};

const matchesAny = (candidate: string | null, expected: string[]): boolean =>
  candidate !== null && expected.some(url => sameDocument(candidate, url));

const originOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

// ── Scoring ──

const resolveRedirect = async (context: BrowserContext, site: SiteResult, url: string): Promise<string | null> => {
  const known = site.redirects[url];
  if (known) return known.resolvesTo;
  try {
    const response = await context.request.get(url, { timeout: REDIRECT_TIMEOUT_MS, maxRedirects: 10 });
    site.redirects[url] = { resolvesTo: response.url() };
  } catch (error) {
    site.redirects[url] = {
      resolvesTo: null,
      error: error instanceof Error ? error.message.split('\n')[0] : 'Request failed.',
    };
  }
  return site.redirects[url].resolvesTo;
};

/** Reads a document for one variant, once per site, whatever reading asks for it again. */
type SiteReader = (url: string) => Promise<PolicyDocumentCapture>;

const makeSiteReader = (
  site: SiteResult,
  variant: Variant,
  fetchWith: (fetchSource: string) => (url: string) => Promise<FetchedPolicyPage>,
): SiteReader => {
  const { readPolicyDocument, fetchPolicyPage } = variant.module;
  if (!readPolicyDocument || !fetchPolicyPage) throw new Error(`${variant.name} has no reading half to read with.`);
  const fetchPage = fetchWith(String(fetchPolicyPage));
  const records = (site.reads[variant.name] ??= {});
  const inflight = new Map<string, Promise<PolicyDocumentCapture>>();

  return url => {
    let pending = inflight.get(url);
    if (!pending) {
      pending = readPolicyDocument(url, fetchPage).then(capture => {
        records[url] =
          capture.status === 'captured'
            ? { status: capture.status, finalUrl: capture.sourceUrl, hash: capture.hash, length: capture.text.length }
            : { status: capture.status, reason: capture.reason };
        return capture;
      });
      inflight.set(url, pending);
    }
    return pending;
  };
};

/** Where an expected document that was not offered was lost, before any reading. */
const listingReason = (
  documents: RankedPolicyCandidate[],
  everything: RankedPolicyCandidate[],
  expectation: BenchSite['expected'][number],
): { listed: RankedPolicyCandidate | undefined; reason: MissReason | null } => {
  const listed = documents.find(document => matchesAny(document.url, expectation.urls));
  if (!listed) {
    const cut = everything.some(document => matchesAny(document.url, expectation.urls));
    return { listed, reason: cut ? 'cut_by_list_limit' : 'not_collected' };
  }
  if (listed.docType === null) return { listed, reason: 'listed_untyped' };
  if (listed.docType !== expectation.docType) return { listed, reason: 'listed_as_other_type' };
  return { listed, reason: null };
};

/**
 * THE READ RULE (S2 on): the offers are whatever core's own `chooseOfferedDocuments` returns, with
 * reads made in a real extension page. Nothing here restates the rule.
 */
const scoreByReading = async (
  variant: Variant,
  read: SiteReader,
  spec: BenchSite,
  documents: RankedPolicyCandidate[],
  everything: RankedPolicyCandidate[],
): Promise<{ scores: DocScore[]; offers: RankedPolicyCandidate[] }> => {
  const { offers, reads } = await variant.module.chooseOfferedDocuments!(documents, read);
  const finalOf = (url: string): string | null => {
    const capture = reads[url];
    return capture?.status === 'captured' ? capture.sourceUrl : null;
  };
  const whyUnreadable = (url: string | undefined): string | undefined => {
    const capture = url ? reads[url] : undefined;
    return capture?.status === 'unreadable' ? capture.reason : undefined;
  };

  const scores: DocScore[] = [];
  for (const expectation of spec.expected) {
    const typed = offers.filter(offer => offer.docType === expectation.docType);
    const offered = typed.map(offer => offer.url);
    const { listed, reason } = listingReason(documents, everything, expectation);

    if (typed.length === 0) {
      const lost: MissReason = reason ?? (listed && reads[listed.url] ? 'unreadable' : 'not_read');
      const readReason = lost === 'unreadable' ? whyUnreadable(listed?.url) : undefined;
      scores.push({
        docType: expectation.docType,
        verdict: 'missed',
        firstOffer: null,
        firstOfferResolvesTo: null,
        rankInType: null,
        offered,
        reason: lost,
        ...(readReason ? { readReason } : {}),
      });
      continue;
    }

    const matchIndex = typed.findIndex(
      offer => matchesAny(offer.url, expectation.urls) || matchesAny(finalOf(offer.url), expectation.urls),
    );
    const readReason = matchIndex < 0 ? whyUnreadable(listed?.url) : undefined;
    scores.push({
      docType: expectation.docType,
      verdict: matchIndex === 0 ? 'found' : matchIndex > 0 ? 'found_lower' : 'wrong_page',
      firstOffer: typed[0]?.url ?? null,
      firstOfferResolvesTo: typed[0] ? finalOf(typed[0].url) : null,
      rankInType: matchIndex >= 0 ? matchIndex + 1 : null,
      offered,
      ...(readReason ? { readReason } : {}),
    });
  }
  return { scores, offers };
};

/**
 * THE PRE-S2 RULE, for a ref that has no reading half: every same-origin, typed document among the
 * ranked top 20, read from inside the page — so a link that redirects to another origin was offered
 * and then could not be read.
 */
const scoreBySameOrigin = async (
  context: BrowserContext,
  site: SiteResult,
  spec: BenchSite,
  pageUrl: string,
  documents: RankedPolicyCandidate[],
  everything: RankedPolicyCandidate[],
): Promise<DocScore[]> => {
  const sameOriginOf = (document: RankedPolicyCandidate) =>
    (document as RankedPolicyCandidate & { sameOrigin?: boolean }).sameOrigin === true;
  const pageOrigin = originOf(pageUrl);
  const scores: DocScore[] = [];

  for (const expectation of spec.expected) {
    const offers = documents.filter(document => sameOriginOf(document) && document.docType === expectation.docType);
    const offered = offers.map(offer => offer.url);

    if (offers.length === 0) {
      const { listed, reason } = listingReason(documents, everything, expectation);
      scores.push({
        docType: expectation.docType,
        verdict: 'missed',
        firstOffer: null,
        firstOfferResolvesTo: null,
        rankInType: null,
        offered,
        reason: listed && !sameOriginOf(listed) ? 'listed_cross_origin' : (reason ?? 'listed_as_other_type'),
      });
      continue;
    }

    const resolved = await Promise.all(offers.map(offer => resolveRedirect(context, site, offer.url)));
    const matchIndex = offers.findIndex(
      (offer, index) =>
        matchesAny(offer.url, expectation.urls) || matchesAny(resolved[index] ?? null, expectation.urls),
    );
    const firstResolved = resolved[0] ?? null;
    // Inferred, not observed: a same-origin fetch redirected to another origin is a CORS request,
    // and a policy host does not send `Access-Control-Allow-Origin` for an arbitrary page origin.
    const firstUnreadable = firstResolved !== null && originOf(firstResolved) !== pageOrigin;

    scores.push({
      docType: expectation.docType,
      verdict:
        matchIndex === 0
          ? firstUnreadable
            ? 'found_unreadable'
            : 'found'
          : matchIndex > 0
            ? 'found_lower'
            : 'wrong_page',
      firstOffer: offers[0]?.url ?? null,
      firstOfferResolvesTo: firstResolved,
      rankInType: matchIndex >= 0 ? matchIndex + 1 : null,
      offered,
    });
  }
  return scores;
};

const scoreReading = async (
  context: BrowserContext,
  site: SiteResult,
  spec: BenchSite,
  variant: Variant,
  read: SiteReader | undefined,
  pageUrl: string,
  candidates: PolicyCandidate[],
): Promise<VariantReading> => {
  const { rankPolicyCandidates, choosePolicyUrl } = variant.module;
  // What the panel holds: `discoverActiveTabPolicies` ranks with the default limit, so this does too.
  const documents = rankPolicyCandidates(candidates, { pageUrl });
  // Everything collected, uncut — only to say where a missed document was lost.
  const everything = rankPolicyCandidates(candidates, { pageUrl, limit: Number.MAX_SAFE_INTEGER });

  let scores: DocScore[];
  let offers: string[] | undefined;
  let analysableCount: number;
  if (variant.offerRule === 'read' && read) {
    const scored = await scoreByReading(variant, read, spec, documents, everything);
    scores = scored.scores;
    offers = scored.offers.map(offer => offer.url);
    analysableCount = scored.offers.length;
  } else {
    scores = await scoreBySameOrigin(context, site, spec, pageUrl, documents, everything);
    analysableCount = documents.filter(
      document => (document as RankedPolicyCandidate & { sameOrigin?: boolean }).sameOrigin && document.docType,
    ).length;
  }

  const chooser = spec.expected.flatMap(({ docType }) => {
    const chosen = choosePolicyUrl(candidates, { docType, pageUrl });
    return chosen ? [{ docType, url: chosen.url, source: chosen.source }] : [];
  });

  return {
    candidates,
    documentCount: documents.length,
    analysableCount,
    scores,
    ...(offers ? { offers } : {}),
    chooser,
  };
};

// ── Per site ──

type Readers = Partial<Record<Variant['name'], SiteReader>>;

const takeReading = async (
  context: BrowserContext,
  page: Page,
  site: SiteResult,
  spec: BenchSite,
  variants: Variant[],
  readers: Readers,
  name: ReadingName,
) => {
  const collectAll = async (): Promise<PolicyCandidate[][]> => {
    // Every variant reads the same DOM before anything else happens to the page.
    const collected: PolicyCandidate[][] = [];
    for (const variant of variants) {
      collected.push(
        await page.evaluate(variant.module.collectPolicyCandidatesInPage, variant.module.POLICY_LINK_PATTERN.source),
      );
    }
    return collected;
  };

  let collected: PolicyCandidate[][];
  let retried = false;
  try {
    collected = await collectAll();
  } catch {
    // A page that replaces itself mid-read (deepseek's script redirect to /en/, zepto's bot
    // challenge reloading) destroys the execution context. Read once more after it settles —
    // what a reader looking again would get. A second failure is the site's, and is `failed`.
    retried = true;
    try {
      await page.waitForLoadState('load', { timeout: LOAD_EVENT_TIMEOUT_MS });
    } catch {
      // Read regardless.
    }
    collected = await collectAll();
  }
  const pageUrl = page.url();
  const reading: Reading = { pageUrl, retried, variants: {} };
  for (const [index, variant] of variants.entries()) {
    reading.variants[variant.name] = await scoreReading(
      context,
      site,
      spec,
      variant,
      readers[variant.name],
      pageUrl,
      collected[index] ?? [],
    );
  }
  site.readings[name] = reading;
};

const emptySite = (spec: BenchSite): SiteResult => ({
  domain: spec.domain,
  hardCase: spec.hardCase ?? null,
  homepage: { attempts: [], finalUrl: null, failed: false },
  readings: {},
  redirects: {},
  reads: {},
  timedOut: false,
});

/** Mutates `site` as it goes, so whatever finished before a timeout is kept. */
const benchSite = async (
  context: BrowserContext,
  spec: BenchSite,
  site: SiteResult,
  variants: Variant[],
  readers: Readers,
) => {
  let page: Page | null = null;
  try {
    page = await context.newPage();

    let loaded = false;
    for (const attempt of [`https://${spec.domain}/`, `https://www.${spec.domain}/`]) {
      try {
        const response = await page.goto(attempt, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        const status = response?.status() ?? null;
        site.homepage.attempts.push({ url: attempt, status });
        if (status !== null && status < 400) {
          loaded = true;
          break;
        }
      } catch (error) {
        site.homepage.attempts.push({
          url: attempt,
          status: null,
          error: error instanceof Error ? error.message.split('\n')[0] : 'Navigation failed.',
        });
      }
    }
    site.homepage.finalUrl = page.url();
    if (!loaded) {
      // A bot wall or a dead host. Collecting from whatever is on screen would score the site's
      // documents as missed by discovery, when discovery never saw the site at all.
      site.homepage.failed = true;
      site.homepage.error = 'No attempt produced a page below HTTP 400.';
      return;
    }

    try {
      await page.waitForLoadState('load', { timeout: LOAD_EVENT_TIMEOUT_MS });
    } catch {
      // A page whose load event never fires is still read, as the panel would read it.
    }
    await takeReading(context, page, site, spec, variants, readers, 'early');

    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS });
    } catch {
      // Ad-heavy pages never go idle; the timeout is the point, not a failure.
    }
    await takeReading(context, page, site, spec, variants, readers, 'settled');

    for (const _pass of [0, 1]) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } catch {
        // Scroll is best-effort.
      }
      await page.waitForTimeout(1_500);
    }
    await takeReading(context, page, site, spec, variants, readers, 'scrolled');
  } catch (error) {
    site.homepage.error = error instanceof Error ? error.message.split('\n')[0] : 'Bench failed.';
  } finally {
    await page?.close().catch(() => undefined);
  }
};

// ── Reporting ──

const expectedCount = (domain: string): number =>
  BENCH_SITES.find(spec => spec.domain === domain)?.expected.length ?? 0;

/**
 * A missing reading is `failed` per expected document — the homepage failed, or the site timed
 * out before that reading — never `missed`, which would charge discovery for a page it never saw.
 */
const tally = (sites: SiteResult[], reading: ReadingName, variant: Variant['name']) => {
  const counts = Object.fromEntries(VERDICTS.map(verdict => [verdict, 0])) as Record<Verdict, number>;
  for (const site of sites) {
    const scores = site.readings[reading]?.variants[variant]?.scores;
    if (!scores) {
      counts.failed += expectedCount(site.domain);
      continue;
    }
    for (const score of scores) counts[score.verdict] += 1;
  }
  return counts;
};

const headlineLine = (counts: Record<Verdict, number>): string => {
  const total = VERDICTS.reduce((sum, verdict) => sum + counts[verdict], 0);
  return (
    `found ${counts.found}/${total - counts.failed} · unreadable ${counts.found_unreadable} · ` +
    `lower ${counts.found_lower} · wrong page ${counts.wrong_page} · missed ${counts.missed} · failed ${counts.failed}`
  );
};

const describe = (score: DocScore | undefined): string => {
  if (!score) return 'failed';
  switch (score.verdict) {
    case 'found':
      return 'found';
    case 'found_unreadable':
      return `found, UNREADABLE → ${score.firstOfferResolvesTo}`;
    case 'found_lower':
      return `offered #${score.rankInType}, first is ${score.firstOfferResolvesTo ?? score.firstOffer}`;
    case 'wrong_page':
      return `WRONG → ${score.firstOfferResolvesTo ?? score.firstOffer}${
        score.readReason ? ` (expected one read ${score.readReason})` : ''
      }`;
    case 'missed':
      return `missed (${score.reason}${score.readReason ? `: ${score.readReason}` : ''})`;
    default:
      return score.verdict;
  }
};

const report = (run: BenchRun, variants: Variant[], previous: BenchRun | null) => {
  for (const variant of variants) {
    const name = variant.name === 'ref' ? `ref ${variant.gitRef} (${variant.gitSha?.slice(0, 7)})` : 'working tree';
    console.log(`[bench] ${name}`);
    for (const reading of READINGS) {
      const marker = reading === HEADLINE ? '*' : ' ';
      console.log(`  ${marker}${reading.padEnd(9)} ${headlineLine(tally(run.sites, reading, variant.name))}`);
    }
  }
  console.log(`  (* headline: the panel opened on a loaded page)`);

  console.log('');
  const hasRef = variants.some(variant => variant.name === 'ref');
  for (const site of run.sites) {
    const spec = BENCH_SITES.find(item => item.domain === site.domain);
    if (site.homepage.failed || !site.readings[HEADLINE]) {
      const why = site.timedOut ? 'timed out' : (site.homepage.error ?? 'no reading');
      console.log(`  ${site.domain.padEnd(28)} FAILED: ${why}`);
      continue;
    }
    for (const expectation of spec?.expected ?? []) {
      const pick = (result: SiteResult | undefined, variant: Variant['name']) =>
        result?.readings[HEADLINE]?.variants[variant]?.scores.find(score => score.docType === expectation.docType);
      const current = pick(site, 'current');
      const notes: string[] = [];
      if (hasRef) {
        const ref = pick(site, 'ref');
        if (ref?.verdict !== current?.verdict) notes.push(`ref: ${describe(ref)}`);
      }
      const before = previous?.sites.find(item => item.domain === site.domain);
      if (before) {
        const prior = pick(before, 'current');
        if (prior?.verdict !== current?.verdict) notes.push(`was: ${describe(prior)}`);
      }
      const suffix = notes.length > 0 ? `   (${notes.join('; ')})` : '';
      console.log(`  ${site.domain.padEnd(28)} ${expectation.docType.padEnd(8)} ${describe(current)}${suffix}`);
    }
  }
};

// ── Main ──

const main = async () => {
  const label = arg('label');
  if (!label || !/^[\w.-]+$/.test(label)) {
    throw new Error(
      'Pass --label=<name> (letters, digits, . _ -); the run is written to corpus/bench/discovery-<name>.json.',
    );
  }
  const outputPath = path.join(BENCH_DIR, `discovery-${label}.json`);
  if (existsSync(outputPath) && !flag('force')) {
    throw new Error(`${outputPath} exists. Pick another label, or pass --force to overwrite a recorded run.`);
  }

  const concurrency = Number(arg('concurrency') ?? '4');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be an integer ≥ 1.');

  const only = arg('only');
  const queue = only ? BENCH_SITES.filter(site => site.domain === only) : [...BENCH_SITES];
  if (queue.length === 0) throw new Error(`--only=${only} matches no bench site.`);

  const compare = arg('compare');
  let previous: BenchRun | null = null;
  if (compare) {
    const previousPath = path.join(BENCH_DIR, `discovery-${compare}.json`);
    if (!existsSync(previousPath)) throw new Error(`--compare=${compare}: ${previousPath} does not exist.`);
    previous = JSON.parse(await readFile(previousPath, 'utf8')) as BenchRun;
  }

  await mkdir(BENCH_DIR, { recursive: true });
  const variants: Variant[] = [
    describeVariant('current', { ...currentDiscovery, ...currentRead } as unknown as DiscoveryModule),
  ];
  const ref = arg('ref');
  if (ref) variants.push(await loadRefVariant(ref));

  const require = createRequire(import.meta.url);
  const playwrightVersion = (require('playwright-core/package.json') as { version: string }).version;

  console.log(
    `[bench] ${queue.length} site(s), concurrency ${concurrency}${ref ? `, scoring ref ${ref} alongside` : ''}`,
  );

  // Extensions enabled and an ordinary user agent, for the reads — see `extension-fetch.ts`.
  const launchForReads = extensionLaunchOptions(REAL_USER_AGENT);
  const browser: Browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    ignoreDefaultArgs: launchForReads.ignoreDefaultArgs,
    args: ['--disable-blink-features=AutomationControlled', ...(launchForReads.args ?? [])],
  });
  const needsReads = variants.some(variant => variant.offerRule === 'read');
  const fetcher = needsReads ? await openExtensionFetcher(browser, path.join(BENCH_DIR, '.probe-extension')) : null;
  const results: SiteResult[] = [];
  const cursor = { index: 0 };

  const worker = async () => {
    for (;;) {
      const spec = queue[cursor.index];
      cursor.index += 1;
      if (!spec) break;
      const site = emptySite(spec);
      // A fresh context per site: one site's cookies and consent state must not shape another's.
      const context = await browser.newContext({
        viewport: VIEWPORT,
        locale: 'en-US',
        userAgent: REAL_USER_AGENT,
        extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' },
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<void>(resolve => {
        timer = setTimeout(() => {
          site.timedOut = true;
          resolve();
        }, SITE_TIMEOUT_MS);
      });
      try {
        const readers: Readers = {};
        for (const variant of variants) {
          if (variant.offerRule === 'read' && fetcher)
            readers[variant.name] = makeSiteReader(site, variant, fetcher.fetchWith);
        }
        await Promise.race([benchSite(context, spec, site, variants, readers), timedOut]);
      } finally {
        clearTimeout(timer);
        // Closing the context aborts whatever was still pending on it after a timeout.
        await context.close().catch(() => undefined);
      }
      results.push(site);
      console.log(`[bench] ${spec.domain}${site.timedOut ? ' (timed out)' : ''}`);
    }
  };

  const browserVersion = browser.version();
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    await browser.close();
  }

  const order = new Map(BENCH_SITES.map((site, index) => [site.domain, index]));
  results.sort((left, right) => (order.get(left.domain) ?? 0) - (order.get(right.domain) ?? 0));

  const run: BenchRun = {
    label,
    ranAt: new Date().toISOString(),
    env: {
      gitSha: git('rev-parse', 'HEAD'),
      gitDirty: git('status', '--porcelain').length > 0,
      variants: variants.map(({ module: _module, ...rest }) => rest),
      browserVersion,
      playwrightVersion,
      nodeVersion: process.version,
      egress: await readEgress(),
      concurrency,
      viewport: VIEWPORT,
      only,
    },
    sites: results,
  };
  await writeFile(outputPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');

  console.log('');
  report(run, variants, previous);
  console.log('');
  console.log(`[bench] written to ${path.relative(ROOT, outputPath)}`);
};

await main();
