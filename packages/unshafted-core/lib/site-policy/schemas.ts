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

export const DisclosureRegimeSchema = z.enum(['GLBA', 'CCPA', 'GDPR', 'COPPA', 'other']);
export const DisclosureStatusSchema = z.enum(['present', 'absent', 'not_applicable']);
export const ActionEffortSchema = z.enum(['low', 'medium', 'high']);
export const DeadlineKindSchema = z.enum(['relative_to_signup', 'absolute', 'none']);

/** Something the user gave up by accepting. */
export const ExposureSchema = z.object({
  title: z.string().min(1),
  severity: SeveritySchema,
  category: ConcernCategorySchema,
  whatItMeans: z.string().min(1),
  whyItMatters: z.string().min(1),
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
  model: z.string().min(1),
  analyzedAt: z.string().datetime(),
  summary: z.string().min(1),
  riskLevel: RiskLevelSchema,
  confidence: ConfidenceSchema,
  exposures: z.array(ExposureSchema).default([]),
  availableActions: z.array(AvailableActionSchema).default([]),
  requiredDisclosures: z.array(RequiredDisclosureSchema).default([]),
  peerDeviation: z.array(PeerDeviationSchema).default([]),
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
