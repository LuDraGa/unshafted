/**
 * Corpus capture — the map builder.
 *
 * Run:  node --import tsx tools/corpus/capture.ts [--limit=N] [--only=domain] [--concurrency=N]
 *         [--corpus=<dir>]
 *
 * `--corpus` captures into another directory than `corpus/` — a scratch corpus, to compare a
 * capture with what is committed without touching `corpus/manifest.json`.
 *
 * THREE RULES THIS SCRIPT EXISTS TO OBEY.
 *
 * 1. ONE HASHING PATH. Everything goes through `computePolicyHash` from unshafted-core, which
 *    hashes NORMALIZED text (AD-1). There is no second normalizer and no PDF path here. A fork
 *    would produce hashes no browser will ever compute, and the corpus would be invisible to the
 *    product it exists to feed.
 *
 * 2. THE CLIENT'S OWN DISCOVERY DECIDES. `collectPolicyCandidatesInPage` and `choosePolicyUrl`
 *    are imported from the shipped module, not reimplemented. If capture hand-picked URLs and
 *    the client picked different ones, the hashes would never match. Where the shipped chooser
 *    does something surprising, that is RECORDED rather than corrected — the override list is
 *    one of the most valuable outputs here, because it is a bug report written from real data.
 *
 * 3. THE CLIENT'S OWN READ DECIDES WHAT THE TEXT IS. Each document is read by the panel's rule,
 *    `readPolicyPage` in core (AD-1 amended in S3 of the site coverage work): the raw HTML if it
 *    is a document, else the page as JavaScript builds it. Both halves run inside a real Chrome
 *    extension (`extension-fetch.ts`) — the raw HTML fetched by core's own `fetchPolicyPage`,
 *    cookies omitted, and the rendered page opened in a background tab by shared's
 *    `readInBackgroundTab` and read by core's `readRenderedPageInPage` — so a capture hashes
 *    exactly what the panel hashes, and records which of the two readings it is (`readMode`).
 *    Until S3 this took the raw body of a page NAVIGATION, which carries the cookies the homepage
 *    set: Facebook, Instagram and Reddit serve that a full policy and serve the panel's cookieless
 *    fetch an empty shell.
 *
 * No analysis is produced or implied. Severity, risk and disclosure status belong to the next
 * session; this pass records only where documents are, what they hash to, and what failed.
 */
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Response } from 'playwright-core';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  choosePolicyUrl,
  collectPolicyCandidatesInPage,
  guessDocType,
  POLICY_LINK_PATTERN,
} from '../../packages/unshafted-core/lib/site-policy/discover.js';
import {
  computePolicyHash,
  POLICY_NORMALIZER_VERSION,
} from '../../packages/unshafted-core/lib/site-policy/normalize.js';
import {
  fetchPolicyPage,
  readPolicyPage,
  readRenderedPageInPage,
} from '../../packages/unshafted-core/lib/site-policy/read.js';
import { readInBackgroundTab } from '../../packages/shared/lib/utils/policy-capture.js';
import { extensionLaunchOptions, openExtensionFetcher } from './extension-fetch.js';
import type { PolicyCandidate } from '../../packages/unshafted-core/lib/site-policy/discover.js';
import type {
  FetchedPolicyPage,
  PolicyPageFetch,
  PolicyPageRender,
} from '../../packages/unshafted-core/lib/site-policy/read.js';
import type { PolicyDocType, PolicyReadMode } from '../../packages/unshafted-core/lib/site-policy/types.js';

import { SITES } from './sites.js';
import type { SiteSpec } from './sites.js';
import type {
  CapturedDocument,
  CaptureStatus,
  ComparisonFetch,
  CorpusManifest,
  MissedCandidate,
  SiteCapture,
} from './types.js';

