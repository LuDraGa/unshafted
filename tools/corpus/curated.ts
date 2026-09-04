/**
 * The curated set — hand-verified, one entry per real policy document.
 *
 * WHY THIS FILE EXISTS. `choosePolicyUrl` is unreliable (see part3 doc, finding 1): it selected
 * Cloudflare's privacy policy as DoorDash's, hotel search-results pages as Booking's cookie,
 * EULA and DPA policies, OneTrust's product marketing page as Zoom's cookie policy, and Bank of
 * America's CHILDREN'S privacy notice as its main one. Analysing the raw capture would grade
 * those documents and attribute the result to the wrong company.
 *
 * So every entry below was read against its URL, length and anchor text and kept deliberately.
 * Selection is by CONTENT HASH, not URL, because the hash is the identity (AD-1) and a URL can
 * carry tracking parameters that differ between captures.
 *
 * `docType` here is the HAND-ASSIGNED type, which sometimes overrides `guessDocType` and
 * sometimes uses a value added to `PolicyDocTypeSchema` because this corpus needed it:
 *  - dropbox.com `/terms` was typed `privacy` by the shipped classifier. It is the terms.
 *  - hdfcbank.com `/privacy-policy` was typed `cookie`. It is the privacy policy.
 *
 * `note` records why an entry is unusual, so the analysis session inherits the caveat rather
 * than rediscovering it.
 */

import type { PolicyDocType } from '../../packages/unshafted-core/lib/site-policy/types.js';

export type CuratedDoc = {
  /** First 8 hex characters of the document's contentHash — unique within this capture. */
  hash8: string;
  docType: PolicyDocType;
  note?: string;
};

