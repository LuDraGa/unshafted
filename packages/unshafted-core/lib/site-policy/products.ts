import type { ProductScope, SitePolicyAnalysis } from './types.js';

/**
 * The product catalogue (B1 of the site coverage work): companies that publish ONE policy across
 * many products, the products it covers, and the web addresses that mean a product is in use.
 *
 * WHY. Google's privacy policy governs Search, YouTube, Gmail and a watch. With no record of which
 * product a finding is about, the panel on Google Search led with Fitbit's heart-rate collection
 * and a grade it pushed up. The catalogue lets an analysis say which findings belong to which
 * product (`products` on each finding, `productScopes` on the analysis — `schemas.ts`), and lets
 * the panel work out from the tab which product the reader is using.
 *
 * A CLOSED VOCABULARY. An analysis may name only products listed here, and `validate-analysis.ts`
 * rejects anything else. Free-text product names would drift the way the 100 disclosure names
 * did (Part 4): "Google Maps", "Maps", "Google Maps Timeline" and "Timeline" for one thing.
 *
 * WHAT IS IN IT, measured rather than guessed (S4 log in `execution-docs/site-coverage-plan.md`):
 * a product is here when a corpus finding or summary names it, or the company's documents name it
 * three times or more. It is GRADED — it has matchers, and each multi-product analysis grades it —
 * when people use it as a website, so a tab can be on it. A product with no matchers (an operating
 * system, a phone, a watch, a browser) can still be named by a finding, which keeps that finding
 * out of every other product's view; it just never leads a page itself. The four companies are the
 * only ones in the corpus whose findings name more than a handful of their own products.
 *
 * WHAT IS LEFT OUT, deliberately: sister companies with policies of their own (LinkedIn and GitHub
 * under Microsoft, WhatsApp's site, Twitch and Audible under Amazon); country sites the corpus
 * does not cover (`google.co.in`, `amazon.in`); and products the documents barely name (Messenger
 * and Blogger twice, Google News once, Threads never).
 */

/**
 * One web address that means a product is in use. `host` is compared with the tab's hostname
 * after a leading `www.` is removed, and matches exactly — `google.com` is not `mail.google.com`,
 * whose root would otherwise pass for the Search homepage. `path` matches at a segment boundary:
 * `/maps` covers `/maps` and `/maps/place/…`, never `/mapsfoo`. `exact` limits it to that one path.
 */
type ProductMatcher = { host: string; path?: string; exact?: boolean };

type CatalogueProduct = {
  /** Unique across the whole catalogue, so an id alone names one product: the product's name, kebab-cased. */
  id: string;
  name: string;
  /** Empty for a product with no page of its own: findings can name it, but no tab resolves to it. */
  matchers: readonly ProductMatcher[];
};

type CatalogueCompany = {
  id: string;
  name: string;
  /**
   * The sites that resolve to this company. A document on one of them is one of the company's
   * policies across products, and a tab on one is either a product or a company page — never
   * nothing. These are also the sibling sites B2 adds to each such document's `domains` (S5).
   */
  domains: readonly string[];
  products: readonly CatalogueProduct[];
};

const named = (id: string, name: string): CatalogueProduct => ({ id, name, matchers: [] });

