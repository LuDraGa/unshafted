import { SitePolicyAnalysisSchema } from './schemas.js';
import { z } from 'zod';
import type { PolicyDocType } from './types.js';

/**
 * An analysis the USER ran, on their own key — not one we published (Part 6, S2).
 *
 * WHY THIS IS A WRAPPER AND NOT A FIELD ON `SitePolicyAnalysisSchema`.
 *
 * That schema describes a *published* object: bundled, content-addressed, CDN-served, carrying
 * `promptVersion` and `normalizerVersion` as provenance the corpus stands behind. Adding an
 * `origin: 'corpus' | 'local'` discriminator to it would mean every consumer — bundle loader,
 * seed, index builder, the panel, AD-6's future public library — has to remember to check a field
 * before trusting the object. One forgotten check and the distinction is silently gone, on a
 * product whose entire claim is that it never says more than it verified.
 *
 * Wrapping instead makes the mistake unrepresentable. The inner shape is identical, so the panel
 * reuses `WorstRisk`, `OneThing` and `DocumentCard` untouched — but a `LocalPolicyAnalysis` cannot
 * reach a corpus code path, because it is not that type.
 *
 * The badge does not light for these (S3), and they are never bundled, submitted or published.
 */

export const LocalAnalysisProvenanceSchema = z.object({
  /** When the user ran it. Distinct from `analysis.analyzedAt`, which the model reports. */
  ranAt: z.string().datetime(),
  provider: z.enum(['openrouter', 'openai']),
  /** Whatever the user has configured. Rendered verbatim in the attribution line (S3). */
  model: z.string().min(1),
  /**
   * `site-policy-prompt-v1`, never `adhesion-rubric-v1` (S4). That string is a claim about an
   * Opus pass over the complete normalized text, hand-validated against the schema. A possibly
   * excerpted run through an arbitrary model is a different process, and sharing the version
   * would make the corpus's own provenance field meaningless the first time the two met.
   */
  promptVersion: z.string().min(1),
  /**
   * True when the document exceeded the model's character budget and only an excerpt was read.
   * Forces `confidence` to `medium` at write time (S6) — the corpus rule about incomplete
   * captures, applied to the case it was written for.
   */
  excerpted: z.boolean(),
  /** Characters in the full normalized document, before any excerpting. */
  sourceChars: z.number().int().nonnegative(),
});

export const LocalPolicyAnalysisSchema = z.object({
  analysis: SitePolicyAnalysisSchema,
  provenance: LocalAnalysisProvenanceSchema,
});

export type LocalAnalysisProvenance = z.infer<typeof LocalAnalysisProvenanceSchema>;
export type LocalPolicyAnalysis = z.infer<typeof LocalPolicyAnalysisSchema>;

/** The prompt this milestone ships. See S4 for why it may never borrow the corpus's version. */
export const SITE_POLICY_PROMPT_VERSION = 'site-policy-prompt-v1';

/**
 * Per-document character budget for a local run.
 *
 * Sits above `DEEP_ANALYSIS_CHAR_LIMIT` (42k) because a policy document is one continuous
 * instrument rather than a contract the user is a party to, and cutting it costs more. It is
 * still far below what real documents run to — Part 4 counted one at 213,097 characters — so the
 * excerpt path is the common case, not the exception, and S6 requires it be disclosed before the
 * user spends anything.
 */
export const SITE_POLICY_ANALYSIS_CHAR_LIMIT = 60_000;

// ── Service-worker messages (the run happens there, not in the panel) ──

/**
 * The panel captures the text and hands it over; the service worker makes the call.
 *
 * A side panel is closed by the user at will, and closing it would kill an in-flight `fetch` and
 * lose an analysis they paid for. `service-worker-analysis-refactor.md` already settled this shape
 * for quick scan and deep analysis: the trigger is a message, the RESULT travels back through
 * storage with `liveUpdate: true`, and no response payload is needed.
 */
export const RUN_SITE_POLICY_ANALYSIS_MESSAGE = 'unshafted/run-site-policy-analysis';

export type SitePolicyAnalysisTarget = {
  domain: string;
  /** The document's absolute URL, as discovered on the page. */
  sourceUrl: string;
  docType: PolicyDocType;
  /** Normalized text, captured in the panel from the user's own session (AD-4). */
  text: string;
  /** `sha256` of `text` — computed at capture, so the local analysis is keyed like a corpus one. */
  contentHash: string;
};

export type RunSitePolicyAnalysisRequest = {
  type: typeof RUN_SITE_POLICY_ANALYSIS_MESSAGE;
  targets: SitePolicyAnalysisTarget[];
};

// ── Run state (the panel's view of a run happening in the service worker) ──

/**
 * Progress for one user-initiated run, written by the service worker and read by the panel.
 *
 * The panel cannot hold this itself: the run outlives the panel by design, so the only place the
 * state can live is where the run does. `liveUpdate: true` storage pushes each change back.
 *
 * `failures` and `overBudget` are separate because they are different conversations. A failed
 * document is one we could not analyse; an over-budget save is one we analysed — and the user
 * paid for — and then could not keep. The second needs the user to free space, and S8 forbids us
 * from quietly making it for them.
 */
export type SitePolicyRunState = {
  status: 'idle' | 'running' | 'complete';
  /** The domain the run belongs to, so a panel on a different site ignores it. */
  domain: string | null;
  startedAt: string | null;
  total: number;
  completed: number;
  /** The document currently in flight, for the progress line. */
  currentUrl: string | null;
  failures: { sourceUrl: string; message: string }[];
  /** `sourceUrl` so the panel can name the document the user paid for and could not keep. */
  overBudget: { sourceUrl: string; bytes: number; budgetBytes: number } | null;
};

export const IDLE_SITE_POLICY_RUN: SitePolicyRunState = {
  status: 'idle',
  domain: null,
  startedAt: null,
  total: 0,
  completed: 0,
  currentUrl: null,
  failures: [],
  overBudget: null,
};
