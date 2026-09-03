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

export type InPageFetchResult = {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  error?: string;
};

/** Anchor text / href signals that a link points at a policy document. */
export const POLICY_LINK_PATTERN = /privacy|terms|cookie|legal|eula|conditions|do\s*not\s*sell/i;

/**
 * Ordered most-specific-first: "Data Processing Addendum" must not be classified as "terms"
 * just because it also mentions conditions.
 */
const DOC_TYPE_PATTERNS: [PolicyDocType, RegExp][] = [
  ['data_processing', /data\s*processing|\bdpa\b|sub-?processor/i],
  ['acceptable_use', /acceptable\s*use|\baup\b|community\s*(guidelines|standards)/i],
  ['eula', /\beula\b|end\s*user\s*licen[cs]e|licen[cs]e\s*agreement/i],
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
  return guess ? { url: new URL(guess, pageUrl.origin).toString(), docType: options.docType, source: 'path-guess' } : null;
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