// ── Configuration ──

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CORPUS_DIR = path.resolve(ROOT, process.argv.find(value => value.startsWith('--corpus='))?.slice(9) ?? 'corpus');
const RAW_DIR = path.join(CORPUS_DIR, 'raw');
const TEXT_DIR = path.join(CORPUS_DIR, 'text');
const SITES_DIR = path.join(CORPUS_DIR, 'sites');

/**
 * Anti-automation posture.
 *
 * Not an attempt to be sneaky — it is a correctness requirement. Default headless Chrome
 * announces itself (`HeadlessChrome` in the UA, `navigator.webdriver`), and large retailers
 * answer that with a 202/403 interstitial. Scraping THAT page finds no footer links, so the
 * chooser falls back to path guesses, and the corpus quietly fills with 404s instead of
 * policies. The first run did exactly that on Amazon, DoorDash and Shein.
 *
 * A real user agent and Chrome's new headless mode get us the page an ordinary visitor sees,
 * which is the page whose policy links we are supposed to be reading.
 */
const REAL_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

/**
 * Below this many characters of normalized text, a "policy" is almost certainly not one — an SPA
 * shell, a consent wall, a stub redirect page. Real policies run 10k-200k characters; the
 * shortest genuine ones (a one-screen cookie notice) still clear 2k.
 */
const THIN_TEXT_CHARS = 2_000;

const NAV_TIMEOUT_MS = 30_000;
const NODE_FETCH_TIMEOUT_MS = 20_000;
/** Politeness gap between requests to the same site. */
const PER_DOC_DELAY_MS = 1_200;
/** Extra backoff after a 429. Path guesses draw rate limiting; real documents must not pay for it. */
const RATE_LIMIT_BACKOFF_MS = 5_000;
/** Ceiling per site. "Everything discoverable" still needs a stop, or a bad footer eats an hour. */
const MAX_DOCS_PER_SITE = 24;

const DOC_TYPES: PolicyDocType[] = ['terms', 'privacy', 'cookie', 'eula', 'acceptable_use', 'data_processing'];

/**
 * Terms that name a real policy document but that the SHIPPED `POLICY_LINK_PATTERN` does not
 * match. Anchors hitting these — and missing the shipped pattern — are the documents currently
 * invisible to the corpus. Measuring that gap is the point; this list is never used to CAPTURE.
 */
const WIDE_TERMS = [
  'e-sign',
  'esign',
  'electronic',
  'disclosure',
  'consent',
  'agreement',
  'notice',
  'policy',
  'rewards',
  'loyalty',
  'program',
  'membership',
  'billing',
  'refund',
  'cancellation',
  'subscription',
  'auto-renew',
  'autorenew',
  'arbitration',
  'opt-out',
  'preferences',
  'choices',
  'your data',
  'data protection',
  'gdpr',
  'ccpa',
  'dpdp',
  'copyright',
  'dmca',
  'imprint',
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const nowIso = () => new Date().toISOString();

const arg = (name: string): string | null => {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

// ── Storage ──

const ensureDirs = async () => {
  for (const dir of [RAW_DIR, TEXT_DIR, SITES_DIR]) await mkdir(dir, { recursive: true });
};

/**
 * Content-addressed on disk, mirroring the eventual object-store layout exactly. Shared
 * documents dedupe for free: `policies.google.com/terms` is one file no matter how many sites
 * point at it.
 */
const storeDocument = async (hash: string, raw: string, text: string) => {
  const rawPath = path.join(RAW_DIR, `${hash}.html`);
  const textPath = path.join(TEXT_DIR, `${hash}.txt`);
  if (!existsSync(rawPath)) await writeFile(rawPath, raw, 'utf8');
  if (!existsSync(textPath)) await writeFile(textPath, text, 'utf8');
};

// ── Fetch helpers ──

const classifyContentType = (contentType: string | null): 'html' | 'pdf' | 'other' => {
  const value = (contentType ?? '').toLowerCase();
  if (value.includes('pdf')) return 'pdf';
  if (!value || value.includes('html') || value.includes('xml') || value.includes('text/plain')) return 'html';
  return 'other';
};

/** What a Part 2 server would compute: a plain Node fetch, no browser, default headers. */
const nodeFetchHash = async (url: string): Promise<ComparisonFetch> => {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(NODE_FETCH_TIMEOUT_MS),
    });
    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      return {
        status: 'http_error',
        httpStatus: response.status,
        contentHash: null,
        normalizedLength: null,
        agreesWithCanonical: null,
      };
    }
    if (classifyContentType(contentType) !== 'html') {
      return {
        status: classifyContentType(contentType) === 'pdf' ? 'pdf_not_captured' : 'unsupported_type',
        httpStatus: response.status,
        contentHash: null,
        normalizedLength: null,
        agreesWithCanonical: null,
      };
    }
    const html = await response.text();
    const { hash, normalized } = await computePolicyHash(html);
    return {
      status: normalized.length < THIN_TEXT_CHARS ? 'thin' : 'captured',
      httpStatus: response.status,
      contentHash: hash,
      normalizedLength: normalized.length,
      agreesWithCanonical: null,
    };
  } catch (error) {
    return {
      status: 'fetch_error',
      httpStatus: null,
      contentHash: null,
      normalizedLength: null,
      agreesWithCanonical: null,
      error: error instanceof Error ? error.message : 'Node fetch failed.',
    };
  }
};