const PRODUCT_CATALOGUE: readonly CatalogueCompany[] = [
  {
    id: 'google',
    name: 'Google',
    domains: ['google.com', 'youtube.com'],
    products: [
      {
        id: 'google-search',
        name: 'Google Search',
        // The homepage is the search box. The root of any other subdomain is not.
        matchers: [
          { host: 'google.com', path: '/', exact: true },
          { host: 'google.com', path: '/search' },
        ],
      },
      {
        id: 'youtube',
        name: 'YouTube',
        matchers: [
          { host: 'youtube.com' },
          { host: 'm.youtube.com' },
          { host: 'music.youtube.com' },
          { host: 'studio.youtube.com' },
        ],
      },
      {
        id: 'google-maps',
        name: 'Google Maps',
        matchers: [{ host: 'google.com', path: '/maps' }, { host: 'maps.google.com' }],
      },
      { id: 'gmail', name: 'Gmail', matchers: [{ host: 'mail.google.com' }] },
      { id: 'google-drive', name: 'Google Drive', matchers: [{ host: 'drive.google.com' }] },
      { id: 'google-docs', name: 'Google Docs, Sheets and Slides', matchers: [{ host: 'docs.google.com' }] },
      { id: 'google-photos', name: 'Google Photos', matchers: [{ host: 'photos.google.com' }] },
      { id: 'google-calendar', name: 'Google Calendar', matchers: [{ host: 'calendar.google.com' }] },
      { id: 'google-meet', name: 'Google Meet', matchers: [{ host: 'meet.google.com' }] },
      { id: 'google-chat', name: 'Google Chat', matchers: [{ host: 'chat.google.com' }] },
      { id: 'google-voice', name: 'Google Voice', matchers: [{ host: 'voice.google.com' }] },
      { id: 'google-play', name: 'Google Play', matchers: [{ host: 'play.google.com' }] },
      { id: 'gemini', name: 'Gemini', matchers: [{ host: 'gemini.google.com' }] },
      { id: 'google-translate', name: 'Google Translate', matchers: [{ host: 'translate.google.com' }] },
      named('chrome', 'Chrome'),
      named('android', 'Android'),
      named('google-assistant', 'Google Assistant'),
      named('google-fi', 'Google Fi'),
      named('fitbit', 'Fitbit'),
      named('google-fit', 'Google Fit'),
      named('pixel', 'Pixel'),
      named('nest', 'Nest'),
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    domains: ['microsoft.com', 'bing.com', 'live.com', 'office.com', 'microsoft365.com', 'xbox.com', 'msn.com'],
    products: [
      { id: 'bing', name: 'Bing', matchers: [{ host: 'bing.com' }] },
      { id: 'copilot', name: 'Copilot', matchers: [{ host: 'copilot.microsoft.com' }] },
      {
        id: 'outlook',
        name: 'Outlook',
        matchers: [{ host: 'outlook.live.com' }, { host: 'outlook.office.com' }],
      },
      {
        id: 'microsoft-teams',
        name: 'Microsoft Teams',
        matchers: [{ host: 'teams.microsoft.com' }, { host: 'teams.live.com' }],
      },
      { id: 'onedrive', name: 'OneDrive', matchers: [{ host: 'onedrive.live.com' }] },
      {
        id: 'microsoft-365',
        name: 'Microsoft 365',
        matchers: [{ host: 'office.com' }, { host: 'microsoft365.com' }],
      },
      { id: 'xbox', name: 'Xbox', matchers: [{ host: 'xbox.com' }] },
      { id: 'msn', name: 'MSN', matchers: [{ host: 'msn.com' }] },
      {
        id: 'microsoft-family-safety',
        name: 'Microsoft Family Safety',
        matchers: [{ host: 'family.microsoft.com' }],
      },
      named('windows', 'Windows'),
      named('microsoft-edge', 'Microsoft Edge'),
      named('microsoft-store', 'Microsoft Store'),
      named('surface', 'Surface'),
      named('swiftkey', 'SwiftKey'),
      named('skype', 'Skype'),
      // The statement's own heading for Azure, Dynamics 365, Intune and the rest, where an
      // organisation's contract with Microsoft overrides the statement.
      named('microsoft-enterprise', 'Microsoft enterprise and developer products'),
    ],
  },
  {
    id: 'meta',
    name: 'Meta',
    domains: ['facebook.com', 'instagram.com', 'meta.ai'],
    products: [
      { id: 'facebook', name: 'Facebook', matchers: [{ host: 'facebook.com' }, { host: 'm.facebook.com' }] },
      { id: 'instagram', name: 'Instagram', matchers: [{ host: 'instagram.com' }] },
      { id: 'meta-ai', name: 'Meta AI', matchers: [{ host: 'meta.ai' }] },
      // WhatsApp keeps a policy of its own; Meta's names it for the accounts that link to it.
      named('whatsapp', 'WhatsApp'),
    ],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    domains: ['amazon.com', 'primevideo.com'],
    products: [
      // amazon.com IS the store: a page there that is not another product is shopping.
      { id: 'amazon-shopping', name: 'Amazon shopping', matchers: [{ host: 'amazon.com' }] },
      {
        id: 'prime-video',
        name: 'Prime Video',
        matchers: [{ host: 'primevideo.com' }, { host: 'amazon.com', path: '/gp/video' }],
      },
      { id: 'amazon-music', name: 'Amazon Music', matchers: [{ host: 'music.amazon.com' }] },
      { id: 'alexa', name: 'Alexa', matchers: [{ host: 'alexa.amazon.com' }] },
      { id: 'kindle', name: 'Kindle', matchers: [{ host: 'read.amazon.com' }] },
      named('amazon-devices', 'Amazon devices'),
      named('amazon-physical-stores', 'Amazon physical stores'),
      named('amazon-gift-cards', 'Amazon Gift Cards'),
    ],
  },
];

/** The products a page can resolve to, and so the ones each multi-product analysis grades. */
const gradedProducts = (company: CatalogueCompany): CatalogueProduct[] =>
  company.products.filter(product => product.matchers.length > 0);

const bareHost = (hostname: string): string =>
  hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');

const withinDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * The catalogue company a site belongs to, or null. Given an analysis's `domain`, this is what marks
 * a document multi-product: every document in the corpus on a catalogue company's site is that
 * company's policy across its products (the nine the bundle test pins).
 */
const catalogueCompanyForDomain = (domain: string): CatalogueCompany | null => {
  const host = bareHost(domain);
  if (!host) return null;
  return PRODUCT_CATALOGUE.find(company => company.domains.some(item => withinDomain(host, item))) ?? null;
};

const pathMatches = (pathname: string, matcher: ProductMatcher): boolean => {
  if (matcher.path === undefined) return true;
  if (matcher.exact) return pathname === matcher.path;
  const prefix = matcher.path.replace(/\/$/, '');
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
};

/** How specific a matcher is, so `google.com/maps` beats `amazon.com`-style host-only matchers. */
const specificity = (matcher: ProductMatcher) => (matcher.path?.length ?? 0) + (matcher.exact ? 0.5 : 0);

type ProductResolution = { company: CatalogueCompany; product: CatalogueProduct | null };

/**
 * A tab URL to the company and the product in use. `null` when the site is no catalogue company's;
 * `product: null` on a company page that is no product — an account page, the policy itself, the
 * root of a subdomain — where the panel shows the whole company and says so (B3). The most
 * specific matching address wins: `amazon.com/gp/video` is Prime Video, the rest of `amazon.com`
 * is shopping.
 */
const resolveProduct = (url: string): ProductResolution | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const company = catalogueCompanyForDomain(parsed.hostname);
  if (!company) return null;

  const host = bareHost(parsed.hostname);
  let best: { product: CatalogueProduct; score: number } | null = null;
  for (const product of company.products) {
    for (const matcher of product.matchers) {
      if (matcher.host !== host || !pathMatches(parsed.pathname, matcher)) continue;
      const score = specificity(matcher);
      if (!best || score > best.score) best = { product, score };
    }
  }

  return { company, product: best?.product ?? null };
};

