/**
 * The capture set — 50 registrable domains, multi-tagged.
 *
 * SELECTION RULE, written down before selecting so the set is defensible rather than vibes:
 *
 *  1. Adhesion frequency, not market cap. An ordinary person plausibly holds an account here or
 *     has clicked accept. That is the population whose exposure this corpus is about.
 *  2. Every tag carries >= 6 members, so a peer baseline is computable once analysis exists.
 *     Tagging is free; the STATISTIC is what needs a floor (see part3 doc, D1).
 *  3. Geographic mix ~60% US / ~22% India / rest global-but-serving-both, matching where the
 *     product expects users and where capture egress actually sits.
 *  4. Within each tag, deliberate spread: some members have public regulatory history on their
 *     terms, billing or data handling, some have none. That is a SELECTION input only — no
 *     judgement about any company is recorded in the manifest, and none is implied here.
 *  5. Excluded: sites whose policies sit behind a login, and multi-tenant hosts (a policy on a
 *     public suffix would be attributed to every unrelated tenant beneath it — see
 *     `MULTI_TENANT_SUFFIXES` in unshafted-core).
 *
 * Meta and Google properties deliberately appear as separate sites while sharing documents.
 * That exercises the one-document-many-sites case for free (part3 doc, S6).
 */

/**
 * Verticals are TAGS, not buckets. A site is several things at once, and forcing one label per
 * site throws away most of what makes a site interesting: Amazon is ecommerce AND streaming AND
 * payments AND an identity provider.
 *
 * Capture-side vocabulary, deliberately NOT the shipped `VerticalSchema` — that enum is a single
 * value per analysis and lacks OTT and identity-provider. Reconciling the two is an analysis-
 * session decision; see part3 doc, "Schema consequences".
 */
export type SiteTag =
  | 'finance_banking'
  | 'payments_fintech'
  | 'ecommerce'
  | 'subscription_autorenewal'
  | 'ott_streaming'
  | 'social_ugc'
  | 'identity_provider'
  | 'saas';

export type Market = 'us' | 'in' | 'global';

export type SiteSpec = {
  /** Registrable domain. Capture starts at `https://{domain}/`. */
  domain: string;
  tags: SiteTag[];
  market: Market;
};

