import {
  ClauseReferenceSchema,
  ConcernCategorySchema,
  ConfidenceSchema,
  RiskLevelSchema,
  SeveritySchema,
} from '../schemas.js';
import { z } from 'zod';

/**
 * Site policy analysis — a deliberate SIBLING of the negotiable-contract schemas in
 * `../schemas.ts`, not a reuse.
 *
 * Site policies are contracts of adhesion: there is no counterparty to negotiate with, so
 * `NegotiationIdeaSchema` / `SuggestedEditSchema` / `MissingProtectionSchema` would produce
 * confidently useless output here ("negotiate Meta's content licence"). `availableActions`
 * replaces them, and carries an optional `deadline` — that is what powers the arbitration
 * opt-out clock.
 *
 * Primitives (`SeveritySchema`, `ConfidenceSchema`, `ClauseReferenceSchema`, `RiskLevelSchema`,
 * `ConcernCategorySchema`) are shared with the negotiable schemas.
 *
 * INVARIANTS (see execution-docs/site-policy-part1-client-corpus.md, AD-1 and AD-6):
 *  - No staleness field. The content hash IS the version; `analyzedAt` is provenance only.
 *  - No PII. These objects are published to a public CDN and will one day back a public
 *    library. Submitter identity stays in the submission queue and never lands here —
 *    retrofitting that means rewriting every object already published.
 *  - Self-describing. One object must be enough to render a standalone page with no
 *    extension context.
 */

export const SITE_POLICY_SCHEMA_VERSION = 1 as const;

/**
 * Document types the corpus actually found.
 *
 * The last four were added after the Part 3 capture: the original six had no value for
 * documents that turned out to be common and consequential — Know Your Customer and grievance
 * redressal notices in Indian finance, digital-asset risk disclosures, DMCA/copyright policies,
 * and the E-SIGN electronic-disclosure consent that US finance is legally required to surface
 * at signup and nowhere else.
 */
export const PolicyDocTypeSchema = z.enum([
  'terms',
  'privacy',
  'cookie',
  'eula',
  'acceptable_use',
  'data_processing',
  'regulatory_disclosure',
  'copyright',
  'program_terms',
  'esign_consent',
]);

/**
 * Verticals are TAGS, not buckets — a site carries every one that is true of it. Amazon is
 * ecommerce AND streaming AND payments AND an identity provider, and filing it as one thing
 * throws away most of what makes it interesting.
 *
 * `ecommerce_subscription` was split, because auto-renewal exposure is not an ecommerce
 * property: it belongs equally to streaming and SaaS. `ott_streaming` and `identity_provider`
 * are new — the first had been squatting in `ecommerce_subscription`, and the second had
 * nowhere to go at all (`social_ugc` would be wrong, since that rubric is content licence and
 * biometrics).
 */
export const VerticalSchema = z.enum([
  'finance_banking',
  'payments_fintech',
  'ecommerce',
  'subscription_autorenewal',
  'ott_streaming',
  'social_ugc',
  'identity_provider',
  'saas_productivity',
  'health_wellness',
  'other',
]);

/**
 * WHERE the document was presented. Footer-linked and signup-only are different exposure
 * classes: a document that appears only at signup is agreed to under pressure and never seen
 * again, and the corpus has to be able to say so.
 */
export const DocumentSurfaceSchema = z.enum(['footer', 'signup', 'checkout', 'in_app']);

/**
 * How a document's text was read (A5): the HTML the server sent (`raw`), or the page as JavaScript
 * built it once opened (`rendered`) — for a site that sends no policy text until its script runs.
 * The two are different readings of one document and need not hash alike, and a rendered page can
 * vary between loads, so only a raw read of a raw analysis may ever call a document changed.
 */
export const PolicyReadModeSchema = z.enum(['raw', 'rendered']);

export const DisclosureRegimeSchema = z.enum(['GLBA', 'CCPA', 'GDPR', 'COPPA', 'other']);
export const DisclosureStatusSchema = z.enum(['present', 'absent', 'not_applicable']);
export const ActionEffortSchema = z.enum(['low', 'medium', 'high']);
export const DeadlineKindSchema = z.enum(['relative_to_signup', 'absolute', 'none']);

