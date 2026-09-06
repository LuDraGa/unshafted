import type { PolicyDocType } from './types.js';

/**
 * Finding a site's policy documents.
 *
 * Split deliberately into two halves:
 *
 *  - `collectPolicyCandidatesInPage` / `fetchDocumentInPage` are INJECTED into the page via
 *    `chrome.scripting.executeScript({ func })`, which STRINGIFIES them. They therefore cannot
 *    reference anything outside their own bodies — no imports, no module constants, no helpers.
 *    Every value they need is declared inline. Breaking that rule produces a `ReferenceError`
 *    at the injection site, not a compile error, so it will not be caught by type-checking.
 *
 *  - Everything else is pure and unit-tested here.
 *
 * Why the fetch happens in the page (AD-4): `activeTab` grants access to the active tab on a
 * user gesture, but whether an EXTENSION-CONTEXT `fetch()` to that origin is reliably covered is
 * murky across Chrome versions. Fetching from the page's own context is same-origin by
 * construction and needs no such guarantee. The cost is that cross-origin policy hosts are not
 * reachable this way — we degrade rather than ask for host permissions.
 */

export type PolicyCandidate = {
  href: string;
  text: string;
  inFooterRegion: boolean;
};

export type ChosenPolicyUrl = {
  url: string;
  docType: PolicyDocType;
  source: 'link' | 'path-guess';
};

/** One discovered document, resolved to an absolute URL and ready to list for a reader. */
export type RankedPolicyCandidate = {
  url: string;
  /** The anchor text as the site wrote it. Empty when the link carried none. */
  label: string;
  /** Null when the link is plainly a policy but names no type we recognise ("Legal"). */
  docType: PolicyDocType | null;
  /** AD-4: only same-origin documents can be fetched from the page context. */
  sameOrigin: boolean;
};

export type InPageFetchResult = {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  error?: string;
};

/** Anchor text / href signals that a link points at a policy document. */
/**
 * `policy`, `disclosure` and `consent` were added after the Part 3 capture measured what the
 * original pattern missed: 51 links across 20 sites named a real policy document and were never
 * collected, because the pattern had no word for the most common one. "Content Policy",
 * "Cancellation Policy" and "Regulatory disclosure section" were all invisible.
 */
export const POLICY_LINK_PATTERN =
  /privacy|terms|cookie|legal|eula|conditions|policy|policies|disclosure|consent|do\s*not\s*sell/i;

/**
 * Ordered most-specific-first: "Data Processing Addendum" must not be classified as "terms"
 * just because it also mentions conditions.
 */
const DOC_TYPE_PATTERNS: [PolicyDocType, RegExp][] = [
  // `[\s-]*` rather than `\s*`: the original could not classify `/acceptable-use` or
  // `/data-processing` — the exact paths `wellKnownPolicyPaths` below generates. The chooser
  // fabricated a URL, fetched it, and then failed to type its own result.
  ['data_processing', /data[\s-]*processing|\bdpa\b|sub-?processor/i],
  ['acceptable_use', /acceptable[\s-]*use|\baup\b|community\s*(guidelines|standards)|restricted[\s-]*businesses/i],
  ['eula', /\beula\b|end[\s-]*user\s*licen[cs]e|licen[cs]e\s*agreement/i],
  // Added after the Part 3 capture: these documents exist, are consequential, and previously
  // typed as `null` (invisible) or — worse — as `terms`, where they could outrank the real
  // terms of service on a shallower path.
  ['esign_consent', /e-?sign|electronic\s*(signature|disclosure|communication|record)/i],
  [
    'regulatory_disclosure',
    /know[\s-]*your[\s-]*customer|\bkyc\b|grievance|redressal|regulatory\s*(disclosure|notification)|financial\s*disclosure|state\s*privacy\s*disclosure|ccpa\s*disclosure|digital\s*asset\s*disclosure/i,
  ],
  ['copyright', /copyright|\bdmca\b/i],
  ['program_terms', /(rewards?|loyalty|membership|program)[\s-]*(terms|program|policy)/i],
  ['cookie', /cookie/i],
  ['privacy', /privacy|do\s*not\s*sell|data\s*policy/i],
  ['terms', /terms|conditions|\btos\b|user\s*agreement/i],
];

export const guessDocType = (href: string, text = ''): PolicyDocType | null => {
  const haystack = `${text} ${href}`;
  for (const [docType, pattern] of DOC_TYPE_PATTERNS) {
    if (pattern.test(haystack)) return docType;
  }
  return null;
};

/**
 * Fallback when footer scraping finds nothing. `sitemap.xml` is a distant third resort and is
 * out of scope; `robots.txt` is a dead end — it is disallow rules and never points at policies.
 */
export const wellKnownPolicyPaths = (docType: PolicyDocType): string[] => {
  const paths: Record<PolicyDocType, string[]> = {
    privacy: ['/privacy', '/privacy-policy', '/legal/privacy', '/policies/privacy', '/privacy.html'],
    terms: ['/terms', '/terms-of-service', '/terms-of-use', '/legal/terms', '/policies/terms', '/tos'],
    cookie: ['/cookies', '/cookie-policy', '/legal/cookies'],
    eula: ['/eula', '/legal/eula', '/license'],
    acceptable_use: ['/acceptable-use', '/legal/acceptable-use'],
    data_processing: ['/dpa', '/legal/dpa', '/data-processing'],
    regulatory_disclosure: ['/legal/disclosures', '/disclosures', '/legal/regulatory'],
    copyright: ['/copyright', '/legal/copyright', '/dmca'],
    program_terms: ['/rewards-terms', '/legal/rewards', '/program-terms'],
    esign_consent: ['/legal/esign', '/esign-consent', '/electronic-disclosures'],
  };
  return paths[docType];
};

