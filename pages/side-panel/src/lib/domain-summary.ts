import type { AvailableAction, Exposure, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * What the panel leads with (D10).
 *
 * Everything here is a pure function of the bundled analyses, which is what lets the first paint
 * happen with zero network and no page access. Nothing in this file may reach for the live page.
 *
 * The ordering argument, restated because it is easy to undo: the `summary` field is prose ABOUT
 * a document, and an exposure is a fact about the READER. 82 documents carry 682 exposures — the
 * reason a person opened the panel is somewhere in that list, not in a paragraph describing the
 * document's general character.
 */

type PolicyDeadline = NonNullable<AvailableAction['deadline']>;

const SEVERITY_RANK: Record<Exposure['severity'], number> = { low: 0, medium: 1, high: 2 };

/**
 * The single most important thing on this domain.
 *
 * A deadline outranks any exposure, however severe, because it is the only finding that expires.
 * An arbitration opt-out window a reader learns about too late was worth nothing; a licence term
 * they learn about late is still true tomorrow.
 *
 * `kind: 'none'` is not a deadline. It exists for actions whose timing is described but
 * unbounded, and treating it as a clock would put "you can leave at any time" above a
 * high-severity exposure.
 */
export type OneThing =
  | {
      kind: 'deadline';
      analysis: SitePolicyAnalysis;
      action: AvailableAction;
      /** Carried separately so the renderer never has to assert that an optional field is set. */
      deadline: PolicyDeadline;
    }
  | { kind: 'exposure'; analysis: SitePolicyAnalysis; exposure: Exposure };

export const selectOneThing = (analyses: readonly SitePolicyAnalysis[]): OneThing | null => {
  // `analyses` arrives worst-document-first, so first-match is already the right tie-break.
  for (const analysis of analyses) {
    for (const action of analysis.availableActions) {
      const deadline = action.deadline;
      if (deadline && deadline.kind !== 'none') return { kind: 'deadline', analysis, action, deadline };
    }
  }

  let best: { analysis: SitePolicyAnalysis; exposure: Exposure } | null = null;
  for (const analysis of analyses) {
    for (const exposure of analysis.exposures) {
      if (!best || SEVERITY_RANK[exposure.severity] > SEVERITY_RANK[best.exposure.severity]) {
        best = { analysis, exposure };
      }
    }
  }

  return best ? { kind: 'exposure', ...best } : null;
};

/** The document that earned the domain's worst-of risk level (D1), named so the claim is checkable. */
export const worstDocument = (analyses: readonly SitePolicyAnalysis[]): SitePolicyAnalysis | null =>
  analyses[0] ?? null;
