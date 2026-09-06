import type { Exposure, PolicyDocType, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * The vocabulary the panel uses to talk about an analysis.
 *
 * Ported wholesale from the popup's `SitePolicyPanel` rather than rewritten: the tone maps and
 * `describeDeadline` were reviewed and are correct, and the panel replacing that surface is not
 * a reason to re-derive them. What changed is `DOC_TYPE_LABELS`, which the popup version left at
 * the original six types — the Part 3 capture added four more, and an unlabelled doc type
 * renders as `undefined` in a heading.
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

export const RISK_TONE: Record<SitePolicyAnalysis['riskLevel'], string> = {
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  Medium: 'border-amber-200 bg-amber-50 text-amber-900',
  High: 'border-orange-200 bg-orange-50 text-orange-900',
  'Very High': 'border-rose-200 bg-rose-50 text-rose-900',
};

export const SEVERITY_TONE: Record<Exposure['severity'], string> = {
  low: 'bg-stone-100 text-stone-700',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-rose-100 text-rose-900',
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
