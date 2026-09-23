import { formatAnalysedDate } from '@src/lib/presentation';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';

const latestAnalysedAt = (analyses: readonly SitePolicyAnalysis[]): string =>
  analyses.reduce((latest, analysis) => (analysis.analyzedAt > latest ? analysis.analyzedAt : latest), '');

/**
 * The rollup, as the header's meta line rather than a pill of its own. It describes the title — the
 * site — so it goes where a reader looks for that, and the screen loses one block that was only
 * ever competing with the verdict under it.
 */
const FRESHNESS_META: Record<DocumentFreshness, (analyses: readonly SitePolicyAnalysis[]) => string> = {
  pending: () => 'Checking against the live page…',
  current: () => 'Current — verified against the live page',
  changed: () => 'Changed since we read it',
  unconfirmed: analyses =>
    `As we read ${analyses.length === 1 ? 'it' : 'them'} on ${formatAnalysedDate(latestAnalysedAt(analyses))}`,
};

export const SiteMeta = ({
  analyses,
  state,
}: {
  analyses: readonly SitePolicyAnalysis[];
  state: DocumentFreshness;
}) => (
  <>
    <span>{analyses.length === 1 ? '1 document read' : `${analyses.length} documents read`}</span>
    {/*
      The spaces are for the accessible text, not the layout — the meta line is a flex row and
      spaces its children with `column-gap`, so these render as nothing. Without them the two
      halves are read aloud as one word: "readAs we read them".
    */}{' '}
    <span className="panel-meta-sep" aria-hidden="true">
      ·
    </span>{' '}
    <span data-freshness={state}>{FRESHNESS_META[state](analyses)}</span>
  </>
);