/** The panel's two ways of reading a document, run inside the probe extension — see rule 3. */
type DocumentReader = { fetchPage: PolicyPageFetch; render: PolicyPageRender };

/**
 * Canonical capture: the panel's own rule (`readPolicyPage`), always allowed to open the page,
 * because a corpus capture wants the text wherever the panel could reach it. The raw response is
 * recorded on the way through, for the status, type and address the manifest keeps.
 */
const captureCanonical = async (
  reader: DocumentReader,
  url: string,
): Promise<{
  status: CaptureStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  contentType: string | null;
  hash: string | null;
  length: number | null;
  usedMainContainer: boolean | null;
  /** The HTML the hash was taken over: the raw body, or the rendered page (`readMode`). */
  raw: string | null;
  text: string | null;
  readMode: PolicyReadMode | null;
  error?: string;
}> => {
  const responses: FetchedPolicyPage[] = [];
  const read = await readPolicyPage(
    url,
    async target => {
      const response = await reader.fetchPage(target);
      responses.push(response);
      return response;
    },
    reader.render,
  );
  const response = responses[0];
  const httpStatus = response?.status ? response.status : null;
  const contentType = response?.contentType || null;

  if (read.status === 'document') {
    const { hash, normalized } = await computePolicyHash(read.html);
    return {
      status: 'captured',
      httpStatus,
      finalUrl: read.finalUrl,
      contentType,
      hash,
      length: normalized.length,
      usedMainContainer: normalized.usedMainContainer,
      raw: read.html,
      text: normalized.text,
      readMode: read.readMode,
    };
  }

  const status: CaptureStatus =
    read.status === 'hub'
      ? 'hub'
      : read.reason === 'not-html'
        ? classifyContentType(contentType) === 'pdf'
          ? 'pdf_not_captured'
          : 'unsupported_type'
        : read.reason === 'too-short'
          ? 'thin'
          : httpStatus !== null && httpStatus >= 400
            ? 'http_error'
            : 'fetch_error';
  return {
    status,
    httpStatus,
    finalUrl: read.status === 'hub' ? read.finalUrl : (response?.finalUrl ?? null),
    contentType,
    hash: null,
    length: null,
    usedMainContainer: null,
    raw: null,
    text: null,
    readMode: read.readMode,
    ...(response?.error ? { error: response.error } : {}),
  };
};

// ── In-page collectors ──

/**
 * Wider than the shipped collector, and used ONLY to measure what the shipped one misses.
 * Injected, so it must stay self-contained exactly like the shipped collectors.
 */
