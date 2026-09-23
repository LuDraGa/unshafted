import { formatAnalysedDate } from '@src/lib/presentation';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';
import type { ReactNode } from 'react';

const latestAnalysedAt = (analyses: readonly SitePolicyAnalysis[]): string =>
  analyses.reduce((latest, analysis) => (analysis.analyzedAt > latest ? analysis.analyzedAt : latest), '');

/**
 * The rollup, as the header's meta line rather than a pill of its own. It describes the title — the
 * site — so it goes where a reader looks for that, and the screen loses one block that was only
 * ever competing with the verdict under it.
 *
 * "Last read on" names the most recent read, which is exactly the date it shows — documents on one
 * site can be read on different days, and each one's own date is in its Documents-lens block.
 */
const FRESHNESS_META: Record<DocumentFreshness, (analyses: readonly SitePolicyAnalysis[]) => string> = {
  pending: () => 'Checking against the live page…',
  current: () => 'Current — verified against the live page',
  changed: () => 'Changed since we read it',
  unconfirmed: analyses => `Last read on ${formatAnalysedDate(latestAnalysedAt(analyses))}`,
};

export const SiteMeta = ({
  analyses,
  state,
  grade,
}: {
  analyses: readonly SitePolicyAnalysis[];
  state: DocumentFreshness;
  /** The site's grade (`RiskGrade`). Leads the line, as it does on a local result (`LocalMeta`). */
  grade?: ReactNode;
}) => (
  /*
   * The dots between items are CSS (`.panel-meta > :not(:last-child)::after`), trailing each item
   * rather than leading the next, so a wrapped line never starts with one. The spaces between the
   * spans render as nothing — the meta line is a flex row spaced by `column-gap` — and exist for the
   * accessible text: without them neighbouring items are read aloud as one word, "readLast read on".
   */
  <>
    {grade ? <>{grade} </> : null}
    <span>{analyses.length === 1 ? '1 document read' : `${analyses.length} documents read`}</span>{' '}
    <span data-freshness={state}>{FRESHNESS_META[state](analyses)}</span>
  </>
);