export const CURATED: Record<string, CuratedDoc[]> = {
  'amazon.com': [
    { hash8: '2d74ae32', docType: 'terms' },
    { hash8: '993ed512', docType: 'privacy' },
    { hash8: 'f44a02e5', docType: 'cookie' },
  ],
  'americanexpress.com': [
    { hash8: '1a6484c7', docType: 'privacy' },
    { hash8: '88622777', docType: 'terms', note: 'Website Rules and Regulations — the closest thing Amex India publishes to site terms.' },
    { hash8: 'a75dfac1', docType: 'regulatory_disclosure', note: 'Know Your Customer disclosure — RBI-mandated.' },
    { hash8: '887b98bf', docType: 'regulatory_disclosure', note: 'Customer Complaint / Grievance Redressal Policy — statutory in India.' },
  ],
  'apple.com': [
    { hash8: '1cd58c45', docType: 'terms' },
    { hash8: '0002e2ff', docType: 'privacy' },
  ],
  'bankofamerica.com': [
    { hash8: '8d8c3508', docType: 'privacy', note: 'The main Online Privacy Notice. The chooser picked the CHILDREN’S notice instead.' },
    { hash8: '20993aec', docType: 'regulatory_disclosure', note: 'CCPA disclosure.' },
  ],
  'booking.com': [
    { hash8: 'fc60f015', docType: 'terms' },
    { hash8: '8e40cf40', docType: 'privacy' },
  ],
  'canva.com': [
    { hash8: 'c1c703a5', docType: 'terms' },
    { hash8: '15da0f5a', docType: 'privacy' },
  ],
  'chase.com': [
    { hash8: '7a521f89', docType: 'terms' },
    { hash8: '7d63704b', docType: 'privacy' },
  ],
  'coinbase.com': [
    { hash8: '60c77d35', docType: 'privacy', note: 'The real privacy policy. The chooser picked a legal index page.' },
    { hash8: '71f60eed', docType: 'cookie' },
    { hash8: 'dee82681', docType: 'regulatory_disclosure', note: 'Digital Asset Disclosures — crypto-specific risk disclosure.' },
  ],
  'ebay.com': [
    { hash8: '530c8a6d', docType: 'privacy' },
    { hash8: '63c24cb2', docType: 'cookie' },
    { hash8: 'e33c29e5', docType: 'terms', note: 'eBay Payments terms. The general User Agreement was not among the discovered links.' },
    { hash8: '3df9b323', docType: 'regulatory_disclosure', note: 'US state privacy disclosures.' },
  ],
  'facebook.com': [
    { hash8: '3fe6bc5d', docType: 'privacy' },
    { hash8: '47c4b597', docType: 'cookie' },
  ],
  'flipkart.com': [
    { hash8: '6bc14ba2', docType: 'terms' },
    { hash8: '263a86c0', docType: 'privacy' },
  ],
  'google.com': [
    { hash8: 'c60d3001', docType: 'terms' },
    { hash8: 'b7688f54', docType: 'privacy' },
  ],
  'hdfcbank.com': [
    { hash8: 'b48d44d5', docType: 'privacy', note: 'Typed `cookie` by the shipped classifier; it is the privacy policy.' },
    { hash8: '32af9957', docType: 'terms', note: 'Website usage terms. The chooser picked a 1.5M-character page that is the whole site.' },
  ],
  'hotstar.com': [
    { hash8: '24580b81', docType: 'terms', note: 'Also serves disneyplus.com from an Indian egress — one document, two sites.' },
    { hash8: '63e632c5', docType: 'privacy', note: 'Also serves disneyplus.com from an Indian egress.' },
  ],
  'instagram.com': [{ hash8: 'ab642cdd', docType: 'privacy' }],
  'linkedin.com': [
    { hash8: '8efdb100', docType: 'terms' },
    { hash8: '76c283b0', docType: 'privacy' },
    { hash8: '4e98cb9d', docType: 'cookie' },
    { hash8: '2915eb9a', docType: 'acceptable_use' },
    { hash8: '66aadd77', docType: 'copyright', note: 'DMCA / copyright process.' },
  ],
  'makemytrip.com': [
    { hash8: '7292c997', docType: 'terms' },
    { hash8: '1e80ec13', docType: 'privacy' },
    { hash8: 'cf76ce9c', docType: 'cookie' },
  ],
  'microsoft.com': [
    { hash8: 'afedc4d1', docType: 'privacy', note: 'The full Privacy Statement. The chooser picked the Canadian landing page.' },
  ],
  'netflix.com': [
    { hash8: 'e14eef68', docType: 'terms' },
    { hash8: '80a9c1b3', docType: 'privacy' },
  ],
  'openai.com': [
    { hash8: 'f3968cc2', docType: 'terms' },
    { hash8: '83d53ffe', docType: 'privacy', note: 'The real privacy policy. The chooser picked a marketing page.' },
    { hash8: 'f57fcef8', docType: 'cookie' },
  ],
  'paypal.com': [
    { hash8: 'dc62c4d1', docType: 'terms' },
    { hash8: '4f437c00', docType: 'privacy' },
  ],
  'paytm.com': [
    { hash8: '0d82e1a0', docType: 'terms', note: '294k characters — the page carries every tab of terms at once.' },
    { hash8: '69235363', docType: 'privacy' },
  ],
  'phonepe.com': [{ hash8: '041dfb8b', docType: 'privacy' }],
  'reddit.com': [{ hash8: '573a08ca', docType: 'privacy' }],
  'robinhood.com': [
    { hash8: '71e23909', docType: 'privacy' },
    { hash8: '5de52f53', docType: 'privacy', note: 'Robinhood Money privacy statement — separate entity, separate notice.' },
  ],
  'snapchat.com': [
    { hash8: '01af0ece', docType: 'terms', note: 'The real Terms of Service. The chooser picked the geofilter terms.' },
    { hash8: '7dcf6330', docType: 'privacy', note: 'The real Privacy Policy. The chooser picked the children’s policy.' },
    { hash8: 'd1b14d20', docType: 'cookie' },
  ],
  'stripe.com': [
    { hash8: 'fd42eb7f', docType: 'privacy' },
    { hash8: '665e157e', docType: 'cookie' },
    { hash8: '9379c60e', docType: 'acceptable_use', note: 'Restricted businesses list — functions as an acceptable-use policy.' },
  ],
  'tiktok.com': [
    { hash8: '90d6bf47', docType: 'terms' },
    { hash8: '01beb0eb', docType: 'privacy' },
    { hash8: 'e853637b', docType: 'copyright' },
  ],
  'uber.com': [
    { hash8: '7db58935', docType: 'terms' },
    { hash8: '9181c896', docType: 'privacy' },
  ],
  'walmart.com': [
    { hash8: 'f5977930', docType: 'terms' },
    { hash8: 'b8f08b0e', docType: 'privacy' },
    { hash8: 'ea6a1b86', docType: 'regulatory_disclosure', note: 'California privacy rights.' },
  ],
  'x.com': [
    { hash8: 'e3c3ba23', docType: 'terms' },
    { hash8: '1ec4c95e', docType: 'privacy' },
    { hash8: '52809d7d', docType: 'cookie' },
  ],
  'zerodha.com': [
    { hash8: 'da51e355', docType: 'terms' },
    { hash8: '160a8f6a', docType: 'privacy' },
  ],
  'zomato.com': [
    { hash8: '13137974', docType: 'terms' },
    { hash8: 'a104baa0', docType: 'privacy' },
    { hash8: 'b2850a0a', docType: 'cookie' },
  ],
  'zoom.us': [
    { hash8: 'f57c6574', docType: 'terms' },
    { hash8: 'bc86ac55', docType: 'privacy' },
    { hash8: '3bf2cd88', docType: 'cookie', note: 'The chooser picked onetrust.com’s product marketing page instead.' },
  ],

  // Deliberately absent, with reasons — an empty entry is a finding, not an oversight:
  //   capitalone.com  — only a 4k hub page was reachable, not the privacy policy itself
  //   doordash.com    — terms captured, but the chooser's privacy pick was Cloudflare's policy
  //   dropbox.com     — see below; privacy policy was never discovered
  //   airbnb, cash.app, shein, spotify, temu — zero policy links found on the homepage
  //   adobe, icicibank, myntra, swiggy, whatsapp — policies are JS-rendered, unreachable
  //   youtube.com     — never captured
  'doordash.com': [{ hash8: '51e9b28e', docType: 'terms' }],
  'dropbox.com': [
    { hash8: '57d58481', docType: 'terms', note: 'Typed `privacy` by the shipped classifier; the URL and content are the terms.' },
    { hash8: 'a9dbfa29', docType: 'cookie' },
  ],
};
