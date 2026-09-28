import { RISK_TONE } from '@extension/ui';
import { domainRiskSummary } from '@extension/unshafted-core';
import { worstDocument } from '@src/lib/domain-summary';
import { DOC_TYPE_LABELS, SOURCE_TAG } from '@src/lib/presentation';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';
import type { ResultSource } from '@src/lib/presentation';

/**
 * The headline read of a set of analyses — the grade — shared by the corpus view, the local one and
 * browse.
 *
 * It used to be two cards — a tinted verdict and a "one thing" beneath it. The one thing (a window
 * if the site names one, otherwise the highest-severity exposure) is now the first block of the lens
 * the reader lands on, already open; see `pickInitialLens`. The verdict is now a tag in the header's
 * meta line, beside the facts about the same site it grades.
 *
 * They live here rather than in `SidePanel.tsx` because Part 6 gives the panel a second source of
 * `SitePolicyAnalysis` objects — ones the user ran on their own key — and the inner shape is
 * identical by design (S2). Duplicating the rendering would mean the local view drifts from the
 * corpus view every time one of them is touched, on the surface where the difference between the
 * two is supposed to be the *attribution*, not the layout.
 */

/**
 * The grade, as the header's meta line carries it: the level as a tag, and the document that earned
 * it. The tag keeps everything that made the old card the grade — the level in words, the full
 * `RISK_TONE` fill and 1px border (P5) — and loses only the card, which spent a sixth of the first
 * screen saying one word. Naming the document stays, because that is what makes a worst-of grade
 * checkable (D1).
 *
 * In the header it is sticky, so the grade stays in view while the reader is deep in the findings
 * it summarises.
 *
 * It leads the meta line on every view. On a local result the rest of that same line says who ran
 * it and that we did not review it — S3 as revised; see `LocalMeta`.
 */
export const RiskGrade = ({ analyses }: { analyses: readonly SitePolicyAnalysis[] }) => {
  const summary = domainRiskSummary(analyses);
  const worst = worstDocument(analyses);
  if (!summary || !worst) return null;

  return (
    <span className="panel-meta-grade">
      <span className={`panel-verdict-tag ${RISK_TONE[summary.riskLevel]}`}>{summary.riskLevel} risk</span> earned by
      the {DOC_TYPE_LABELS[worst.docType].toLowerCase()}
    </span>
  );
};

/** The source tag that closes the meta line: ours, or a run on the reader's own key. */
export const SourceTag = ({ source }: { source: ResultSource }) => (
  <span className={`panel-verdict-tag ${SOURCE_TAG[source].tone}`}>{SOURCE_TAG[source].label}</span>
);

/**
 * Open Q4: the grade still comes from the bundled worst-of even when that very document has moved.
 * Rather than degrade the tag silently, say so — the reader can then weigh it. Only on the covered
 * view, the one place a live check runs; it renders nothing anywhere else.
 */
export const GradeCaveat = ({
  analyses,
  freshness,
}: {
  analyses: readonly SitePolicyAnalysis[];
  freshness: Record<string, DocumentFreshness>;
}) => {
  const worst = worstDocument(analyses);
  if (!worst || freshness[worst.contentHash] !== 'changed') return null;

  return (
    <p className="panel-zone panel-grade-caveat">
      The document that earned this grade, the {DOC_TYPE_LABELS[worst.docType].toLowerCase()}, has changed since we read
      it, so treat the grade as being about the earlier version.
    </p>
  );
};