/**
 * A product id from the catalogue (`products.ts`): `youtube`, `google-maps`, `bing`.
 *
 * A string here, and the closed list enforced where the list is known — `validate-analysis.ts` for
 * the corpus, `scopeToCatalogue` for a run on the user's key. As an enum, every product added to
 * the catalogue would make each older client reject, whole, any published object that names it:
 * the break Part 4 recorded for enums, repeated once per product.
 */
export const ProductIdSchema = z.string().min(1);

/** Something the user gave up by accepting. */
export const ExposureSchema = z.object({
  title: z.string().min(1),
  severity: SeveritySchema,
  category: ConcernCategorySchema,
  whatItMeans: z.string().min(1),
  whyItMatters: z.string().min(1),
  /**
   * The products this applies to (B2): a person using only another of the company's products is
   * not exposed to it. EMPTY MEANS COMPANY-WIDE — anyone using any product the document governs is.
   * Only a document the catalogue marks multi-product may name any; on every other document this is
   * empty, and a document written before products existed reads the same way.
   */
  products: z.array(ProductIdSchema).default([]),
  reference: ClauseReferenceSchema.optional(),
});

/**
 * Something the user can still do about it. Replaces `negotiationIdeas` — the verb changes
 * from "ask for" to "know / opt out / avoid / leave".
 */
export const AvailableActionSchema = z.object({
  action: z.string().min(1),
  howTo: z.string().min(1),
  effort: ActionEffortSchema,
  /** As on an exposure: the products whose use this action is about, empty for company-wide. */
  products: z.array(ProductIdSchema).default([]),
  deadline: z
    .object({
      kind: DeadlineKindSchema,
      days: z.number().int().positive().optional(),
      description: z.string().min(1),
    })
    .optional(),
  reference: ClauseReferenceSchema.optional(),
});

/**
 * Absence of a legally required disclosure is a harder fact than any severity rating, and it
 * is something a pure clause-reader structurally cannot produce — it depends on knowing what
 * SHOULD be present for this vertical.
 */
export const RequiredDisclosureSchema = z.object({
  name: z.string().min(1),
  regime: DisclosureRegimeSchema,
  status: DisclosureStatusSchema,
  note: z.string().min(1),
});

/**
 * Severity only means something relative to a peer norm — and under multi-valued tags, "peer"
 * is ambiguous. A clause can be unremarkable among streaming peers and an outlier among
 * fintech peers. That is better signal than a single bucket gave, but only if the object says
 * which set the share was computed against.
 *
 * `peerCount` travels with it because a share over four peers is not evidence. No `peerShare`
 * is published below the minimum-N floor of 10.
 */
export const PeerDeviationSchema = z.object({
  clause: z.string().min(1),
  peerVertical: VerticalSchema,
  peerCount: z.number().int().positive(),
  peerShare: z.number().min(0).max(1),
  note: z.string().min(1),
});

/**
 * What a person using ONE product faces from a multi-product document (B2): the company-wide
 * findings plus that product's own, graded and summarised for them by the analyst. The panel on
 * `google.com/search` leads with Google Search's entry, not with a grade Fitbit's health data
 * pushed up — and not with a grade a formula derived from the findings, which would be the panel
 * inventing a judgement the analyst never made.
 *
 * One entry for each product a page can resolve to (a catalogue product with matchers), and no
 * others: a product with no page of its own never leads, so a grade for it is work nobody sees.
 */
export const ProductScopeSchema = z.object({
  product: ProductIdSchema,
  riskLevel: RiskLevelSchema,
  summary: z.string().min(1),
});

