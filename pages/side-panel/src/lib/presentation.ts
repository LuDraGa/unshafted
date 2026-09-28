import type { Exposure, PolicyDocType, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * The vocabulary the panel uses to talk about an analysis.
 *
 * Ported wholesale from the popup's `SitePolicyPanel` rather than rewritten: `SEVERITY_TONE` and
 * `describeDeadline` were reviewed and are correct, and the panel replacing that surface is not
 * a reason to re-derive them. What changed is `DOC_TYPE_LABELS`, which the popup version left at
 * the original six types — the Part 3 capture added four more, and an unlabelled doc type
 * renders as `undefined` in a heading.
 *
 * Risk tone is deliberately NOT here. It grades the same four levels on four other surfaces, so
 * it lives in `@extension/ui` where every page can reach one copy of it — see `risk-tone.ts` and
 * #82.
 */

export const DOC_TYPE_LABELS: Record<PolicyDocType, string> = {
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  cookie: 'Cookie policy',
  eula: 'End user licence',
  acceptable_use: 'Acceptable use policy',
  data_processing: 'Data processing terms',
  regulatory_disclosure: 'Regulatory disclosure',
  copyright: 'Copyright policy',
  program_terms: 'Program terms',
  esign_consent: 'Electronic disclosure consent',
};

export const SEVERITY_TONE: Record<Exposure['severity'], string> = {
  low: 'bg-[var(--unshafted-severity-low-bg)] text-[var(--unshafted-severity-low-text)]',
  medium: 'bg-[var(--unshafted-severity-medium-bg)] text-[var(--unshafted-severity-medium-text)]',
  high: 'bg-[var(--unshafted-severity-high-bg)] text-[var(--unshafted-severity-high-text)]',
};

/**
 * Who stands behind a result — the tag that closes the header's meta line. One map so the corpus and
 * local views cannot drift in label or tone; `SourceTag` renders it.
 *
 * Deliberately off the risk ramp: rose grades, and this tags. The corpus tag wears the brand's
 * dark-and-amber; the local one is grey, because it is a read we did not review.
 */
export type ResultSource = 'corpus' | 'local';

export const SOURCE_TAG: Record<ResultSource, { label: string; tone: string }> = {
  corpus: { label: 'Unshafted', tone: 'border-amber-500/70 bg-zinc-950 text-amber-300 shadow-sm shadow-amber-500/20' },
  local: { label: 'Local Review', tone: 'border-zinc-400 bg-zinc-200 text-zinc-700' },
};

/**
 * Deadlines render as the WINDOW a policy grants, never as a countdown.
 *
 * A countdown needs the date the user accepted, which the extension does not know and must not
 * guess — a confident "18 days left" that is actually 0 is worse than no number at all.
 *
 * CHANGED FROM THE POPUP VERSION, on evidence. The popup rendered a `relative_to_signup` deadline
 * as "N days from when you accepted", which reads as a fact about the reader's own clock. Against
 * the real corpus that anchor is wrong for 23 of the 30 deadlines it fires on: pass 1 used
 * `relative_to_signup` for any window measured from *some* event, and the events are a coupon's
 * generation, a statement being made available, a notice of dispute being served, the harm
 * occurring. x.com's one-year claim window runs from the event, not from signup, and telling a
 * reader otherwise is the same class of error as a false countdown — just one level up.
 *
 * So the day count stays (it is real and it is useful) and the invented anchor goes. The
 * `description` is the analyst's own wording and always says what the clock actually runs from.
 */
export const describeDeadline = (deadline: NonNullable<SitePolicyAnalysis['availableActions'][number]['deadline']>) =>
  deadline.kind === 'relative_to_signup' && deadline.days
    ? `Window: ${deadline.days} days — ${deadline.description}`
    : `Window: ${deadline.description}`;

/** "4 Sep 2026". Day-first because the panel writes dates into sentences, not into tables. */
export const formatAnalysedDate = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** `https://www.example.com/legal/privacy?x=1` → `www.example.com/legal/privacy`, for display. */
export const shortenUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
};

/** A filename a person can find again in their Downloads folder six months from now. */
export const downloadFilename = (domain: string, docType: PolicyDocType, hash: string): string =>
  `${domain}-${docType}-${hash.slice(0, 8)}.txt`;