const scoreCandidate = (candidate: PolicyCandidate, wanted: PolicyDocType, pageUrl: URL): number => {
  let url: URL;
  try {
    url = new URL(candidate.href, pageUrl);
  } catch {
    return -1;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return -1;
  if (guessDocType(candidate.href, candidate.text) !== wanted) return -1;

  let score = 0;
  // AD-4: only same-origin documents are reachable via an in-page fetch.
  if (url.origin === pageUrl.origin) score += 100;
  if (candidate.inFooterRegion) score += 20;
  // Anchor text is a stronger signal than a URL that merely contains the word.
  if (POLICY_LINK_PATTERN.test(candidate.text)) score += 15;
  // Prefer "/privacy" over "/blog/2019/why-privacy-matters".
  score -= url.pathname.split('/').filter(Boolean).length * 3;
  score -= url.search.length > 0 ? 5 : 0;

  return score;
};

export const choosePolicyUrl = (
  candidates: PolicyCandidate[],
  options: { docType: PolicyDocType; pageUrl: string },
): ChosenPolicyUrl | null => {
  let pageUrl: URL;
  try {
    pageUrl = new URL(options.pageUrl);
  } catch {
    return null;
  }

  let best: { url: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, options.docType, pageUrl);
    if (score < 0) continue;
    if (!best || score > best.score) {
      best = { url: new URL(candidate.href, pageUrl).toString(), score };
    }
  }

  if (best) return { url: best.url, docType: options.docType, source: 'link' };

  const guess = wellKnownPolicyPaths(options.docType)[0];
  return guess
    ? { url: new URL(guess, pageUrl.origin).toString(), docType: options.docType, source: 'path-guess' }
    : null;
};

/**
 * Every policy document on the page, ranked for a HUMAN to pick from — the other half of
 * `choosePolicyUrl`, which picks one document for a machine.
 *
 * The two rank differently on purpose. `choosePolicyUrl` is answering "which URL do I fetch to
 * get the privacy policy", so a candidate of the wrong type scores -1 and disappears. The side
 * panel's reader (D9) is answering "what did this site put in front of you", so nothing is
 * discarded for being the wrong type — a document we cannot classify is still a document the
 * user may want to read, it just sorts last.
 *
 * Same-origin first because AD-4 means only those are actually fetchable from the page context;
 * a cross-origin policy host is listed (the user can still open it in a tab) but never leads.
 */
export const rankPolicyCandidates = (
  candidates: PolicyCandidate[],
  options: { pageUrl: string; limit?: number },
): RankedPolicyCandidate[] => {
  let pageUrl: URL;
  try {
    pageUrl = new URL(options.pageUrl);
  } catch {
    return [];
  }

  const seen = new Map<string, RankedPolicyCandidate & { score: number }>();

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate.href, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

    // The fragment never changes which document is served, and keeping it splits one policy
    // into an entry per in-page anchor — the single biggest source of duplicate rows.
    url.hash = '';
    const key = url.toString();

    const docType = guessDocType(candidate.href, candidate.text);
    const sameOrigin = url.origin === pageUrl.origin;
    const label = candidate.text.trim();

    let score = 0;
    if (sameOrigin) score += 100;
    if (docType) score += 30;
    if (candidate.inFooterRegion) score += 10;
    if (label) score += 5;
    score -= url.pathname.split('/').filter(Boolean).length * 3;

    const existing = seen.get(key);
    // Keep the better-scoring sighting, but never lose an anchor label to an unlabelled duplicate.
    if (existing && existing.score >= score) {
      if (!existing.label && label) existing.label = label;
      continue;
    }
    seen.set(key, { url: key, label: label || existing?.label || '', docType, sameOrigin, score });
  }

  return [...seen.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, options.limit ?? 20)
    .map(({ url, label, docType, sameOrigin }) => ({ url, label, docType, sameOrigin }));
};

/**
 * INJECTED INTO THE PAGE — must stay entirely self-contained. See the module comment.
 */
export const collectPolicyCandidatesInPage = (): PolicyCandidate[] => {
  const pattern = /privacy|terms|cookie|legal|eula|conditions|do\s*not\s*sell/i;
  const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 2000);
  const documentHeight = Math.max(document.body?.scrollHeight ?? 0, 1);
  const results: PolicyCandidate[] = [];

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!href || href.startsWith('#')) continue;
    if (!pattern.test(text) && !pattern.test(href)) continue;

    const inLandmark = Boolean(anchor.closest('footer, [role="contentinfo"]'));
    let inLowerPage = false;
    try {
      const top = anchor.getBoundingClientRect().top + window.scrollY;
      inLowerPage = top / documentHeight > 0.8;
    } catch {
      inLowerPage = false;
    }

    results.push({ href, text, inFooterRegion: inLandmark || inLowerPage });
    if (results.length >= 100) break;
  }

  return results;
};

/**
 * INJECTED INTO THE PAGE — must stay entirely self-contained. See the module comment.
 *
 * Runs in the content-script isolated world, which shares the page's origin, so this is a
 * same-origin request and needs no host permission.
 */
export const fetchDocumentInPage = async (url: string): Promise<InPageFetchResult> => {
  try {
    const response = await fetch(url, { credentials: 'omit', redirect: 'follow' });
    const html = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      html: html.slice(0, 4_000_000),
      finalUrl: response.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: url,
      error: error instanceof Error ? error.message : 'Fetch failed in page context.',
    };
  }
};