// ── Product scoping on an analysis (B2) ──

type ProductScoping = {
  /**
   * `not_applicable`: not a catalogue company's document, and it names no products.
   * `missing`: a catalogue company's document with no products at all — written before products
   *   existed, and waiting to be re-analysed (S5), not wrong.
   * `complete`: every page product graded once, every tag the company's own.
   * `invalid`: anything else, with each problem named.
   */
  status: 'not_applicable' | 'missing' | 'complete' | 'invalid';
  problems: string[];
};

type Scoped = Pick<SitePolicyAnalysis, 'exposures' | 'availableActions' | 'productScopes'>;

const findingsOf = (analysis: Scoped) => [
  ...analysis.exposures.map((finding, i) => ({ path: `exposures[${i}]`, products: finding.products })),
  ...analysis.availableActions.map((finding, i) => ({ path: `availableActions[${i}]`, products: finding.products })),
];

/**
 * Whether an analysis's products hold to the catalogue — what `validate-analysis.ts` enforces on
 * the corpus. An id is judged against the DOCUMENT's company, not the whole catalogue: `xbox` on a
 * Google document is as wrong as an id that exists nowhere.
 */
const productScoping = (analysis: SitePolicyAnalysis): ProductScoping => {
  const company = catalogueCompanyForDomain(analysis.domain);
  const findings = findingsOf(analysis);
  const tagged = findings.filter(finding => finding.products.length > 0);

  if (!company) {
    if (tagged.length === 0 && analysis.productScopes.length === 0) return { status: 'not_applicable', problems: [] };
    return {
      status: 'invalid',
      problems: [`${analysis.domain} is not in the product catalogue, so nothing on it may name or grade a product`],
    };
  }

  if (tagged.length === 0 && analysis.productScopes.length === 0) return { status: 'missing', problems: [] };

  const own = new Set(company.products.map(product => product.id));
  const graded = gradedProducts(company).map(product => product.id);
  const problems: string[] = [];

  for (const finding of tagged) {
    const seen = new Set<string>();
    for (const id of finding.products) {
      if (!own.has(id)) problems.push(`${finding.path}.products: "${id}" is not a ${company.name} product`);
      if (seen.has(id)) problems.push(`${finding.path}.products: "${id}" is named twice`);
      seen.add(id);
    }
  }

  const scoped = analysis.productScopes.map(scope => scope.product);
  scoped.forEach((id, i) => {
    if (!graded.includes(id)) {
      problems.push(
        own.has(id)
          ? `productScopes[${i}]: "${id}" has no page of its own, so it is named, never graded`
          : `productScopes[${i}]: "${id}" is not a ${company.name} product`,
      );
    }
    if (scoped.indexOf(id) !== i) problems.push(`productScopes[${i}]: "${id}" is graded twice`);
  });
  for (const id of graded) {
    if (!scoped.includes(id)) problems.push(`productScopes: no grade for "${id}"`);
  }

  return problems.length > 0 ? { status: 'invalid', problems } : { status: 'complete', problems: [] };
};