const collectWideCandidatesInPage = (): { href: string; text: string }[] => {
  const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 2000);
  const documentHeight = Math.max(document.body?.scrollHeight ?? 0, 1);
  const results: { href: string; text: string }[] = [];

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!href || href.startsWith('#')) continue;

    const inLandmark = Boolean(anchor.closest('footer, [role="contentinfo"]'));
    let inLowerPage = false;
    try {
      const top = anchor.getBoundingClientRect().top + window.scrollY;
      inLowerPage = top / documentHeight > 0.8;
    } catch {
      inLowerPage = false;
    }
    if (!inLandmark && !inLowerPage) continue;

    results.push({ href, text });
    if (results.length >= 200) break;
  }

  return results;
};

const findMissed = (wide: { href: string; text: string }[]): MissedCandidate[] => {
  const missed: MissedCandidate[] = [];
  const seen = new Set<string>();

  for (const link of wide) {
    const haystack = `${link.text} ${link.href}`;
    // Already visible to the shipped pattern — not a gap.
    if (POLICY_LINK_PATTERN.test(haystack)) continue;
    // Word boundaries, not substring: "ShopbopDesignerFashion" contains "esign" and is not a
    // policy document. A substring match here manufactures a gap that does not exist.
    const term = WIDE_TERMS.find(candidate =>
      new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack),
    );
    if (!term) continue;
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    missed.push({ href: link.href, text: link.text, matchedTerm: term });
  }

  return missed;
};

// ── Per-site capture ──

