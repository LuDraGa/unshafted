import type { SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * What the panel leads with (D10).
 *
 * Everything here is a pure function of the bundled analyses, which is what lets the first paint
 * happen with zero network and no page access. Nothing in this file may reach for the live page.
 *
 * The "one thing" that used to live here — a deadline if the domain has one, otherwise the
 * highest-severity exposure — is now `pickInitialLens` in `lenses.ts`, and it is delivered as the
 * first block of that lens, already open. The rule it encoded survives there intact: a window
 * outranks any exposure because it is the only finding that expires, and `kind: 'none'` is not a
 * window.
 */

/** The document that earned the domain's worst-of risk level (D1), named so the claim is checkable. */
export const worstDocument = (analyses: readonly SitePolicyAnalysis[]): SitePolicyAnalysis | null =>
  analyses[0] ?? null;
