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

export const PolicyDocTypeSchema = z.enum([
  'terms',
  'privacy',
  'cookie',
  'eula',
  'acceptable_use',
  'data_processing',
]);

export const VerticalSchema = z.enum([
  'finance_banking',
  'payments_fintech',
  'ecommerce_subscription',
  'social_ugc',
  'health_wellness',
  'saas_productivity',
  'other',
]);

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

/** Severity only means something relative to a vertical's norm. */
export const PeerDeviationSchema = z.object({
  clause: z.string().min(1),
  peerShare: z.number().min(0).max(1),
  note: z.string().min(1),
});

export const SitePolicyAnalysisSchema = z.object({
  schemaVersion: z.literal(SITE_POLICY_SCHEMA_VERSION),
  contentHash: z.string().length(64),
  domain: z.string().min(1),
  docType: PolicyDocTypeSchema,
  vertical: VerticalSchema,
  sourceUrl: z.string().url(),
  promptVersion: z.string().min(1),
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
