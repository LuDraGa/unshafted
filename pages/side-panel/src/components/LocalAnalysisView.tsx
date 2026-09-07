import { OneThing, WorstRisk } from '@src/components/AnalysisView';
import { DocumentCard } from '@src/components/DocumentCard';
import { formatAnalysedDate } from '@src/lib/presentation';
import type { LocalPolicyAnalysis } from '@extension/unshafted-core';

/**
 * An analysis the user ran, rendered with the corpus layout and a different signature (S3).
 *
 * The layout is deliberately identical — risk level, the one thing, per-document cards — because
 * the inner object IS a `SitePolicyAnalysis` and a second visual language for the same findings
 * would be noise. What must never be identical is the attribution, and that is the whole of what
 * this component adds:
 *
 *  - The line saying who ran it, when, on which model, and that we did not review it. It sits
 *    ABOVE the risk verdict, so nobody reads a grade before learning whose grade it is.
 *  - No freshness strip. "As we read it" is a claim about us reading the live page, and we did
 *    not; the per-document cards are passed `null` for the same reason.
 *  - The excerpt caveat (S6), next to the attribution rather than buried in a card, because it
 *    qualifies every finding below it.
 *
 * The toolbar badge stays dark for these. It means "we have read this site's policies" and this
 * is not that.
 */

const AttributionLine = ({ local }: { local: LocalPolicyAnalysis }) => (
  <p className="m-0 text-[11px] leading-relaxed text-[var(--unshafted-text-muted)]">
    Analysed by you on {formatAnalysedDate(local.provenance.ranAt)} · {local.provenance.model} · not reviewed by
    Unshafted
    {/*
      S6: an excerpted run read part of the document. Saying so next to the model name is the
      only place a reader sees it before the findings, and a finding drawn from an excerpt cannot
      be told apart from one drawn from the whole document by looking at it.
    */}
    {local.provenance.excerpted ? (
      <>
        <br />
        The model read an excerpt of this document, not the whole of it.
      </>
    ) : null}
  </p>
);

export const LocalAnalysisView = ({ analyses }: { analyses: readonly LocalPolicyAnalysis[] }) => {
  if (analyses.length === 0) return null;

  const inner = analyses.map(local => local.analysis);
  const excerptedCount = analyses.filter(local => local.provenance.excerpted).length;
  const latest = analyses[0]!;

  return (
    <>
      <section className="panel-one-thing">
        <p className="panel-eyebrow">Your analysis</p>
        <AttributionLine local={latest} />
        {/*
          One run can cover several documents on different models only if the user changed the
          setting between runs, so the headline line names the most recent and this counts the
          rest. Every card carries its own line underneath.
        */}
        {analyses.length > 1 ? (
          <p className="m-0 mt-1 text-[11px] leading-relaxed text-[var(--unshafted-text-faint)]">
            {analyses.length} documents analysed
            {excerptedCount > 0 ? `, ${excerptedCount} of them from an excerpt` : ''}. Each card says when it ran.
          </p>
        ) : null}
      </section>

      {/* No freshness record: nothing here was checked against the live page. */}
      <WorstRisk analyses={inner} freshness={{}} readBy="you" />
      <OneThing analyses={inner} />

      <section className="panel-group">
        <p className="panel-eyebrow">Every document</p>
        {analyses.map(local => (
          <div key={local.analysis.contentHash} className="flex flex-col gap-1">
            <DocumentCard analysis={local.analysis} freshness={null} />
            <AttributionLine local={local} />
          </div>
        ))}
      </section>
    </>
  );
};
