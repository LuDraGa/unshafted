import { RISK_TONE } from '@extension/ui';
import { domainRiskSummary } from '@extension/unshafted-core';
import { worstDocument } from '@src/lib/domain-summary';
import { DOC_TYPE_LABELS } from '@src/lib/presentation';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';

/**
 * The headline read of a set of analyses, shared by the corpus view, the local one and browse.
 *
 * It used to be two — this verdict and a "one thing" card beneath it. The one thing (a window if
 * the site names one, otherwise the highest-severity exposure) is now the first block of the lens
 * the reader lands on, already open; see `pickInitialLens`. Same content, one card fewer, and no
 * second bordered surface competing with the verdict for the top of the screen.
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

  const read = readBy === 'you' ? 'you analysed' : 'we read';
  const earnedBy = DOC_TYPE_LABELS[worst.docType].toLowerCase();

  /*
   * A tag and a sentence, not a card. The grade used to be a tinted block of its own — 20px type,
   * 14px padding — and it cost the findings a sixth of the first screen to say one word. The tag
   * keeps everything that made it the grade: the level in words, the full `RISK_TONE` fill and 1px
   * border (P5), and its place directly under the title, where the site's name and its grade read
   * as one line of identity. The sentence stays, because naming the document that earned the grade
   * is what makes the claim checkable (D1).
   *
   * It sits under the header's meta line, never beside the title: on a local result that line is
   * the attribution, and nobody reads a grade before learning whose grade it is (S3).
   */
  return (
    <section className="panel-verdict">
      <p className="panel-verdict-line">
        <span className={`panel-verdict-tag ${RISK_TONE[summary.riskLevel]}`}>{summary.riskLevel} risk</span>{' '}
        {summary.documentCount === 1
          ? `Earned by the ${earnedBy}, the one document ${read} here.`
          : `The worst of ${summary.documentCount} documents ${read} here, earned by the ${earnedBy}.`}
      </p>
      {/*
        Open Q4: the grade still comes from the bundled worst-of even when that very document has
        moved. Rather than degrade the badge silently, say so — the reader can then weigh it.
      */}
      {freshness[worst.contentHash] === 'changed' ? (
        <p className="panel-verdict-caveat">
          That document has changed since we read it, so treat this grade as being about the earlier version.
        </p>
      ) : null}
    </section>
  );
};