export const SitePolicyAnalysisSchema = z.object({
  schemaVersion: z.literal(SITE_POLICY_SCHEMA_VERSION),
  contentHash: z.string().length(64),
  /** Primary site. `domains` carries the full set when one document governs several. */
  domain: z.string().min(1),
  /**
   * Every site this document governs. One document can serve many: Disney's terms cover both
   * `disneyplus.com` and `hotstar.com`, and a single `domain` string renders the wrong site
   * name on a standalone page for all but one of them.
   */
  domains: z.array(z.string().min(1)).default([]),
  docType: PolicyDocTypeSchema,
  verticals: z.array(VerticalSchema).min(1),
  /** Where this document was presented to the user. */
  surfaces: z.array(DocumentSurfaceSchema).default([]),
  sourceUrl: z.string().url(),
  promptVersion: z.string().min(1),
  /**
   * Which normalizer produced `contentHash`. Without it, a published object cannot say whether
   * its hash is still reproducible after a normalizer change — and the hash is the version.
   */
  normalizerVersion: z.string().min(1),
  /**
   * How the text `contentHash` is taken over was read (A5). Defaults to `raw`, which every analysis
   * made before S3 of the site coverage work was: an optional field with a default, so no published
   * analysis changes meaning and `schemaVersion` does not move.
   */
  readMode: PolicyReadModeSchema.default('raw'),
  model: z.string().min(1),
  analyzedAt: z.string().datetime(),
  /** The whole document, across every product it governs. */
  summary: z.string().min(1),
  riskLevel: RiskLevelSchema,
  confidence: ConfidenceSchema,
  /**
   * Per-product grades, on a document the catalogue marks multi-product; empty on every other.
   * Empty on a multi-product document means not yet scoped, and the panel shows the whole company.
   *
   * WHY `schemaVersion` DOES NOT MOVE (S4 of the site coverage work). This and `products` on each
   * finding are additions with defaults, as `readMode` was in S3. A client from before them strips
   * the keys and reads the document exactly as it did; this one reads an object from before them
   * as unscoped, which is what it is. Nothing either side reads changes meaning, and the version
   * exists to say when it would. It would move — and there are no installed users to protect if it
   * does — the day a field changes type or an old reading turns false.
   */
  productScopes: z.array(ProductScopeSchema).default([]),
  exposures: z.array(ExposureSchema).default([]),
  availableActions: z.array(AvailableActionSchema).default([]),
  requiredDisclosures: z.array(RequiredDisclosureSchema).default([]),
  peerDeviation: z.array(PeerDeviationSchema).default([]),
});

/**
 * The keys a model writes; everything else on the object is provenance the caller fills from the
 * capture (Part 6, S1 — see `prompt.ts`). One definition for the run on the user's key, the
 * calibration script and the tests, picked off the published schema so the keys and their element
 * shapes cannot drift from what storage and the panel read.
 */
export const SitePolicyModelResponseSchema = SitePolicyAnalysisSchema.pick({
  summary: true,
  riskLevel: true,
  confidence: true,
  productScopes: true,
  exposures: true,
  availableActions: true,
  requiredDisclosures: true,
});

/** Per-domain freshness probe served at `/d/{sha256(domain)}.json`. */
export const PolicyDomainIndexSchema = z.object({
  hashes: z.array(z.string().length(64)).default([]),
  promptVersion: z.string().min(1),
});

/** Bookkeeping for the bounded `chrome.storage.local` analysis cache. */
export const PolicyCacheEntrySchema = z.object({
  hash: z.string().length(64),
  bytes: z.number().int().nonnegative(),
  lastAccessedAt: z.number().int().nonnegative(),
});

export const PolicyCacheIndexSchema = z.array(PolicyCacheEntrySchema);

/**
 * Cached per-domain freshness probe, plus the ETag that makes the next check a `304`.
 *
 * `domainHash` is `sha256(domain)`, matching the CDN path — the plaintext domain is never
 * written here, so the cache is not a browsing-history log at rest either.
 */
export const PolicyDomainCacheEntrySchema = z.object({
  domainHash: z.string().length(64),
  etag: z.string().nullable().default(null),
  hashes: z.array(z.string().length(64)).default([]),
  promptVersion: z.string().min(1),
  checkedAt: z.number().int().nonnegative(),
});

export const PolicyDomainCacheSchema = z.array(PolicyDomainCacheEntrySchema);
