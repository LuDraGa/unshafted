import { domainRiskSummary } from '@extension/unshafted-core';
import { selectOneThing, worstDocument } from '@src/lib/domain-summary';
import { DOC_TYPE_LABELS, RISK_TONE, describeDeadline } from '@src/lib/presentation';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';

/**
 * The two headline reads of a set of analyses, shared by the corpus view and the local one.
 *
 * They live here rather than in `SidePanel.tsx` because Part 6 gives the panel a second source of
 * `SitePolicyAnalysis` objects — ones the user ran on their own key — and the inner shape is
 * identical by design (S2). Duplicating the rendering would mean the local view drifts from the
 * corpus view every time one of them is touched, on the surface where the difference between the
 * two is supposed to be the *attribution*, not the layout.
 *
 * `FreshnessStrip` deliberately did NOT come along. It is a claim about us reading the live page,
 * and S3 is explicit that it does not apply to an analysis the user ran themselves.
 */

/**
 * Who read the documents. The corpus default is the only wording the covered view ever used;
 * the local view passes `you` because saying "we read" about a run on the user's own key would
 * attribute their analysis to us — the exact claim S3 exists to prevent.
 */
export type ReadBy = 'unshafted' | 'you';

export const WorstRisk = ({
  analyses,
  freshness,
  readBy = 'unshafted',
}: {
  analyses: readonly SitePolicyAnalysis[];
  freshness: Record<string, DocumentFreshness>;
  readBy?: ReadBy;
}) => {
  const summary = domainRiskSummary(analyses);
  const worst = worstDocument(analyses);
  if (!summary || !worst) return null;

  return (
    <section className={`panel-verdict ${RISK_TONE[summary.riskLevel]}`}>
      <p className="m-0 text-lg font-semibold leading-tight tracking-tight">{summary.riskLevel} risk</p>
      <p className="m-0 mt-1 text-xs leading-relaxed">
        The worst of {summary.documentCount === 1 ? 'the one document' : `${summary.documentCount} documents`}{' '}
        {readBy === 'you' ? 'you analysed' : 'we read'} here. Earned by the{' '}
        {DOC_TYPE_LABELS[worst.docType].toLowerCase()}.
      </p>
      {/*
        Open Q4: the grade still comes from the bundled worst-of even when that very document has
        moved. Rather than degrade the badge silently, say so — the reader can then weigh it.
      */}
      {freshness[worst.contentHash] === 'changed' ? (
        <p className="m-0 mt-1 text-[11px] font-semibold">
          That document has changed since we read it, so treat this grade as being about the earlier version.
        </p>
      ) : null}
    </section>
  );
};

export const OneThing = ({ analyses }: { analyses: readonly SitePolicyAnalysis[] }) => {
  const one = selectOneThing(analyses);
  if (!one) return null;

  return (
    <section className="panel-one-thing">
      <p className="panel-eyebrow">{one.kind === 'deadline' ? 'On a clock' : 'The one thing'}</p>
      {one.kind === 'deadline' ? (
        <>
          <p className="m-0 text-sm font-semibold leading-snug text-[var(--unshafted-text)]">{one.action.action}</p>
          <p className="m-0 mt-1 text-xs font-semibold text-violet-700">{describeDeadline(one.deadline)}</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{one.action.howTo}</p>
        </>
      ) : (
        <>
          <p className="m-0 text-sm font-semibold leading-snug text-[var(--unshafted-text)]">{one.exposure.title}</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            {one.exposure.whatItMeans}
          </p>
        </>
      )}
      <p className="m-0 mt-1.5 text-[10px] uppercase tracking-wide text-[var(--unshafted-text-faint)]">
        From the {DOC_TYPE_LABELS[one.analysis.docType].toLowerCase()}
      </p>
    </section>
  );
};