export const SITES: SiteSpec[] = [
  // ── Ecommerce / marketplaces / delivery ──
  { domain: 'amazon.com', tags: ['ecommerce', 'subscription_autorenewal', 'ott_streaming', 'identity_provider', 'payments_fintech'], market: 'us' },
  { domain: 'walmart.com', tags: ['ecommerce', 'subscription_autorenewal'], market: 'us' },
  { domain: 'ebay.com', tags: ['ecommerce', 'payments_fintech'], market: 'us' },
  { domain: 'flipkart.com', tags: ['ecommerce'], market: 'in' },
  { domain: 'myntra.com', tags: ['ecommerce'], market: 'in' },
  { domain: 'shein.com', tags: ['ecommerce'], market: 'global' },
  { domain: 'temu.com', tags: ['ecommerce'], market: 'global' },
  { domain: 'doordash.com', tags: ['ecommerce', 'subscription_autorenewal'], market: 'us' },
  { domain: 'swiggy.com', tags: ['ecommerce', 'subscription_autorenewal'], market: 'in' },
  { domain: 'zomato.com', tags: ['ecommerce', 'subscription_autorenewal'], market: 'in' },
  { domain: 'uber.com', tags: ['ecommerce', 'payments_fintech'], market: 'global' },
  { domain: 'airbnb.com', tags: ['ecommerce', 'payments_fintech'], market: 'global' },
  { domain: 'booking.com', tags: ['ecommerce'], market: 'global' },
  { domain: 'makemytrip.com', tags: ['ecommerce'], market: 'in' },

  // ── Consumer finance / banking / brokerage ──
  { domain: 'chase.com', tags: ['finance_banking'], market: 'us' },
  { domain: 'bankofamerica.com', tags: ['finance_banking'], market: 'us' },
  { domain: 'capitalone.com', tags: ['finance_banking'], market: 'us' },
  { domain: 'americanexpress.com', tags: ['finance_banking', 'payments_fintech'], market: 'us' },
  { domain: 'robinhood.com', tags: ['finance_banking', 'payments_fintech'], market: 'us' },
  { domain: 'coinbase.com', tags: ['finance_banking', 'payments_fintech'], market: 'us' },
  { domain: 'hdfcbank.com', tags: ['finance_banking'], market: 'in' },
  { domain: 'icicibank.com', tags: ['finance_banking'], market: 'in' },
  { domain: 'zerodha.com', tags: ['finance_banking'], market: 'in' },

  // ── Payments / wallets ──
  { domain: 'stripe.com', tags: ['payments_fintech', 'saas'], market: 'global' },
  { domain: 'paypal.com', tags: ['payments_fintech', 'finance_banking'], market: 'us' },
  { domain: 'cash.app', tags: ['payments_fintech'], market: 'us' },
  { domain: 'phonepe.com', tags: ['payments_fintech'], market: 'in' },
  { domain: 'paytm.com', tags: ['payments_fintech', 'finance_banking'], market: 'in' },

  // ── OTT / streaming ──
  { domain: 'netflix.com', tags: ['ott_streaming', 'subscription_autorenewal'], market: 'global' },
  { domain: 'spotify.com', tags: ['ott_streaming', 'subscription_autorenewal'], market: 'global' },
  { domain: 'disneyplus.com', tags: ['ott_streaming', 'subscription_autorenewal'], market: 'us' },
  { domain: 'hotstar.com', tags: ['ott_streaming', 'subscription_autorenewal'], market: 'in' },

  // ── Social / UGC ──
  { domain: 'facebook.com', tags: ['social_ugc', 'identity_provider'], market: 'global' },
  { domain: 'instagram.com', tags: ['social_ugc'], market: 'global' },
  { domain: 'whatsapp.com', tags: ['social_ugc'], market: 'global' },
  { domain: 'x.com', tags: ['social_ugc', 'identity_provider'], market: 'global' },
  { domain: 'reddit.com', tags: ['social_ugc'], market: 'us' },
  { domain: 'linkedin.com', tags: ['social_ugc', 'saas'], market: 'global' },
  { domain: 'snapchat.com', tags: ['social_ugc'], market: 'us' },
  { domain: 'tiktok.com', tags: ['social_ugc', 'ott_streaming'], market: 'global' },
  { domain: 'youtube.com', tags: ['social_ugc', 'ott_streaming'], market: 'global' },

  // ── Identity providers / platform accounts ──
  { domain: 'google.com', tags: ['identity_provider', 'saas', 'payments_fintech'], market: 'global' },
  { domain: 'apple.com', tags: ['identity_provider', 'ott_streaming', 'ecommerce', 'payments_fintech'], market: 'global' },
  { domain: 'microsoft.com', tags: ['identity_provider', 'saas'], market: 'global' },

  // ── SaaS / productivity ──
  { domain: 'adobe.com', tags: ['saas', 'subscription_autorenewal'], market: 'us' },
  { domain: 'openai.com', tags: ['saas', 'subscription_autorenewal'], market: 'us' },
  { domain: 'dropbox.com', tags: ['saas', 'subscription_autorenewal'], market: 'us' },
  { domain: 'zoom.us', tags: ['saas', 'subscription_autorenewal'], market: 'us' },
  { domain: 'canva.com', tags: ['saas', 'subscription_autorenewal'], market: 'global' },
];

/** Tag member counts — the minimum-N gate operates on these, later, at publish time. */
export const tagCounts = (): Record<SiteTag, number> => {
  const counts = {} as Record<SiteTag, number>;
  for (const site of SITES) {
    for (const tag of site.tags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
};
