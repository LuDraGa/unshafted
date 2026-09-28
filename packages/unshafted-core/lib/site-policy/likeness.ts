import { POLICY_LINK_PATTERN } from './discover.js';
import { extractPolicyRegion, regionToText } from './normalize.js';
import type { PolicyCandidate } from './discover.js';

/**
 * Is this page a policy document, a hub that lists policy documents, or neither? (A3, F3/F4)
 *
 * "A policy" used to mean 400 normalized characters, so a legal hub, a help-centre landing page or
 * a navigation-heavy shell all passed — and the panel offered the list of documents for analysis
 * instead of the documents on it. Figma's footer carries one link, "Legal and privacy", to exactly
 * such a hub.
 *
 * DESIGNED AGAINST REAL PAGES, 2026-09-28, not in the abstract. Measured over the region the
 * normalizer reads (so the judgement and the hash see the same text):
 *
 *   - the 83 analysed corpus documents: at least 1,610 characters of prose (Coinbase's digital-asset
 *     disclosures, a page of short blocks); the median is 22,863;
 *   - 20 legal hubs and landing pages (Figma, Postman, Vercel, Stripe, Apple, Microsoft, Google,
 *     GitHub, Heroku, Mozilla, Mistral's legal centre, iubenda's short-form summary…): at most 991
 *     (Microsoft's), and every one of them links on to policy documents.
 *
 * PROSE is text in blocks of 200 characters or more that are not headings: the paragraphs a
 * document is made of and a list of links is not. Link density, legal vocabulary and a page naming
 * itself ("this policy") were measured too, and none separated anything prose did not: about one
 * real document in ten never names itself, and a news article or an FAQ about privacy uses the
 * vocabulary as freely as a policy does. So this does NOT tell a policy from other prose — a
 * Reuters article with "privacy" in its headline, or Ola's FAQ page, still reads as a document.
 * That is a typing and ranking problem upstream, recorded in the plan doc, not something to guess
 * at here.
 */

/**
 * Prose a document has and a hub does not. Between the measured edges — 991 for the wordiest hub,
 * 1,610 for the sparsest analysed document — with room on both sides.
 */
const MIN_DOCUMENT_PROSE_CHARS = 1_300;

/** A block this long, and not a heading, is a paragraph rather than a label or a link. */
const MIN_PROSE_BLOCK_CHARS = 200;

type PolicyPageKind =
  /** Enough prose to be the document itself. */
  | 'document'
  /** Not a document, but it links on to policy documents: follow it (one hop). */
  | 'hub'
  /** Neither: an app shell, an error page, a page that exists only after JavaScript runs. */
  | 'shell';

type PolicyPageJudgement = {
  kind: PolicyPageKind;
  proseChars: number;
  /** The policy links in the page's body, as a discovery candidate would carry them. */
  links: PolicyCandidate[];
};

const HREF_PATTERN = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Policy links in a region of HTML: body links only, so a site-wide footer never counts. */
const policyLinksIn = (region: string): PolicyCandidate[] => {
  const links = new Map<string, PolicyCandidate>();
  for (const match of region.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attributes = match[1] ?? '';
    const href = (
      HREF_PATTERN.exec(attributes)
        ?.slice(1)
        .find(value => value !== undefined) ?? ''
    ).trim();
    if (!href || href.startsWith('#') || /^(?:javascript|mailto|tel):/i.test(href)) continue;
    const text = regionToText(match[2] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!POLICY_LINK_PATTERN.test(text) && !POLICY_LINK_PATTERN.test(href)) continue;
    if (!links.has(href)) links.set(href, { href, text, inFooterRegion: false });
  }
  return [...links.values()];
};

/** Characters of prose in normalized text: non-heading blocks of `MIN_PROSE_BLOCK_CHARS` or more. */
const proseCharsIn = (text: string): number =>
  text
    .split('\n')
    .map(block => block.trim())
    .filter(block => block.length >= MIN_PROSE_BLOCK_CHARS && !block.startsWith('#'))
    .reduce((sum, block) => sum + block.length, 0);

const judgePolicyPage = (html: string): PolicyPageJudgement => {
  if (!html || !html.trim()) return { kind: 'shell', proseChars: 0, links: [] };

  const { region } = extractPolicyRegion(html);
  const proseChars = proseCharsIn(regionToText(region));
  const links = policyLinksIn(region);

  if (proseChars >= MIN_DOCUMENT_PROSE_CHARS) return { kind: 'document', proseChars, links };
  return { kind: links.length > 0 ? 'hub' : 'shell', proseChars, links };
};

export { judgePolicyPage, MIN_DOCUMENT_PROSE_CHARS };
export type { PolicyPageKind, PolicyPageJudgement };