/**
 * A run on the user's key: the prompt ASKS for the closed list, and this GUARANTEES it, as the
 * workflow does for confidence and absent disclosures. Ids that are not the company's own are
 * dropped, not the run — the user paid for it — and a finding whose only ids were dropped becomes
 * company-wide, which shows it on every product: the direction that hides nothing. Outside the
 * catalogue there are no products at all.
 */
const scopeToCatalogue = <T extends Scoped>(result: T, company: CatalogueCompany | null): T => {
  const own = new Set(company?.products.map(product => product.id) ?? []);
  const graded = new Set(company ? gradedProducts(company).map(product => product.id) : []);
  const keep = (ids: string[]) => [...new Set(ids.filter(id => own.has(id)))];

  const productScopes: ProductScope[] = [];
  for (const scope of result.productScopes) {
    if (graded.has(scope.product) && !productScopes.some(kept => kept.product === scope.product)) {
      productScopes.push(scope);
    }
  }

  return {
    ...result,
    exposures: result.exposures.map(finding => ({ ...finding, products: keep(finding.products) })),
    availableActions: result.availableActions.map(finding => ({ ...finding, products: keep(finding.products) })),
    productScopes,
  };
};

export {
  PRODUCT_CATALOGUE,
  gradedProducts,
  catalogueCompanyForDomain,
  resolveProduct,
  productScoping,
  scopeToCatalogue,
};
export type { ProductMatcher, CatalogueProduct, CatalogueCompany, ProductResolution, ProductScoping };
