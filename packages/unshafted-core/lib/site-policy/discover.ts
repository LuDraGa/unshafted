import type { PolicyDocType } from './types.js';

/**
 * Finding a site's policy documents.
 *
 * Split deliberately into two halves:
 *
 *  - `collectPolicyCandidatesInPage` is INJECTED into the page via
 *    `chrome.scripting.executeScript({ func })`, which STRINGIFIES it. It therefore cannot
 *    reference anything outside its own body — no imports, no module constants, no helpers.
 *    Every value it needs is declared inline or passed in. Breaking that rule produces a
 *    `ReferenceError` at the injection site, not a compile error, so type-checking will not
 *    catch it. `fetchPolicyPage` in `read.ts` keeps the same rule for tooling's sake.
 *
 *  - Everything else is pure and unit-tested here.
 *
 * AD-4 IS RETIRED (S2, 2026-09-28). It said documents were fetched from inside the page, because
 * under `activeTab` an extension-context fetch was not reliably covered — so only same-origin
 * documents were readable, and `docs.github.com`, `openai.com` for chatgpt.com and every
 * vendor-hosted policy were listed and never read. The extension has held `<all_urls>` since
 * 2026-09-07, and from an extension page with host access a fetch needs no CORS headers. So the
 * page is now read for its LINKS only, and every document is read by the extension itself (see
 * `read.ts`). Origin decides the order documents are listed in, never whether they can be read.
 */

type PolicyCandidate = {
  href: string;
  text: string;
  inFooterRegion: boolean;
};

type ChosenPolicyUrl = {
  url: string;
  docType: PolicyDocType;
  source: 'link' | 'path-guess';
};

/** One discovered document, resolved to an absolute URL and ready to list for a reader. */
type RankedPolicyCandidate = {
  url: string;
  /** The anchor text as the site wrote it. Empty when the link carried none. */
  label: string;
  /** Null when the link is plainly a policy but names no type we recognise ("Legal"). */
  docType: PolicyDocType | null;
  /**
   * The link is on the page's own site: the same domain, subdomains included (`docs.github.com`
   * from `github.com`). It orders the list — a site's own documents before another company's —
   * and decides nothing else: every document is read the same way (D5).
   */
  ownSite: boolean;
};

/** Anchor text / href signals that a link points at a policy document. */
/**
 * `policy`, `disclosure` and `consent` were added after the Part 3 capture measured what the
 * original pattern missed: 51 links across 20 sites named a real policy document and were never
 * collected, because the pattern had no word for the most common one. "Content Policy",
 * "Cancellation Policy" and "Regulatory disclosure section" were all invisible.
 */
const POLICY_LINK_PATTERN =
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

const guessDocType = (href: string, text = ''): PolicyDocType | null => {
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
const wellKnownPolicyPaths = (docType: PolicyDocType): string[] => {
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

/**
 * Second-level labels that sit under a two-letter country code as a public suffix: `co.uk`,
 * `com.au`, `co.in`. NOT a Public Suffix List, deliberately — `candidateDomains` in
 * `index-format.ts` says why there is none at runtime. This decides ranking only, never what may
 * be read, so a suffix it misses costs a document its place in the order and nothing else. A
 * multi-tenant host (`notion.site`, `herokuapp.com`) reads as one site for the same reason, and
 * with the same cost.
 */
const COUNTRY_SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'ltd', 'plc', 'ne', 'or', 'go']);

/** The site a host belongs to: its last two labels, or three under a country's generic suffix. */
const siteOf = (hostname: string): string => {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const [second = '', top = ''] = labels.slice(-2);
  const take = top.length === 2 && COUNTRY_SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join('.');
};

const isOwnSite = (url: URL, pageUrl: URL): boolean => siteOf(url.hostname) === siteOf(pageUrl.hostname);

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
  // The site's own document before another company's. Any of them can be read (D5).
  if (isOwnSite(url, pageUrl)) score += 100;
  if (candidate.inFooterRegion) score += 20;
  // Anchor text is a stronger signal than a URL that merely contains the word.
  if (POLICY_LINK_PATTERN.test(candidate.text)) score += 15;
  // Prefer "/privacy" over "/blog/2019/why-privacy-matters".
  score -= url.pathname.split('/').filter(Boolean).length * 3;
  score -= url.search.length > 0 ? 5 : 0;

  return score;
};

const choosePolicyUrl = (
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
 * The site's own documents first: every document can be read (D5), but a page that links Google's
 * privacy policy beside its own is telling the reader about its own first.
 */
const rankPolicyCandidates = (
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
    const ownSite = isOwnSite(url, pageUrl);
    const label = candidate.text.trim();

    let score = 0;
    if (ownSite) score += 100;
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
    seen.set(key, { url: key, label: label || existing?.label || '', docType, ownSite, score });
  }

  return [...seen.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, options.limit ?? 20)
    .map(({ url, label, docType, ownSite }) => ({ url, label, docType, ownSite }));
};

/**
 * INJECTED INTO THE PAGE — must stay entirely self-contained. See the module comment.
 *
 * The link pattern arrives as an argument — every caller passes `POLICY_LINK_PATTERN.source` —
 * because a function that is stringified cannot close over the constant, and the literal copy it
 * used to carry instead went stale: `policy`, `disclosure` and `consent` reached the exported
 * pattern after the Part 3 capture and never reached the copy that actually runs in the page.
 *
 * Footer-region matches are returned before the rest, and the footer landmark's anchors are read
 * before the rest of the page. The result is capped, and in plain document order a header
 * mega-menu of "Privacy settings"-style links could spend the whole cap before the footer — where
 * the documents are — was ever reached.
 */
const collectPolicyCandidatesInPage = (patternSource: string): PolicyCandidate[] => {
  const pattern = new RegExp(patternSource, 'i');
  const anchors = new Set<Element>([
    ...Array.from(document.querySelectorAll('footer a[href], [role="contentinfo"] a[href]')),
    ...Array.from(document.querySelectorAll('a[href]')),
  ]);
  const documentHeight = Math.max(document.body?.scrollHeight ?? 0, 1);
  const footerRegion: PolicyCandidate[] = [];
  const elsewhere: PolicyCandidate[] = [];
  let scanned = 0;

  for (const anchor of anchors) {
    scanned += 1;
    if (scanned > 5000) break;
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
      // Nothing to reset. The only statement that can throw is the layout read, which runs before
      // the assignment, so `inLowerPage` still holds the `false` it was initialised to. An anchor
      // whose position cannot be measured is simply judged on its landmark alone.
    }

    const inFooterRegion = inLandmark || inLowerPage;
    (inFooterRegion ? footerRegion : elsewhere).push({ href, text, inFooterRegion });
    if (footerRegion.length >= 100) break;
  }

  return [...footerRegion, ...elsewhere].slice(0, 100);
};

export {
  POLICY_LINK_PATTERN,
  guessDocType,
  wellKnownPolicyPaths,
  choosePolicyUrl,
  rankPolicyCandidates,
  collectPolicyCandidatesInPage,
};
export type { PolicyCandidate, ChosenPolicyUrl, RankedPolicyCandidate };