const absolutise = (href: string, base: string): string | null => {
  try {
    const url = new URL(href, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const captureSite = async (context: BrowserContext, site: SiteSpec, reader: DocumentReader): Promise<SiteCapture> => {
  const page = await context.newPage();
  const requestedUrl = `https://${site.domain}/`;

  const result: SiteCapture = {
    domain: site.domain,
    tags: site.tags,
    market: site.market,
    homepage: { requestedUrl, finalUrl: null, httpStatus: null, candidateCount: 0 },
    clientPicks: [],
    documents: [],
    missedCandidates: [],
    discoveryNotes: [],
  };

  try {
    // Plenty of sites serve the apex badly or not at all (HTTP/2 resets, 5xx) while `www` is
    // fine. Trying both is the difference between a site being captured and being recorded as
    // dead, and the client would land on whichever one the user actually typed anyway.
    let response: Response | null = null;
    let lastError: string | null = null;
    for (const attempt of [requestedUrl, `https://www.${site.domain}/`]) {
      try {
        response = await page.goto(attempt, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        if (response && response.status() < 400) break;
        lastError = `HTTP ${response?.status() ?? 'none'} at ${attempt}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message.split('\n')[0] : 'Navigation failed.';
        response = null;
      }
    }
    if (!response) {
      result.homepage.error = lastError ?? 'Navigation failed.';
      return result;
    }
    if (lastError && response.status() >= 400) result.homepage.error = lastError;

    result.homepage.httpStatus = response?.status() ?? null;
    const pageUrl = response?.url() ?? page.url();
    result.homepage.finalUrl = pageUrl;

    // Footers are lazy, and on SPA storefronts they render only after hydration and only once
    // something has scrolled. Scraping too early yields zero candidates, which the chooser then
    // "solves" by fabricating path guesses — so the whole site's capture turns into 404s. Two
    // scroll-and-settle passes, and one retry if the first collection came back empty.
    const settleAndCollect = async (): Promise<PolicyCandidate[]> => {
      try {
        await page.waitForLoadState('networkidle', { timeout: 8_000 });
      } catch {
        // Ad-heavy pages never go idle; the timeout is the point, not a failure.
      }
      for (const _pass of [0, 1]) {
        try {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } catch {
          // Scroll is best-effort.
        }
        await page.waitForTimeout(1_500);
      }
      // THE SHIPPED COLLECTOR — same function the extension injects.
      return page.evaluate(collectPolicyCandidatesInPage, POLICY_LINK_PATTERN.source);
    };

    let candidates: PolicyCandidate[] = await settleAndCollect();
    if (candidates.length === 0) {
      result.discoveryNotes.push('First footer scrape found nothing; retried after a further settle.');
      candidates = await settleAndCollect();
    }
    result.homepage.candidateCount = candidates.length;

    const wide = await page.evaluate(collectWideCandidatesInPage);
    result.missedCandidates = findMissed(wide);

    // THE SHIPPED CHOOSER — recorded verbatim, never corrected.
    const picks = new Map<string, { docType: PolicyDocType; source: 'link' | 'path-guess' }>();
    for (const docType of DOC_TYPES) {
      const chosen = choosePolicyUrl(candidates, { docType, pageUrl });
      if (!chosen) continue;
      result.clientPicks.push({ docType, url: chosen.url, source: chosen.source });
      if (!picks.has(chosen.url)) picks.set(chosen.url, { docType, source: chosen.source });
    }

    // Build the capture set: everything discoverable, plus any client pick not among the links.
    type Target = {
      url: string;
      anchorText: string;
      inFooterRegion: boolean;
      discoveredBy: CapturedDocument['discoveredBy'];
    };
    const targets = new Map<string, Target>();

    for (const candidate of candidates) {
      const url = absolutise(candidate.href, pageUrl);
      if (!url) continue;
      const existing = targets.get(url);
      if (existing) {
        // Same document linked twice; keep the footer signal if either occurrence had it.
        existing.inFooterRegion = existing.inFooterRegion || candidate.inFooterRegion;
        continue;
      }
      targets.set(url, {
        url,
        anchorText: candidate.text,
        inFooterRegion: candidate.inFooterRegion,
        discoveredBy: 'footer_link',
      });
    }

    for (const [url, pick] of picks) {
      if (targets.has(url)) continue;
      targets.set(url, {
        url,
        anchorText: '',
        inFooterRegion: false,
        discoveredBy: pick.source === 'path-guess' ? 'path_guess' : 'client_pick',
      });
    }

    // Real links first, fabricated path guesses last. Guesses are the ones that 404 and draw
    // rate limiting, and a 429 cascade must not corrupt the capture of documents that exist.
    const rank = { footer_link: 0, client_pick: 1, path_guess: 2 } as const;
    const ordered = Array.from(targets.values())
      .sort((left, right) => rank[left.discoveredBy] - rank[right.discoveredBy])
      .slice(0, MAX_DOCS_PER_SITE);
    if (targets.size > MAX_DOCS_PER_SITE) {
      result.discoveryNotes.push(`Capped at ${MAX_DOCS_PER_SITE} documents; ${targets.size} were discoverable.`);
    }

    for (const target of ordered) {
      const canonical = await captureCanonical(reader, target.url);
      const node = await nodeFetchHash(target.url);
      if (canonical.hash && node.contentHash) node.agreesWithCanonical = canonical.hash === node.contentHash;

      if (canonical.hash && canonical.raw && canonical.text !== null) {
        await storeDocument(canonical.hash, canonical.raw, canonical.text);
      }

      const finalHost = canonical.finalUrl ? new URL(canonical.finalUrl).hostname : null;

      result.documents.push({
        chosenUrl: target.url,
        finalUrl: canonical.finalUrl,
        host: finalHost,
        // Since S2 the extension reads every linked document itself, wherever it is hosted (AD-4,
        // which limited it to the page's own origin, is retired). How it reads is `readMode`.
        reachableByClient: true,
        docType: guessDocType(target.url, target.anchorText),
        anchorText: target.anchorText,
        inFooterRegion: target.inFooterRegion,
        // Only the footer surface is machine-observable in this pass. Signup, checkout and
        // in-app surfaces need a walked flow and are deliberately not guessed at.
        surfaces: target.inFooterRegion ? ['footer'] : [],
        discoveredBy: target.discoveredBy,
        isClientPick: picks.has(target.url),
        status: canonical.status,
        httpStatus: canonical.httpStatus,
        contentType: canonical.contentType,
        error: canonical.error,
        contentHash: canonical.hash,
        normalizedLength: canonical.length,
        usedMainContainer: canonical.usedMainContainer,
        readMode: canonical.readMode,
        nodeFetch: node,
        capturedAt: nowIso(),
      });

      await sleep(canonical.httpStatus === 429 ? RATE_LIMIT_BACKOFF_MS : PER_DOC_DELAY_MS);
    }

    // Machine-derivable observations only. No judgement about whether a pick was "right" —
    // that needs a human read and belongs in the write-up, not the manifest.
    for (const pick of result.clientPicks) {
      const doc = result.documents.find(candidate => candidate.chosenUrl === pick.url);
      if (pick.source === 'path-guess') {
        result.discoveryNotes.push(`No ${pick.docType} link found; chooser fell back to path guess ${pick.url}`);
      }
      if (doc?.readMode === 'rendered') {
        result.discoveryNotes.push(`Chooser's ${pick.docType} pick ${pick.url} reads only by opening the page (A5).`);
      }
      if (doc && doc.status !== 'captured') {
        result.discoveryNotes.push(`Chooser's ${pick.docType} pick ${pick.url} came back ${doc.status}.`);
      }
    }
    const untyped = result.documents.filter(doc => doc.docType === null);
    if (untyped.length > 0) {
      result.discoveryNotes.push(
        `${untyped.length} discovered link(s) matched POLICY_LINK_PATTERN but guessDocType returned null.`,
      );
    }
  } finally {
    await page.close().catch(() => undefined);
  }

  return result;
};

// ── Runner ──

const readEgress = async (): Promise<CorpusManifest['egress']> => {
  try {
    const response = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(8_000) });
    const data = (await response.json()) as { country?: string; region?: string; city?: string };
    return { country: data.country ?? 'unknown', region: data.region ?? 'unknown', city: data.city ?? 'unknown' };
  } catch {
    return { country: 'unknown', region: 'unknown', city: 'unknown' };
  }
};

const siteFile = (domain: string) => path.join(SITES_DIR, `${domain}.json`);

const chromeVersion = async (browser: Browser | null): Promise<string | null> => {
  if (browser) return browser.version();
  try {
    const plist = await readFile('/Applications/Google Chrome.app/Contents/Info.plist', 'utf8');
    return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null;
  } catch {
    return null;
  }
};

const main = async () => {
  await ensureDirs();

  const limit = Number(arg('limit') ?? '0');
  const only = arg('only');
  const concurrency = Number(arg('concurrency') ?? '4');

  let queue = SITES;
  if (only) queue = queue.filter(site => site.domain === only);
  if (limit > 0) queue = queue.slice(0, limit);
  queue = queue.filter(site => !existsSync(siteFile(site.domain)));

  console.log(`[corpus] ${queue.length} site(s) to capture, concurrency ${concurrency}`);
  if (queue.length === 0) {
    console.log('[corpus] nothing to do — delete corpus/sites/*.json to re-capture');
  }

  let browser: Browser | null = null;
  if (queue.length > 0) {
    // Extensions enabled and an ordinary user agent, for the probe extension that reads documents
    // exactly as the panel does — see rule 3 and `extension-fetch.ts`.
    const launchForReads = extensionLaunchOptions(REAL_USER_AGENT);
    browser = await chromium.launch({
      // `channel` rather than `executablePath`: it selects installed Chrome AND applies the
      // new-headless flags. An explicit path silently lands on legacy headless.
      channel: 'chrome',
      headless: true,
      ignoreDefaultArgs: launchForReads.ignoreDefaultArgs,
      args: ['--disable-blink-features=AutomationControlled', ...(launchForReads.args ?? [])],
    });
    const fetcher = await openExtensionFetcher(browser, path.join(CORPUS_DIR, '.probe-extension'));
    const reader: DocumentReader = {
      fetchPage: fetcher.fetchWith(String(fetchPolicyPage)),
      render: fetcher.renderWith(String(readInBackgroundTab), String(readRenderedPageInPage)),
    };
    const cursor = { index: 0 };

    const worker = async (id: number) => {
      const context = await browser!.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
        userAgent: REAL_USER_AGENT,
        extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' },
      });
      context.setDefaultTimeout(NAV_TIMEOUT_MS);
      try {
        for (;;) {
          const index = cursor.index;
          cursor.index += 1;
          const site = queue[index];
          if (!site) break;
          const started = Date.now();
          try {
            const capture = await captureSite(context, site, reader);
            await writeFile(siteFile(site.domain), JSON.stringify(capture, null, 2), 'utf8');
            const ok = capture.documents.filter(doc => doc.status === 'captured').length;
            console.log(
              `[w${id}] ${site.domain} — ${ok}/${capture.documents.length} captured, ` +
                `${capture.missedCandidates.length} missed-by-pattern, ${Math.round((Date.now() - started) / 1000)}s`,
            );
          } catch (error) {
            console.log(
              `[w${id}] ${site.domain} — FAILED: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
            );
          }
        }
      } finally {
        await context.close().catch(() => undefined);
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, i) => worker(i + 1)));
  }

  // ── Assemble ──
  const files = (await readdir(SITES_DIR)).filter(name => name.endsWith('.json')).sort();
  const sites: SiteCapture[] = [];
  for (const file of files) {
    sites.push(JSON.parse(await readFile(path.join(SITES_DIR, file), 'utf8')) as SiteCapture);
  }

  const manifest: CorpusManifest = {
    captureId: `v1-${new Date().toISOString().slice(0, 10)}`,
    capturedAt: nowIso(),
    normalizerVersion: POLICY_NORMALIZER_VERSION,
    egress: await readEgress(),
    tooling: {
      node: process.version,
      playwrightCore: JSON.parse(await readFile(path.join(ROOT, 'node_modules/playwright-core/package.json'), 'utf8'))
        .version as string,
      // Read from disk rather than the browser handle: an assemble-only run launches no
      // browser, and the manifest still needs to say which Chrome produced these hashes.
      chrome: await chromeVersion(browser),
    },
    sites,
  };

  await writeFile(path.join(CORPUS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser?.close().catch(() => undefined);

  const docs = sites.flatMap(site => site.documents);
  const captured = docs.filter(doc => doc.status === 'captured');
  const compared = captured.filter(doc => doc.nodeFetch.agreesWithCanonical !== null);
  const agreed = compared.filter(doc => doc.nodeFetch.agreesWithCanonical === true);

  console.log('');
  console.log(`[corpus] sites            ${sites.length}`);
  console.log(`[corpus] documents        ${docs.length} (${captured.length} captured)`);
  console.log(
    `[corpus] rendered       ${docs.filter(doc => doc.readMode === 'rendered').length} captured only by opening the page (A5)`,
  );
  console.log(
    `[corpus] untyped          ${docs.filter(doc => doc.docType === null).length} guessDocType returned null`,
  );
  console.log(`[corpus] missed by regex  ${sites.reduce((total, site) => total + site.missedCandidates.length, 0)}`);
  console.log(
    `[corpus] node-fetch agree ${agreed.length}/${compared.length}` +
      (compared.length ? ` (${Math.round((agreed.length / compared.length) * 100)}%)` : ''),
  );
  console.log(`[corpus] manifest         ${path.relative(ROOT, path.join(CORPUS_DIR, 'manifest.json'))}`);
};

void main();
