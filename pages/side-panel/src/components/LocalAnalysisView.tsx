import { RiskGrade } from '@src/components/AnalysisView';
import { LensCard } from '@src/components/LensCard';
import { formatAnalysedDate } from '@src/lib/presentation';
import { useCallback, useMemo } from 'react';
import type { LocalPolicyAnalysis, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * An analysis the user ran, rendered with the corpus layout and a different signature (S3).
 *
 * The layout is deliberately identical — the grade in the header, then the same lenses — because the inner
 * object IS a `SitePolicyAnalysis` and a second visual language for the same findings would be
 * noise. What must never be identical is the attribution, and that is the whole of what this
 * component adds:
 *
 *  - Who ran it, when, on which model, and that we did not review it. `LocalMeta` is the header's
 *    meta line, and the attribution leads it with the grade AFTER it — nobody reads a grade before
 *    learning whose grade it is.
 *  - No freshness claim anywhere. "Last read on" is a claim about us reading the documents, and we
 *    did not; every item gets `null` for the same reason.
 *  - The excerpt caveat (S6), directly under the header rather than inside a document, because it
 *    qualifies every finding below it.
 *  - Each document's own provenance, in its Documents-lens block, so a run on a different model is
 *    still visibly attached to the document it produced (P10).
 *
 * The toolbar badge stays dark for these. It means "we have read this site's policies" and this
 * is not that.
 */

const NO_FRESHNESS = () => null;

/** The header meta line for a site the reader analysed themselves: whose analysis, then its grade (S3). */
export const LocalMeta = ({ analyses }: { analyses: readonly LocalPolicyAnalysis[] }) => {
  const inner = useMemo(() => analyses.map(local => local.analysis), [analyses]);
  const latest = analyses[0];
  if (!latest) return null;

  return (
    <>
      <span>
        Analysed by you on {formatAnalysedDate(latest.provenance.ranAt)} · {latest.provenance.model} · not reviewed by
        Unshafted
      </span>{' '}
      <RiskGrade analyses={inner} />
    </>
  );
};

export const LocalAnalysisView = ({
  analyses,
  headerOffset,
}: {
  analyses: readonly LocalPolicyAnalysis[];
  /** The uncovered view's own header height — this view owns no header of its own. */
  headerOffset: number;
}) => {
  const inner = useMemo(() => analyses.map(local => local.analysis), [analyses]);
  const byHash = useMemo(() => new Map(analyses.map(local => [local.analysis.contentHash, local])), [analyses]);
  const excerptedCount = analyses.filter(local => local.provenance.excerpted).length;

  const provenance = useCallback(
    (analysis: SitePolicyAnalysis) => {
      const local = byHash.get(analysis.contentHash);
      if (!local) return null;
      return (
        <>
          Analysed by you on {formatAnalysedDate(local.provenance.ranAt)} · {local.provenance.model} · not reviewed by
          Unshafted
          {/*
            S6: an excerpted run read part of the document, and a finding drawn from an excerpt
            cannot be told apart from one drawn from the whole document by looking at it.
          */}
          {local.provenance.excerpted ? <> · the model read an excerpt of this document, not the whole of it</> : null}
        </>
      );
    },
    [byHash],
  );

  if (analyses.length === 0) return null;

  return (
    <>
      {excerptedCount > 0 ? (
        <p className="panel-zone panel-quiet">
          {excerptedCount === analyses.length
            ? analyses.length === 1
              ? 'The model read an excerpt of this document, not the whole of it.'
              : 'The model read an excerpt of each of these documents, not the whole of them.'
            : `${excerptedCount} of these ${analyses.length} documents ${excerptedCount === 1 ? 'was' : 'were'} read from an excerpt, not in full. Each document says which.`}
        </p>
      ) : null}

      {/* The grade is in the header's meta line, after the attribution (`LocalMeta`). */}
      <LensCard
        analyses={inner}
        headerOffset={headerOffset}
        readBy="you"
        freshnessOf={NO_FRESHNESS}
        provenance={provenance}
      />
    </>
  );
};
